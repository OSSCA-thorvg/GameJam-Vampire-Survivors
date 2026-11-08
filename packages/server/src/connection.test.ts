import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { Connection, type ConnectionContext } from './connection.js';
import { JoinLockout } from './limits.js';
import { RoomRegistry } from './rooms.js';

/** Just enough of a ws socket for the heartbeat: counts pings and terminations. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  pings = 0;
  terminated = false;
  ping(): void {
    this.pings++;
  }
  terminate(): void {
    this.terminated = true;
  }
  send(): void {
    /* unused */
  }
  close(): void {
    /* unused */
  }
}

function connection(socket: FakeSocket): Connection {
  const now = (): number => 0;
  const ctx: ConnectionContext = {
    registry: new RoomRegistry({
      now,
      timers: { set: () => 0, clear: () => undefined },
      send: () => undefined,
    }),
    lockout: new JoinLockout(now),
    now,
    players: new Map(),
  };
  return new Connection(socket as unknown as WebSocket, '127.0.0.1', ctx);
}

describe('Connection heartbeat', () => {
  it('terminates a socket that misses two pongs', () => {
    const socket = new FakeSocket();
    const c = connection(socket);
    c.heartbeat(); // ping 1
    c.heartbeat(); // ping 2, still no pong
    expect(socket.pings).toBe(2);
    expect(socket.terminated).toBe(false);
    c.heartbeat();
    expect(socket.terminated).toBe(true);
  });

  it('keeps a socket that answers', () => {
    const socket = new FakeSocket();
    const c = connection(socket);
    for (let i = 0; i < 5; i++) {
      c.heartbeat();
      socket.emit('pong');
    }
    expect(socket.pings).toBe(5);
    expect(socket.terminated).toBe(false);
  });
});
