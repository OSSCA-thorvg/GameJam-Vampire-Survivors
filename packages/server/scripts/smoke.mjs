// Smoke test of a running game server (#23, ADR 0017), using the workspace's `ws` package. It checks what a deploy
// must hold: GET /healthz answers `ok`; two clients with an allowed Origin say hello, create a room and join it, and
// both see `roomState` with 2 players; an upgrade with a foreign Origin is refused. Exits non-zero on any failure.
// Usage: pnpm --filter server exec node scripts/smoke.mjs <base URL> <WebSocket URL> <allowed origin>
// e.g.   pnpm --filter server exec node scripts/smoke.mjs http://localhost:18788 ws://localhost:18788/ws https://ossca-thorvg.github.io
import WebSocket from 'ws';

/** Keep in step with PROTOCOL_VERSION in packages/shared/src/protocol.ts. */
const PROTOCOL_VERSION = 1;
const TIMEOUT_MS = 5000;
const FOREIGN_ORIGIN = 'https://evil.example';

const [base, url, origin] = process.argv.slice(2);
if (!base || !url || !origin) {
  console.error('usage: node scripts/smoke.mjs <base URL> <WebSocket URL> <allowed origin>');
  process.exit(2);
}

function fail(message) {
  console.error(`smoke: FAIL ${message}`);
  process.exit(1);
}

/** Opens a socket that queues parsed messages; `next(type)` resolves with the next message of that type. */
function client(name) {
  const socket = new WebSocket(url, { origin });
  const queue = [];
  const waiters = [];
  socket.on('message', (data) => {
    queue.push(JSON.parse(data.toString()));
    for (const w of waiters.splice(0)) w();
  });
  socket.on('unexpected-response', (_req, res) => {
    fail(`${name}: upgrade refused with HTTP ${String(res.statusCode)}`);
  });
  socket.on('error', (err) => {
    fail(`${name}: ${err.message}`);
  });
  const next = (type, accept = () => true) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${name}: no ${type} within ${String(TIMEOUT_MS)} ms`));
      }, TIMEOUT_MS);
      const look = () => {
        const i = queue.findIndex((m) => m.type === type && accept(m));
        if (i === -1) {
          waiters.push(look);
          return;
        }
        clearTimeout(timer);
        resolve(queue.splice(i, 1)[0]);
      };
      look();
    });
  const opened = new Promise((resolve) => socket.once('open', resolve));
  const send = (message) => {
    socket.send(JSON.stringify(message));
  };
  return { socket, next, opened, send };
}

/** Resolves with the HTTP status of a refused upgrade from a foreign Origin, or fails if it is accepted. */
function foreignUpgrade() {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, { origin: FOREIGN_ORIGIN });
    socket.once('open', () => {
      socket.close();
      fail(`an upgrade with Origin ${FOREIGN_ORIGIN} was accepted`);
    });
    socket.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode);
    });
    socket.once('error', (err) => {
      fail(`foreign-origin upgrade: ${err.message}`);
    });
  });
}

try {
  const health = await fetch(new URL('/healthz', base), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await health.text()).trim();
  if (!health.ok || body !== 'ok') fail(`/healthz answered ${String(health.status)} '${body}'`);
  console.warn('smoke: /healthz ok');

  const a = client('a');
  const b = client('b');
  await Promise.all([a.opened, b.opened]);
  a.send({ type: 'hello', v: PROTOCOL_VERSION });
  b.send({ type: 'hello', v: PROTOCOL_VERSION });
  await Promise.all([a.next('welcome'), b.next('welcome')]);
  a.send({ type: 'createRoom', nickname: 'smokeA' });
  const created = await a.next('roomState');
  b.send({ type: 'joinRoom', code: created.code, nickname: 'smokeB' });
  const two = (m) => m.players.length === 2;
  await Promise.all([a.next('roomState', two), b.next('roomState', two)]);
  console.warn('smoke: a room was created and joined by 2 players');
  a.socket.close();
  b.socket.close();

  const status = await foreignUpgrade();
  console.warn(`smoke: Origin ${FOREIGN_ORIGIN} refused with HTTP ${String(status)}`);
  console.warn('smoke: ok');
  process.exit(0);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
