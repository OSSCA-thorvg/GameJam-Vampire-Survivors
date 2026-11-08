import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PROTOCOL_VERSION } from '@vs/shared';
import { WebSocketServer } from 'ws';
import { loadConfig, type ServerConfig } from './config.js';
import { log, setLogLevel } from './log.js';

export type { ServerConfig } from './config.js';

export interface RunningServer {
  /** The port the server is bound to (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

/** Close code sent for any client message until the real protocol arrives with #18. */
const NOT_IMPLEMENTED = 1003;
/** Largest accepted message (ADR 0011); `ws` closes a larger one with 1009 before buffering or parsing it. */
const MAX_PAYLOAD = 4096;

/**
 * Starts the game server (ADR 0006): `GET /healthz` over HTTP and WebSocket upgrades on `/ws`, accepted only from
 * an `Origin` in `config.allowedOrigins` (ADR 0011). Rooms and the protocol arrive with #18; until then a client
 * receives `{ type: 'hello', protocol }` and any message it sends closes the socket with 1003.
 */
export function startServer(config: ServerConfig): Promise<RunningServer> {
  setLogLevel(config.logLevel);
  const allowed = new Set(config.allowedOrigins);

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_PAYLOAD,
    verifyClient: (
      { origin }: { origin: string | undefined; req: IncomingMessage },
      done: (ok: boolean, code?: number, message?: string) => void,
    ) => {
      if (origin !== undefined && allowed.has(origin)) {
        done(true);
        return;
      }
      log('warn', 'upgrade_rejected', { reason: 'origin' });
      done(false, 403, 'Forbidden');
    },
  });

  wss.on('connection', (socket) => {
    log('info', 'connect', { clients: wss.clients.size });
    socket.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION }));
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const size = Array.isArray(data)
        ? data.reduce((sum, chunk) => sum + chunk.length, 0)
        : data.byteLength;
      log('debug', 'message', { size });
      socket.close(NOT_IMPLEMENTED, 'not implemented yet');
    });
    // Protocol violations (oversized or malformed frames) surface here; ws then closes the socket (1009, 1002).
    // Without a listener the error would be thrown and stop the process.
    socket.on('error', (err: Error & { code?: string }) => {
      log('warn', 'socket_error', { code: err.code ?? 'unknown' });
    });
    socket.on('close', (code) => {
      log('info', 'close', { code });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => {
              server.close((err) => {
                if (err) rejectClose(err);
                else resolveClose();
              });
            });
          }),
      });
    });
  });
}

/** Stops on SIGTERM/SIGINT within 5 s, so `docker stop` never reaches its 10 s kill. */
function handleShutdown(running: RunningServer): void {
  let stopping = false;
  const stop = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    log('info', 'shutdown', { signal });
    const force = setTimeout(() => {
      log('error', 'shutdown_timeout');
      process.exit(1);
    }, 5000);
    force.unref();
    running.close().then(
      () => {
        log('info', 'stopped');
        process.exit(0);
      },
      (err: unknown) => {
        log('error', 'shutdown_failed', { error: String(err) });
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (!process.env.VITEST) {
  let config: ServerConfig;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    log('error', 'config_invalid', { error: String(err) });
    process.exit(1);
  }
  startServer(config).then(
    (running) => {
      log('info', 'listening', { port: running.port, origins: config.allowedOrigins.join(',') });
      handleShutdown(running);
    },
    (err: unknown) => {
      log('error', 'start_failed', { error: String(err) });
      process.exit(1);
    },
  );
}
