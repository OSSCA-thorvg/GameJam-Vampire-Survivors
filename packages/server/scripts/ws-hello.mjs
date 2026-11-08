// Manual check for the server's WebSocket endpoint (#4, protocol from #18), using the workspace's `ws` package.
// Usage: pnpm --filter server exec node scripts/ws-hello.mjs <origin> [url]
// Sends `hello` with the protocol version and prints the server's answer (`welcome`), or the HTTP status of a
// rejected upgrade, then exits.
import WebSocket from 'ws';

/** Keep in step with PROTOCOL_VERSION in packages/shared/src/protocol.ts. */
const PROTOCOL_VERSION = 1;

const origin = process.argv[2];
const url = process.argv[3] ?? 'ws://localhost:8787/ws';
if (!origin) {
  console.error('usage: node scripts/ws-hello.mjs <origin> [url]');
  process.exit(2);
}

const socket = new WebSocket(url, { origin });
const timer = setTimeout(() => {
  console.error('timeout: no message within 5 s');
  process.exit(1);
}, 5000);

socket.once('open', () => {
  socket.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION }));
});
socket.once('message', (data) => {
  clearTimeout(timer);
  process.stdout.write(`${data.toString()}\n`);
  socket.close();
  process.exit(0);
});
socket.once('unexpected-response', (_req, res) => {
  clearTimeout(timer);
  console.error(`rejected: HTTP ${String(res.statusCode)} ${res.statusMessage ?? ''}`.trim());
  process.exit(1);
});
socket.once('error', (err) => {
  clearTimeout(timer);
  console.error(`error: ${err.message}`);
  process.exit(1);
});
