import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RunningServer {
  /** The port the server is bound to (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

/**
 * Starts the game server's HTTP endpoint (ADR 0006). For now it only answers `GET /healthz`;
 * WebSocket handling on `/ws` arrives with #4 and #18.
 */
export function startServer(options: { port: number }): Promise<RunningServer> {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => {
      server.off('error', reject);
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          }),
      });
    });
  });
}

if (!process.env.VITEST) {
  const port = Number(process.env.PORT ?? 8787);
  startServer({ port })
    .then(({ port: boundPort }) => {
      console.warn(`server listening on http://localhost:${String(boundPort)}`);
    })
    .catch((err: unknown) => {
      console.error('server failed to start', err);
      process.exit(1);
    });
}
