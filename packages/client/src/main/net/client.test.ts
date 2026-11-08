import { PROTOCOL_VERSION } from '@vs/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectError, NetClient, type OpenSocket, type SocketHandlers } from './client';

/** A scripted socket: each `open` call records the handlers; the test drives them. */
function fakeServer() {
  const sockets: { on: SocketHandlers; sent: string[]; closed: boolean }[] = [];
  const open: OpenSocket = (_url, on) => {
    const s = { on, sent: [] as string[], closed: false };
    sockets.push(s);
    return {
      send: (data) => s.sent.push(data),
      close: () => {
        s.closed = true;
      },
    };
  };
  const last = () => {
    const s = sockets.at(-1);
    if (!s) throw new Error('no socket');
    return s;
  };
  const welcome = (id = 'p1') => {
    last().on.open();
    last().on.message(JSON.stringify({ type: 'welcome', playerId: id }));
  };
  return { sockets, open, last, welcome };
}

describe('NetClient (fake socket)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends hello on open and resolves on welcome', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    expect(net.state).toBe('idle');
    const done = net.connect();
    expect(net.state).toBe('connecting');
    server.welcome('abc');
    await done;
    expect(server.last().sent).toEqual([JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION })]);
    expect(net.state).toBe('open');
    expect(net.selfId).toBe('abc');
    expect(server.sockets).toHaveLength(1);
    await net.connect();
    expect(server.sockets).toHaveLength(1);
  });

  it('rejects after the 5 s hello timeout', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const done = net.connect();
    const rejected = expect(done).rejects.toEqual(new ConnectError('timeout'));
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(server.last().closed).toBe(true);
    expect(net.state).toBe('closed');
  });

  it('rejects on versionMismatch and on a close before welcome', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const first = net.connect();
    server
      .last()
      .on.message(JSON.stringify({ type: 'error', code: 'versionMismatch', message: 'x' }));
    await expect(first).rejects.toMatchObject({ reason: 'versionMismatch' });
    const second = net.connect();
    server.last().on.close(1006);
    await expect(second).rejects.toMatchObject({ reason: 'closed' });
  });

  it('ignores invalid frames with a warning and delivers valid ones to subscribers until unsubscribed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const done = net.connect();
    server.welcome();
    await done;
    const states: string[] = [];
    const off = net.on('roomState', (m) => states.push(m.code));
    const room = { type: 'roomState', code: 'ABCDEF', maxPlayers: 2, players: [], phase: 'lobby' };
    server.last().on.message('not json');
    server.last().on.message(JSON.stringify({ ...room, extra: 1 }));
    server.last().on.message(new ArrayBuffer(2));
    server.last().on.message(JSON.stringify(room));
    expect(states).toEqual(['ABCDEF']);
    expect(warn).toHaveBeenCalledTimes(3);
    off();
    server.last().on.message(JSON.stringify(room));
    expect(states).toEqual(['ABCDEF']);
  });

  it('send drops messages unless open', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    expect(net.send({ type: 'leaveRoom' })).toBe(false);
    const done = net.connect();
    server.welcome();
    await done;
    expect(net.send({ type: 'setReady', ready: true })).toBe(true);
    expect(server.last().sent.at(-1)).toBe('{"type":"setReady","ready":true}');
    net.close();
    expect(net.state).toBe('closed');
    expect(net.send({ type: 'leaveRoom' })).toBe(false);
  });

  it('reconnects after an unexpected close with 1, 2 and 4 s backoff, then reports the loss once', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const done = net.connect();
    server.welcome('first');
    await done;
    const lost = vi.fn();
    net.onLost(lost);
    server.last().on.close(1006);
    expect(net.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(999);
    expect(server.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.sockets).toHaveLength(2);
    server.last().on.close(1006); // attempt 1 fails
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.sockets).toHaveLength(3);
    server.last().on.close(1006); // attempt 2 fails
    await vi.advanceTimersByTimeAsync(4000);
    expect(server.sockets).toHaveLength(4);
    expect(lost).not.toHaveBeenCalled();
    server.last().on.close(1006); // attempt 3 fails
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.sockets).toHaveLength(4);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(net.state).toBe('closed');
  });

  it('reports the loss after a successful reconnect, with the new player id', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const done = net.connect();
    server.welcome('first');
    await done;
    const lost = vi.fn();
    net.onLost(lost);
    server.last().on.close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    server.welcome('second');
    await vi.advanceTimersByTimeAsync(0);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(net.state).toBe('open');
    expect(net.selfId).toBe('second');
  });

  it('close() never reconnects and never reports a loss', async () => {
    const server = fakeServer();
    const net = new NetClient('ws://x/ws', server.open);
    const done = net.connect();
    server.welcome();
    await done;
    const lost = vi.fn();
    net.onLost(lost);
    net.close();
    server.sockets[0]?.on.close(1000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.sockets).toHaveLength(1);
    expect(lost).not.toHaveBeenCalled();
  });
});
