// verify-game Launch (#31): serves the client on the fixed port 5180 in `--mode e2e`, records what it started in
// verification/.run/, and waits until the game itself is ready (`__vsTest.snapshot()` reports `ready` and `gl`).
// `--with-server` also makes sure the Docker server answers /healthz, reusing a running one.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_JSON,
  COMPOSE_PROJECT,
  PORT,
  ROOT,
  RUN_DIR,
  SERVER_HEALTH_URL,
  SERVER_JSON,
  VITE_LOG,
  gitRev,
  httpOk,
  isAlive,
  logTail,
  portInUse,
  probeGame,
  readJson,
  removeRunDir,
  sleep,
  writeJson,
} from './lib.mjs';

const READY_TIMEOUT_MS = 30_000;
const SERVER_TIMEOUT_MS = 180_000;
const withServer = process.argv.includes('--with-server');
const isWindows = process.platform === 'win32';

function fail(message) {
  console.error(`verify:launch: ${message}`);
  process.exit(1);
}

function killTree(pid) {
  if (!isAlive(pid)) return;
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
    else process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

if (await portInUse(PORT)) fail(`port ${PORT} is in use: run \`pnpm verify:cleanup\` or free it`);
const previous = readJson(CLIENT_JSON);
if (previous && isAlive(previous.pid))
  fail(`a previous run (pid ${previous.pid}) is still recorded: run \`pnpm verify:cleanup\` first`);
mkdirSync(RUN_DIR, { recursive: true });

// Server first, so a failure here leaves no client process behind.
if (withServer) {
  if (await httpOk(SERVER_HEALTH_URL)) {
    writeJson(SERVER_JSON, { reused: true, url: SERVER_HEALTH_URL });
    console.warn(`verify:launch: reusing the server already answering ${SERVER_HEALTH_URL}`);
  } else {
    if (!existsSync(join(ROOT, 'compose.yaml')))
      fail('no compose.yaml: the server arrives with #4');
    if (!existsSync(join(ROOT, '.env')))
      fail('no .env: run `cp .env.example .env` once (compose.yaml reads it)');
    const nodeVersion = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    // Recorded before starting, so cleanup removes a half-started project too.
    writeJson(SERVER_JSON, { reused: false, project: COMPOSE_PROJECT });
    console.warn(
      `verify:launch: starting the server: docker compose -p ${COMPOSE_PROJECT} up -d --build server`,
    );
    const up = spawnSync(
      'docker',
      ['compose', '-p', COMPOSE_PROJECT, 'up', '-d', '--build', 'server'],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, NODE_VERSION: nodeVersion },
      },
    );
    if (up.status !== 0)
      fail('docker compose up failed; run `pnpm verify:cleanup`, then see the dev-server skill');
    const deadline = Date.now() + SERVER_TIMEOUT_MS;
    while (!(await httpOk(SERVER_HEALTH_URL))) {
      if (Date.now() > deadline)
        fail(
          `${SERVER_HEALTH_URL} did not answer within ${SERVER_TIMEOUT_MS / 1000} s; run \`pnpm verify:cleanup\``,
        );
      await sleep(1000);
    }
    console.warn(`verify:launch: server ok (${SERVER_HEALTH_URL})`);
  }
}

const url = `http://localhost:${PORT}/`;
const log = openSync(VITE_LOG, 'w');
const child = spawn(
  'pnpm',
  ['--filter', 'client', 'exec', 'vite', '--mode', 'e2e', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, detached: true, stdio: ['ignore', log, log], shell: isWindows },
);
child.unref();
const rev = gitRev();
writeJson(CLIENT_JSON, {
  pid: child.pid,
  port: PORT,
  url,
  rev,
  startedAt: new Date().toISOString(),
});

const deadline = Date.now() + READY_TIMEOUT_MS;
while (!(await httpOk(url, 1000))) {
  if (Date.now() > deadline || !isAlive(child.pid)) break;
  await sleep(250);
}
const { snapshot, error } = await probeGame(url, Math.max(1000, deadline - Date.now()));
if (!snapshot?.ready || snapshot.renderer !== 'gl') {
  console.error(
    `verify:launch: the game was not ready within ${READY_TIMEOUT_MS / 1000} s: ${error}`,
  );
  console.error('--- Vite log tail ---');
  console.error(logTail(VITE_LOG));
  killTree(child.pid);
  if (!readJson(SERVER_JSON)) removeRunDir();
  else console.error('verify:launch: the server is still recorded: run `pnpm verify:cleanup`');
  process.exit(1);
}
console.warn(
  `verify:launch: ready at ${url} (pid ${child.pid}, rev ${rev.slice(0, 12)}, renderer ${snapshot.renderer})`,
);
