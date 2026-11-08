import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MAX_MESSAGE_BYTES } from '@vs/shared';
import { WebSocketServer } from 'ws';
import { loadConfig, type ServerConfig } from './config.js';
import { Connection, POLICY_VIOLATION, type ConnectionContext } from './connection.js';
import { ConnectionCounter, JoinLockout, clientIp } from './limits.js';
import { log, setLogLevel } from './log.js';
import { RoomRegistry, type Timers } from './rooms.js';

export type { ServerConfig } from './config.js';

export interface RunningServer {
  /** The port the server is bound to (useful when started on port 0). */
  port: number;
  close(): Promise<void>;
}

/** Ping interval; a socket that misses two pongs in a row is terminated. */
const HEARTBEAT_MS = 15_000;

const realTimers: Timers = {
  // A throwing room timer must not stop the process (and with it every other room).
  set: (fn, ms) =>
    setTimeout(() => {
      try {
        fn();
      } catch (err) {
        log('error', 'timer_failed', { error: err instanceof Error ? err.message : 'unknown' });
      }
    }, ms),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/**
 * Starts the game server (ADR 0006): `GET /healthz` over HTTP and WebSocket upgrades on `/ws`, accepted only from
 * an `Origin` in `config.allowedOrigins` and while the client IP has fewer than 10 connections (ADR 0011). Each
 * socket is handed to a `Connection`, which validates every message before it reaches the shared `RoomRegistry`.
 */
export function startServer(config: ServerConfig): Promise<RunningServer> {
  setLogLevel(config.logLevel);
  const allowed = new Set(config.allowedOrigins);
  const now = (): number => Date.now();
  const counter = new ConnectionCounter();
  const players = new Map<string, Connection>();
  const registry = new RoomRegistry({
    now,
    timers: realTimers,
    matchTimeLimitMs: config.matchTimeLimitS * 1000,
    send: (playerId, message) => {
      players.get(playerId)?.send(message);
    },
    onEvent: (event, fields) => {
      log('info', event, fields);
    },
  });
  const ctx: ConnectionContext = { registry, lockout: new JoinLockout(now), now, players };
  const connections = new Set<Connection>();
  const ipOf = (req: IncomingMessage): string =>
    clientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], config.trustProxy);

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
    // ws refuses a larger frame with 1009 before buffering or parsing it (ADR 0011).
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: (
      { origin, req }: { origin: string | undefined; req: IncomingMessage },
      done: (ok: boolean, code?: number, message?: string) => void,
    ) => {
      if (origin === undefined || !allowed.has(origin)) {
        log('warn', 'upgrade_rejected', { reason: 'origin' });
        done(false, 403, 'Forbidden');
        return;
      }
      if (!counter.canAccept(ipOf(req))) {
        log('warn', 'upgrade_rejected', { reason: 'ip_limit' });
        done(false, 429, 'Too Many Connections');
        return;
      }
      done(true);
    },
  });

  wss.on('connection', (socket, req) => {
    const ip = ipOf(req);
    // Re-checked here: concurrent handshakes can all pass verifyClient before any of them is counted.
    if (!counter.acquire(ip)) {
      log('warn', 'upgrade_rejected', { reason: 'ip_limit' });
      socket.close(POLICY_VIOLATION, 'too many connections');
      return;
    }
    const connection = new Connection(socket, ip, ctx);
    connections.add(connection);
    log('info', 'connect', { clients: wss.clients.size });
    socket.on('close', (code) => {
      connections.delete(connection);
      counter.release(ip);
      try {
        connection.closed();
      } catch (err) {
        log('error', 'close_failed', { error: err instanceof Error ? err.message : 'unknown' });
      }
      log('info', 'close', { code, rooms: registry.roomCount });
    });
  });

  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      try {
        connection.heartbeat();
      } catch {
        // A socket that is still connecting or already gone; its close event cleans it up.
      }
    }
    ctx.lockout.prune();
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            clearInterval(heartbeat);
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
      log('info', 'listening', {
        port: running.port,
        origins: config.allowedOrigins.join(','),
        trustProxy: config.trustProxy ? 1 : 0,
        matchTimeLimitS: config.matchTimeLimitS,
      });
      if (config.matchTimeLimitOverrideIgnored) {
        log('warn', 'override_ignored', {
          name: 'MATCH_TIME_LIMIT_S_OVERRIDE',
          reason: 'NODE_ENV',
        });
      }
      handleShutdown(running);
    },
    (err: unknown) => {
      log('error', 'start_failed', { error: String(err) });
      process.exit(1);
    },
  );
}
