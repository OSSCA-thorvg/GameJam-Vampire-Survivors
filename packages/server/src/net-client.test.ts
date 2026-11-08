// The client's `NetClient` (#19, `packages/client/src/main/net/client.ts`) against this real server on port 0. It
// lives here because this package has `ws` and Node types; the client file depends on `@vs/shared` only.
import type { ServerMessage } from '@vs/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { NetClient, type OpenSocket } from '../../client/src/main/net/client.js';
import { loadConfig } from './config.js';
import { startServer, type RunningServer } from './index.js';

const ALLOWED = 'http://localhost:5173';

let server: RunningServer;
let url: string;
const clients: NetClient[] = [];

/** `OpenSocket` over `ws`, with an `Origin`; `rewrite` edits outgoing frames. */
function wsSocket(origin = ALLOWED, rewrite: (data: string) => string = (d) => d): OpenSocket {
  return (target, on) => {
    const ws = new WebSocket(target, { origin });
    ws.on('open', () => {
      on.open();
    });
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      on.message(isBinary ? data : data.toString());
    });
    ws.on('close', (code: number) => {
      on.close(code);
    });
    ws.on('error', () => {
      /* reported through close */
    });
    return {
      send: (data) => {
        ws.send(rewrite(data));
      },
      close: () => {
        ws.close();
      },
    };
  };
}

function client(open: OpenSocket = wsSocket()): NetClient {
  const net = new NetClient(url, open);
  clients.push(net);
  return net;
}

function next<T extends ServerMessage['type']>(
  net: NetClient,
  type: T,
  pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for ${type}`));
    }, 2000);
    const off = net.on(type, (m) => {
      if (!pred(m)) return;
      clearTimeout(timer);
      off();
      resolve(m);
    });
  });
}

beforeAll(async () => {
  server = await startServer({ ...loadConfig({}), port: 0, allowedOrigins: [ALLOWED] });
  url = `ws://127.0.0.1:${String(server.port)}/ws`;
});

afterEach(() => {
  for (const net of clients.splice(0)) net.close();
});

afterAll(async () => {
  await server.close();
});

describe('NetClient against the real server', () => {
  it('connects, creates a room, a second client joins, and both receive the roomState', async () => {
    const a = client();
    const b = client();
    await a.connect();
    await b.connect();
    expect(a.state).toBe('open');
    expect(a.selfId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(b.selfId).not.toBe(a.selfId);

    const created = next(a, 'roomState');
    a.send({ type: 'createRoom', nickname: 'Alice' });
    const { code } = await created;

    const bothA = next(a, 'roomState', (s) => s.players.length === 2);
    const bothB = next(b, 'roomState', (s) => s.players.length === 2);
    b.send({ type: 'joinRoom', code, nickname: 'Bob' });
    const [sa, sb] = await Promise.all([bothA, bothB]);
    for (const s of [sa, sb]) {
      expect(s.code).toBe(code);
      expect(s.phase).toBe('lobby');
      expect(s.players.map((p) => [p.nickname, p.host, p.ready])).toEqual([
        ['Alice', true, false],
        ['Bob', false, false],
      ]);
    }

    const c = client();
    await c.connect();
    const cTaken = next(c, 'error');
    c.send({ type: 'joinRoom', code, nickname: 'Alice' });
    expect((await cTaken).code).toBe('roomNotFound'); // the room is full (ADR 0011: not revealed)
  });

  it('rejects with versionMismatch when the hello carries another version', async () => {
    const net = client(wsSocket(ALLOWED, (d) => d.replace(/"v":\d+/, '"v":999')));
    await expect(net.connect()).rejects.toMatchObject({ reason: 'versionMismatch' });
    expect(net.state).toBe('closed');
  });

  it('rejects with closed when the Origin is not allowed', async () => {
    const net = client(wsSocket('http://evil.example'));
    await expect(net.connect()).rejects.toMatchObject({ reason: 'closed' });
  });
});
