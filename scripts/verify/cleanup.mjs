// verify-game Cleanup (#31): stops only what verify:launch recorded for `VERIFY_PORT` (default 5180, #146) in
// verification/.verify-run-<port>.json (never by process name), stops the Docker server only if this port's launch owns
// it and no other port still uses it (#161), deletes only that port's record and log, and keeps all evidence and every
// other port's record.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  COMPOSE_PROJECT,
  ROOT,
  isAlive,
  readRecord,
  recordPath,
  releaseServer,
  removeRecord,
  sleep,
  verifyPortOrExit,
} from './lib.mjs';

const PORT = verifyPortOrExit('verify:cleanup');
const record = readRecord(PORT);

const isWindows = process.platform === 'win32';

/** Signals the recorded process group (launch starts it detached, so the group is pnpm and its Vite child). */
function signal(pid, sig) {
  try {
    if (isWindows)
      spawnSync('taskkill', ['/pid', String(pid), '/T', ...(sig === 'SIGKILL' ? ['/F'] : [])]);
    else process.kill(-pid, sig);
  } catch {
    try {
      process.kill(pid, sig);
    } catch {
      // already gone
    }
  }
}

/**
 * Guards against PID reuse: on POSIX the recorded PID must still be the `vite --port <port> --strictPort` command
 * that launch started. (Windows has no `ps`; there the recorded PID is trusted.)
 */
function isOurProcess(pid, port) {
  if (isWindows) return true;
  const ps = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  const command = ps.stdout ?? '';
  return (
    command.includes('vite') &&
    command.includes(`--port ${String(port)}`) &&
    command.includes('--strictPort')
  );
}

const client = record.client;
if (client && Number.isInteger(client.pid)) {
  if (isAlive(client.pid) && !isOurProcess(client.pid, client.port)) {
    console.warn(
      `verify:cleanup: pid ${client.pid} is no longer the Vite server launch started; not killing it`,
    );
  } else if (isAlive(client.pid)) {
    signal(client.pid, 'SIGTERM');
    for (let i = 0; i < 20 && isAlive(client.pid); i++) await sleep(250);
    if (isAlive(client.pid)) signal(client.pid, 'SIGKILL');
    console.warn(
      `verify:cleanup: stopped pid ${client.pid} (${isAlive(client.pid) ? 'STILL ALIVE' : 'gone'})`,
    );
  } else {
    console.warn(`verify:cleanup: pid ${client.pid} was already gone`);
  }
} else {
  console.warn(`verify:cleanup: no client recorded for port ${PORT}`);
}

const server = record.server;
// The server (#161): only its owner stops it, and only once no other port's launch still uses it; otherwise
// ownership passes to the lowest remaining port. A server not started by verify:launch is never touched.
const release = releaseServer(PORT, server);
if (release.action === 'down') {
  const nodeVersion = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
  console.warn(
    `verify:cleanup: last user of the ${COMPOSE_PROJECT} server: docker compose -p ${COMPOSE_PROJECT} down`,
  );
  const down = spawnSync('docker', ['compose', '-p', COMPOSE_PROJECT, 'down'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_VERSION: nodeVersion },
  });
  if (down.status !== 0) console.error('verify:cleanup: docker compose down failed');
} else if (release.action === 'handOver') {
  console.warn(
    `verify:cleanup: the ${COMPOSE_PROJECT} server is still used by port ${release.to}: left running, port ${release.to} owns it now`,
  );
} else if (server?.project === COMPOSE_PROJECT) {
  console.warn(
    `verify:cleanup: the ${COMPOSE_PROJECT} server is shared and not owned by port ${PORT}: left running`,
  );
} else if (server) {
  console.warn('verify:cleanup: the server was not started by verify:launch: left running');
}

removeRecord(PORT);
console.warn(
  `verify:cleanup: removed ${relative(ROOT, recordPath(PORT))}; evidence folders and other ports' records are untouched`,
);
