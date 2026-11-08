// Manual check for the server's WebSocket endpoint (issue #4), using the workspace's `ws` package.
// Usage: pnpm --filter server exec node scripts/ws-hello.mjs <origin> [url]
// Prints the first message, or the HTTP status of a rejected upgrade, then exits.
import WebSocket from 'ws';

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
