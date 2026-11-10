// verify-game Launch (#31): serves the client in `--mode e2e` on `VERIFY_PORT` (default 5180, #146), records what it
// started in verification/.verify-run-<port>.json, and waits until the game itself is ready (`__vsTest.snapshot()`
// reports `ready` and `gl`). `--with-server` also makes sure the Docker server answers /healthz, reusing a running one
// and recording whether this launch owns it (#161).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPOSE_PROJECT,
  addServerUser,
  composeProjectRunning,
  DEFAULT_PORT,
  ROOT,
  SERVER_HEALTH_URL,
  VERIFICATION_DIR,
  gitRev,
  httpOk,
  isAlive,
  logTail,
  ownsServer,
  portInUse,
  probeGame,
  readRecord,
  recordPath,
  removeRecord,
  sleep,
  updateRecord,
  verifyPortOrExit,
  viteLogPath,
} from './lib.mjs';

const READY_TIMEOUT_MS = 30_000;
const SERVER_TIMEOUT_MS = 180_000;
const withServer = process.argv.includes('--with-server');
const PORT = verifyPortOrExit('verify:launch');
const VITE_LOG = viteLogPath(PORT);
const portEnv = PORT === DEFAULT_PORT ? '' : `VERIFY_PORT=${PORT} `;
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

async function waitForServer() {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (!(await httpOk(SERVER_HEALTH_URL))) {
    if (Date.now() > deadline)
      fail(
        `${SERVER_HEALTH_URL} did not answer within ${SERVER_TIMEOUT_MS / 1000} s; run \`${portEnv}pnpm verify:cleanup\``,
      );
    await sleep(1000);
  }
  console.warn(`verify:launch: server ok (${SERVER_HEALTH_URL})`);
}

if (await portInUse(PORT))
  fail(
    `port ${PORT} is in use: run \`${portEnv}pnpm verify:cleanup\` or free it, or pick another port with VERIFY_PORT`,
  );
const previous = readRecord(PORT).client;
if (previous && isAlive(previous.pid))
  fail(
    `a previous run (pid ${previous.pid}) is still recorded in ${recordPath(PORT)}: run \`${portEnv}pnpm verify:cleanup\` first`,
  );
mkdirSync(VERIFICATION_DIR, { recursive: true });

// Server first, so a failure here leaves no client process behind.
if (withServer) {
  // The server's Origin allow-list lives in the user's .env; this script only says what to add, never edits it.
  if (PORT !== DEFAULT_PORT)
    console.warn(
      `verify:launch: port ${PORT} is not ${DEFAULT_PORT}: add http://localhost:${PORT} to ALLOWED_ORIGINS in .env (then restart the server) for versus journeys`,
    );
  // Ownership (#161): only the launch that creates the `vs-verify` containers owns them (`owner: true`). A launch that
  // finds them running shares them and joins the users list, so the owner's cleanup keeps them up for it; a server
  // started outside verify:launch (`pnpm server:up`) is never recorded with a project and never stopped.
  if (composeProjectRunning() && ownsServer(readRecord(PORT).server)) {
    // A run on this port that never cleaned up started it: this port still owns it.
    console.warn(`verify:launch: ${COMPOSE_PROJECT} is still owned by this port's earlier run`);
    await waitForServer();
  } else if (composeProjectRunning()) {
    updateRecord(PORT, {
      server: { reused: true, owner: false, project: COMPOSE_PROJECT, url: SERVER_HEALTH_URL },
    });
    addServerUser(PORT, recordPath(PORT));
    console.warn(
      `verify:launch: sharing the running ${COMPOSE_PROJECT} server; it stays up until its last user cleans up`,
    );
    await waitForServer();
  } else if (await httpOk(SERVER_HEALTH_URL)) {
    updateRecord(PORT, { server: { reused: true, owner: false, url: SERVER_HEALTH_URL } });
    console.warn(
      `verify:launch: reusing the server already answering ${SERVER_HEALTH_URL} (not started by verify:launch, never stopped by it)`,
    );
  } else {
    if (!existsSync(join(ROOT, 'compose.yaml')))
      fail('no compose.yaml: the server arrives with #4');
    if (!existsSync(join(ROOT, '.env')))
      fail('no .env: run `cp .env.example .env` once (compose.yaml reads it)');
    const nodeVersion = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    // Recorded before starting, so cleanup removes a half-started project too.
    updateRecord(PORT, { server: { reused: false, owner: true, project: COMPOSE_PROJECT } });
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
      fail(
        `docker compose up failed; run \`${portEnv}pnpm verify:cleanup\`, then see the dev-server skill`,
      );
    await waitForServer();
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
updateRecord(PORT, {
  client: {
    pid: child.pid,
    port: PORT,
    url,
    rev,
    startedAt: new Date().toISOString(),
  },
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
  if (!readRecord(PORT).server) removeRecord(PORT);
  else
    console.error(
      `verify:launch: the server is still recorded: run \`${portEnv}pnpm verify:cleanup\``,
    );
  process.exit(1);
}
console.warn(
  `verify:launch: ready at ${url} (pid ${child.pid}, rev ${rev.slice(0, 12)}, renderer ${snapshot.renderer})`,
);
