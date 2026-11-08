import { PROTOCOL_VERSION, type ServerMessage } from '@vs/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { loadConfig } from './config.js';
import { startServer, type RunningServer } from './index.js';

const ALLOWED = 'http://localhost:5173';

let server: RunningServer;
let base: string;
const open: Client[] = [];

/** A real `ws` client that records every server message. */
class Client {
  readonly messages: ServerMessage[] = [];
  readonly socket: WebSocket;
  readonly closed: Promise<number>;
  private waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];

  constructor(origin = ALLOWED, path = '/ws') {
    this.socket = new WebSocket(`ws://${base}${path}`, { origin });
    open.push(this);
    this.socket.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(message);
      this.waiters = this.waiters.filter((w) => {
        if (!w.match(message)) return true;
        w.resolve(message);
        return false;
      });
    });
    this.closed = new Promise((resolve) => {
      this.socket.on('close', (code: number) => {
        resolve(code);
      });
    });
    this.socket.on('error', () => {
      /* surfaced through `closed` or `opened` */
    });
  }

  opened(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.once('open', () => {
        resolve();
      });
      this.socket.once('unexpected-response', (_req, res) => {
        reject(new Error(`HTTP ${String(res.statusCode)}`));
      });
      this.socket.once('error', reject);
    });
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /** The next message (already received or future) matching `type` and `pred`, after index `from`. */
  next<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: ServerMessage): boolean =>
      m.type === type && pred(m as Extract<ServerMessage, { type: T }>);
    const found = this.messages.find(match);
    if (found) return Promise.resolve(found as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `timeout waiting for ${type}; got ${this.messages.map((m) => m.type).join(',')}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  count(type: ServerMessage['type']): number {
    return this.messages.filter((m) => m.type === type).length;
  }

  async hello(): Promise<string> {
    await this.opened();
    this.send({ type: 'hello', v: PROTOCOL_VERSION });
    return (await this.next('welcome')).playerId;
  }
}

async function rejectedStatus(origin: string, path = '/ws'): Promise<number | undefined> {
  const socket = new WebSocket(`ws://${base}${path}`, { origin });
  return new Promise((resolve) => {
    socket.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode);
      socket.terminate();
    });
    socket.once('open', () => {
      resolve(101);
      socket.close();
    });
    socket.once('error', () => {
      resolve(undefined);
    });
  });
}

/** Two clients in one room, both ready; returns them with their ids and the code. */
async function readyPair(): Promise<{
  a: Client;
  b: Client;
  aId: string;
  bId: string;
  code: string;
}> {
  const a = new Client();
  const b = new Client();
  const aId = await a.hello();
  const bId = await b.hello();
  a.send({ type: 'createRoom', nickname: 'Alice' });
  const { code } = await a.next('roomState');
  b.send({ type: 'joinRoom', code, nickname: 'Bob' });
  await b.next('roomState', (s) => s.players.length === 2);
  a.send({ type: 'setReady', ready: true });
  b.send({ type: 'setReady', ready: true });
  await a.next('roomState', (s) => s.players.every((p) => p.ready));
  return { a, b, aId, bId, code };
}

async function healthy(): Promise<boolean> {
  const res = await fetch(`http://${base}/healthz`);
  return res.status === 200 && (await res.text()) === 'ok';
}

beforeAll(async () => {
  server = await startServer({
    ...loadConfig({}),
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: [ALLOWED],
  });
  base = `127.0.0.1:${String(server.port)}`;
});

afterEach(async () => {
  for (const c of open.splice(0)) c.socket.terminate();
  // Let the server process the closes so the per-IP counter is back to zero for the next test.
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(async () => {
  await server.close();
});

describe('HTTP and upgrades', () => {
  it('binds the requested host, so test servers listen on 127.0.0.1 only', () => {
    expect(server.address).toBe('127.0.0.1');
  });

  it('binds every interface when no host is given, as the container does', async () => {
    const config = loadConfig({});
    expect(config.host).toBeUndefined();
    const wildcard = await startServer({ ...config, port: 0, allowedOrigins: [ALLOWED] });
    try {
      expect(['::', '0.0.0.0']).toContain(wildcard.address);
    } finally {
      await wildcard.close();
    }
  });

  it('answers GET /healthz with 200 ok and no caching', async () => {
    const res = await fetch(`http://${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('ok');
  });

  it('answers every other request with 404', async () => {
    expect((await fetch(`http://${base}/`)).status).toBe(404);
  });

  it('rejects an upgrade from a disallowed Origin with 403', async () => {
    expect(await rejectedStatus('http://evil.example')).toBe(403);
  });

  it('rejects an upgrade on a path other than /ws', async () => {
    const status = await rejectedStatus(ALLOWED, '/other');
    expect(status).not.toBe(101);
    expect(status === undefined || status >= 400).toBe(true);
  });

  it('refuses the 11th connection from one IP', async () => {
    const clients = Array.from({ length: 10 }, () => new Client());
    await Promise.all(clients.map((c) => c.opened()));
    expect(await rejectedStatus(ALLOWED)).toBe(429);
    clients[0]?.socket.close();
    await clients[0]?.closed;
    await new Promise((r) => setTimeout(r, 20));
    expect(await rejectedStatus(ALLOWED)).toBe(101);
  });
});

describe('handshake', () => {
  it('stays silent until hello, then sends welcome', async () => {
    const c = new Client();
    await c.opened();
    await new Promise((r) => setTimeout(r, 50));
    expect(c.messages).toEqual([]);
    const id = await c.hello();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers a wrong version with versionMismatch and closes 1008', async () => {
    const c = new Client();
    await c.opened();
    c.send({ type: 'hello', v: PROTOCOL_VERSION + 1 });
    expect((await c.next('error')).code).toBe('versionMismatch');
    expect(await c.closed).toBe(1008);
  });

  it('answers a first message other than hello with versionMismatch and closes 1008', async () => {
    const c = new Client();
    await c.opened();
    c.send({ type: 'createRoom', nickname: 'Alice' });
    expect((await c.next('error')).code).toBe('versionMismatch');
    expect(await c.closed).toBe(1008);
  });
});

describe('match flow', () => {
  it('create, join, ready, start: both get matchStart with the same seed; died gives matchResult', async () => {
    const { a, b, aId, bId, code } = await readyPair();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    a.send({ type: 'startMatch' });
    const [startA, startB] = await Promise.all([a.next('matchStart'), b.next('matchStart')]);
    expect(startA.seed).toBe(startB.seed);
    expect(startA.startAt).toBe(startB.startAt);
    expect(startA.startAt - Date.now()).toBeGreaterThan(2500);

    // died is accepted during the countdown too.
    b.send({ type: 'died', kills: 4, elapsedMs: 1000 });
    const eliminated = await a.next('playerEliminated');
    expect(eliminated).toEqual({ type: 'playerEliminated', playerId: bId, reason: 'died' });
    const [resultA, resultB] = await Promise.all([a.next('matchResult'), b.next('matchResult')]);
    expect(resultA).toEqual(resultB);
    expect(resultA.outcome).toBe('win');
    expect(resultA.winnerId).toBe(aId);
    expect(resultA.ranking.map((r) => r.nickname)).toEqual(['Alice', 'Bob']);
  });

  it('relays status at most every 250 ms and interference only to the opponent', async () => {
    const { a, b, bId } = await readyPair();
    a.send({ type: 'startMatch' });
    await a.next('roomState', (s) => s.phase === 'playing', 5000);

    for (let i = 0; i < 10; i++) {
      b.send({
        type: 'status',
        status: { hp: 5, maxHp: 10, level: 1, kills: i, alive: true, elapsedMs: i },
      });
    }
    await a.next('peerStatus');
    await new Promise((r) => setTimeout(r, 100));
    expect(a.count('peerStatus')).toBe(1);
    expect(b.count('peerStatus')).toBe(0);

    b.send({ type: 'interference', kind: 'gemThief' });
    const incoming = await a.next('interferenceIncoming');
    expect(incoming).toEqual({
      type: 'interferenceIncoming',
      kind: 'gemThief',
      fromPlayerId: bId,
      fromNickname: 'Bob',
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(b.count('interferenceIncoming')).toBe(0);
  }, 10_000);

  it('a disconnect leaves the room, which is deleted with its last player', async () => {
    const { a, b, code } = await readyPair();
    b.socket.close();
    await a.next('roomState', (s) => s.players.length === 1);
    a.socket.close();
    await a.closed;
    await new Promise((r) => setTimeout(r, 20));
    const c = new Client();
    await c.hello();
    c.send({ type: 'joinRoom', code, nickname: 'Cy' });
    expect((await c.next('error')).code).toBe('roomNotFound');
  });
});

describe('limits', () => {
  it('100 messages in one second get rateLimited and a 1008 close', async () => {
    const c = new Client();
    await c.hello();
    c.send({ type: 'createRoom', nickname: 'Spammer' });
    await c.next('roomState');
    // visibility in the lobby is valid and dropped silently, so only the token bucket can stop this.
    for (let i = 0; i < 100; i++) c.send({ type: 'visibility', hidden: false });
    expect((await c.next('error', (e) => e.code === 'rateLimited')).code).toBe('rateLimited');
    expect(await c.closed).toBe(1008);
    expect(await healthy()).toBe(true);
  });

  it('100 pings in one second are rate-limited and closed with 1008', async () => {
    const c = new Client();
    await c.hello();
    for (let i = 0; i < 100; i++) c.socket.ping();
    expect(await c.closed).toBe(1008);
  });

  it('a full room answers roomNotFound, like a missing one', async () => {
    const { code } = await readyPair();
    const c = new Client();
    await c.hello();
    c.send({ type: 'joinRoom', code, nickname: 'Cy' });
    expect((await c.next('error')).code).toBe('roomNotFound');
  });

  it('10 wrong codes in 60 s lock the IP out of joining, on every connection', async () => {
    // A server of its own, so the 60 s lockout of 127.0.0.1 does not leak into other tests.
    const own = await startServer({
      ...loadConfig({}),
      port: 0,
      host: '127.0.0.1',
      allowedOrigins: [ALLOWED],
    });
    const shared = base;
    base = `127.0.0.1:${String(own.port)}`;
    try {
      await lockoutJourney();
    } finally {
      for (const c of open.splice(0)) c.socket.terminate();
      base = shared;
      await own.close();
    }
  });
});

async function lockoutJourney(): Promise<void> {
  const host = new Client();
  await host.hello();
  host.send({ type: 'createRoom', nickname: 'Host' });
  const { code } = await host.next('roomState');

  const c = new Client();
  await c.hello();
  for (let i = 0; i < 10; i++) c.send({ type: 'joinRoom', code: 'ZZZZZZ', nickname: 'Eve' });
  await new Promise((r) => setTimeout(r, 100));
  expect(c.messages.filter((m) => m.type === 'error' && m.code === 'roomNotFound')).toHaveLength(
    10,
  );

  c.send({ type: 'joinRoom', code, nickname: 'Eve' }); // a real code, but locked out
  const locked = await c.next('error', (e) => e.code === 'rateLimited');
  expect(locked.message).toMatch(/failed joins/);
  expect(c.socket.readyState).toBe(WebSocket.OPEN);

  const d = new Client();
  await d.hello();
  d.send({ type: 'joinRoom', code, nickname: 'Dan' });
  expect((await d.next('error')).code).toBe('rateLimited');
}

describe('safety fact: no client message crashes the server or reaches the registry unvalidated', () => {
  const invalid: { name: string; payload: string | Buffer }[] = [
    { name: 'not JSON', payload: '{"type":' },
    { name: 'JSON null', payload: 'null' },
    { name: 'JSON array', payload: '[1,2,3]' },
    { name: 'JSON string', payload: '"hello"' },
    { name: 'unknown type', payload: '{"type":"explode"}' },
    { name: 'missing field', payload: '{"type":"joinRoom","code":"ABCDEF"}' },
    { name: 'extra field', payload: '{"type":"leaveRoom","admin":true}' },
    { name: 'wrong field type', payload: '{"type":"setReady","ready":"yes"}' },
    { name: 'bad code', payload: '{"type":"joinRoom","code":"abc","nickname":"x"}' },
    { name: 'NaN-ish number', payload: '{"type":"died","kills":1e999,"elapsedMs":0}' },
    {
      name: 'hp above maxHp',
      payload:
        '{"type":"status","status":{"hp":9,"maxHp":1,"level":1,"kills":0,"alive":true,"elapsedMs":0}}',
    },
    { name: '__proto__ key', payload: '{"type":"startMatch","__proto__":{"polluted":true}}' },
    { name: 'constructor type', payload: '{"type":"constructor"}' },
    { name: 'deep nesting', payload: `${'['.repeat(1000)}${']'.repeat(1000)}` },
    { name: 'binary frame', payload: Buffer.from([0, 1, 2, 3]) },
    { name: 'second hello', payload: JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION }) },
    {
      name: 'out of phase status',
      payload:
        '{"type":"status","status":{"hp":1,"maxHp":1,"level":1,"kills":0,"alive":true,"elapsedMs":0}}',
    },
    { name: 'out of phase startMatch', payload: '{"type":"startMatch"}' },
  ];

  for (const { name, payload } of invalid) {
    it(`${name}: one error, then 1008 on repeat`, async () => {
      const c = new Client();
      await c.hello();
      c.send(payload);
      const first = await c.next('error');
      expect(['badMessage', 'wrongPhase']).toContain(first.code);
      expect(c.socket.readyState).toBe(WebSocket.OPEN);
      c.send(payload);
      expect(await c.closed).toBe(1008);
    });
  }

  it('an oversized frame is closed by ws (1009) before parsing', async () => {
    const c = new Client();
    await c.hello();
    c.send(JSON.stringify({ type: 'createRoom', nickname: 'x'.repeat(5000) }));
    expect(await c.closed).toBe(1009);
  });

  it('invalid UTF-8 text is closed by ws (1007)', async () => {
    const c = new Client();
    await c.hello();
    c.socket.send(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), { binary: false });
    expect(await c.closed).toBe(1007);
  });

  it('after every invalid case the server still answers /healthz and another client can create a room', async () => {
    // In batches below the per-IP cap of 10 connections.
    for (let i = 0; i < invalid.length; i += 8) {
      await Promise.all(
        invalid.slice(i, i + 8).map(async ({ payload }) => {
          const c = new Client();
          await c.hello();
          c.send(payload);
          c.send(payload);
          return c.closed;
        }),
      );
    }
    const raw = new Client();
    await raw.opened();
    raw.send('garbage');
    expect(await raw.closed).toBe(1008);
    for (const c of open.splice(0)) c.socket.terminate();
    await new Promise((r) => setTimeout(r, 50));

    expect(await healthy()).toBe(true);
    const c = new Client();
    await c.hello();
    c.send({ type: 'createRoom', nickname: 'Survivor' });
    const state = await c.next('roomState');
    expect(state.players).toEqual([
      expect.objectContaining({ nickname: 'Survivor', host: true, ready: false, connected: true }),
    ]);
  }, 15_000);
});
