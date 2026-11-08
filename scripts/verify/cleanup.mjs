// verify-game Cleanup (#31): stops only what verify:launch recorded in verification/.run/ (never by process name),
// stops the Docker server only if this harness started it, deletes verification/.run/, and keeps all evidence.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_JSON,
  COMPOSE_PROJECT,
  ROOT,
  SERVER_JSON,
  isAlive,
  readJson,
  removeRunDir,
  sleep,
} from './lib.mjs';

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

const client = readJson(CLIENT_JSON);
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
  console.warn('verify:cleanup: no client recorded');
}

const server = readJson(SERVER_JSON);
if (server?.reused === false) {
  const nodeVersion = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
  console.warn(`verify:cleanup: docker compose -p ${COMPOSE_PROJECT} down`);
  const down = spawnSync('docker', ['compose', '-p', server.project ?? COMPOSE_PROJECT, 'down'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_VERSION: nodeVersion },
  });
  if (down.status !== 0) console.error('verify:cleanup: docker compose down failed');
} else if (server?.reused) {
  console.warn('verify:cleanup: the server was reused, not started here: left running');
}

removeRunDir();
console.warn('verify:cleanup: removed verification/.run/; evidence folders are untouched');
