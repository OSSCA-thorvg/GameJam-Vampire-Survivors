import {
  AFK_FORFEIT_MS,
  DISCONNECT_GRACE_MS,
  INTERFERENCE_RULES,
  INTERFERENCE_SEND_LIMIT,
  MATCH_DEADLINE_GRACE_S,
  MATCH_TIME_LIMIT_S,
  START_DELAY_MS,
  type PlayerStatus,
  type PlayerView,
  type ServerMessage,
} from '@vs/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { REMATCH_DELAY_MS, RoomRegistry, type Timers } from './rooms.js';

/** A manual clock: timers run only when `advance` passes their due time, in due order. */
class FakeTimers implements Timers {
  now = 1_000_000;
  private nextId = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }

  clear(handle: object | number): void {
    if (typeof handle === 'number') this.pending.delete(handle);
  }

  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, t] of this.pending) {
        if (t.at <= end && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId === null) break;
      const timer = this.pending.get(nextId);
      this.pending.delete(nextId);
      this.now = nextAt;
      timer?.fn();
    }
    this.now = end;
  }

  get count(): number {
    return this.pending.size;
  }
}

const baseStatus: PlayerStatus = {
  hp: 10,
  maxHp: 10,
  level: 1,
  kills: 0,
  alive: true,
  elapsedMs: 0,
};

let timers: FakeTimers;
let inbox: Map<string, ServerMessage[]>;
let registry: RoomRegistry;
let seeds: number[];
let picks: number[];

function setup(maxPlayers = 2, matchTimeLimitMs?: number): void {
  timers = new FakeTimers();
  inbox = new Map();
  seeds = [123456789];
  picks = [];
  registry = new RoomRegistry({
    now: () => timers.now,
    timers,
    send: (id, m) => {
      const list = inbox.get(id) ?? [];
      list.push(m);
      inbox.set(id, list);
    },
    randomSeed: () => seeds.shift() ?? 1,
    randomInt: (max) => {
      const v = picks.shift() ?? 0;
      return v % max;
    },
    maxPlayers,
    ...(matchTimeLimitMs === undefined ? {} : { matchTimeLimitMs }),
  });
}

function messages(id: string): ServerMessage[] {
  return inbox.get(id) ?? [];
}

function ofType<T extends ServerMessage['type']>(
  id: string,
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  return messages(id).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

function lastState(id: string): Extract<ServerMessage, { type: 'roomState' }> {
  const states = ofType(id, 'roomState');
  const last = states.at(-1);
  if (!last) throw new Error(`no roomState for ${id}`);
  return last;
}

function codeOf(id: string): string {
  const code = registry.roomCodeOf(id);
  if (code === null) throw new Error(`${id} is in no room`);
  return code;
}

/** Creates a room with `ids[0]` as host, joins the rest, readies everyone and starts; returns the code. */
function startedRoom(ids: string[], { play = true } = {}): string {
  const [host, ...rest] = ids;
  if (host === undefined) throw new Error('no players');
  expect(registry.createRoom(host, host)).toBeNull();
  const code = codeOf(host);
  for (const id of rest) expect(registry.joinRoom(id, code, id)).toBeNull();
  for (const id of ids) expect(registry.setReady(id, true)).toBeNull();
  expect(registry.startMatch(host)).toBeNull();
  if (play) timers.advance(START_DELAY_MS);
  return code;
}

function result(id: string): Extract<ServerMessage, { type: 'matchResult' }> | undefined {
  return ofType(id, 'matchResult').at(-1);
}

beforeEach(() => {
  setup();
});

describe('lobby', () => {
  it('creates a room with the creator as host and a 6-character code', () => {
    expect(registry.createRoom('a', '  Alice ')).toBeNull();
    const state = lastState('a');
    expect(state.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(state.phase).toBe('lobby');
    expect(state.maxPlayers).toBe(2);
    expect(state.players).toEqual([
      { id: 'a', nickname: 'Alice', ready: false, host: true, connected: true },
    ]);
  });

  it('rejects an invalid nickname', () => {
    expect(registry.createRoom('a', 'a‮b')).toEqual({ error: 'invalidNickname', violation: false });
    expect(registry.createRoom('a', '   ')).toEqual({ error: 'invalidNickname', violation: false });
    expect(registry.roomCount).toBe(0);
  });

  it('joins by code and broadcasts the room to both players', () => {
    registry.createRoom('a', 'Alice');
    const code = codeOf('a');
    expect(registry.joinRoom('b', code, 'Bob')).toBeNull();
    expect(lastState('a').players.map((p) => p.nickname)).toEqual(['Alice', 'Bob']);
    expect(lastState('b')).toEqual(lastState('a'));
  });

  it('answers roomNotFound for an unknown code', () => {
    expect(registry.joinRoom('b', 'ZZZZZZ', 'Bob')).toEqual({
      error: 'roomNotFound',
      violation: false,
    });
  });

  it('refuses a full room (as roomNotFound) and a duplicate nickname (case-insensitive)', () => {
    setup(3);
    registry.createRoom('a', 'Alice');
    const code = codeOf('a');
    expect(registry.joinRoom('b', code, 'ALICE')).toEqual({
      error: 'nicknameTaken',
      violation: false,
    });
    expect(registry.joinRoom('b', code, 'Bob')).toBeNull();
    expect(registry.joinRoom('c', code, 'Cy')).toBeNull();
    expect(registry.joinRoom('d', code, 'Dee')).toEqual({
      error: 'roomNotFound',
      violation: false,
    });
  });

  it('treats creating or joining while already in a room as a violation', () => {
    registry.createRoom('a', 'Alice');
    expect(registry.createRoom('a', 'Alice')).toEqual({ error: 'wrongPhase', violation: true });
    expect(registry.joinRoom('a', codeOf('a'), 'Al')).toEqual({
      error: 'wrongPhase',
      violation: true,
    });
  });

  it('hands the host to the oldest remaining player when the host leaves', () => {
    setup(3);
    registry.createRoom('a', 'Alice');
    const code = codeOf('a');
    registry.joinRoom('b', code, 'Bob');
    registry.joinRoom('c', code, 'Cy');
    expect(registry.leaveRoom('a')).toBeNull();
    const state = lastState('b');
    expect(state.players.map((p) => [p.id, p.host])).toEqual([
      ['b', true],
      ['c', false],
    ]);
    expect(registry.roomCodeOf('a')).toBeNull();
  });

  it('removes a disconnected player in the lobby and deletes the empty room', () => {
    registry.createRoom('a', 'Alice');
    const code = codeOf('a');
    registry.joinRoom('b', code, 'Bob');
    registry.disconnect('b');
    expect(lastState('a').players).toHaveLength(1);
    registry.disconnect('a');
    expect(registry.roomCount).toBe(0);
    expect(registry.view(code)).toBeNull();
  });

  it('starts only from the host, with at least 2 players, all ready', () => {
    registry.createRoom('a', 'Alice');
    const code = codeOf('a');
    registry.setReady('a', true);
    expect(registry.startMatch('a')).toEqual({ error: 'notAllReady', violation: false });
    registry.joinRoom('b', code, 'Bob');
    expect(registry.startMatch('a')).toEqual({ error: 'notAllReady', violation: false });
    registry.setReady('b', true);
    expect(registry.startMatch('b')).toEqual({ error: 'notHost', violation: false });
    expect(registry.startMatch('a')).toBeNull();
  });

  it('answers roomNotFound (no violation) to joining a room in a match, hiding that it exists', () => {
    const code = startedRoom(['a', 'b']);
    expect(registry.joinRoom('c', code, 'Cy')).toEqual({ error: 'roomNotFound', violation: false });
  });

  it('treats lobby actions without a room as violations', () => {
    expect(registry.setReady('x', true)).toEqual({ error: 'wrongPhase', violation: true });
    expect(registry.startMatch('x')).toEqual({ error: 'wrongPhase', violation: true });
    expect(registry.leaveRoom('x')).toEqual({ error: 'wrongPhase', violation: true });
  });
});

describe('phases', () => {
  it('goes lobby → countdown → playing → finished → lobby', () => {
    const code = startedRoom(['a', 'b'], { play: false });
    const start = ofType('a', 'matchStart');
    expect(start).toEqual([
      { type: 'matchStart', seed: 123456789, startAt: timers.now + START_DELAY_MS },
    ]);
    expect(ofType('b', 'matchStart')).toEqual(start);
    expect(lastState('a').phase).toBe('countdown');

    timers.advance(START_DELAY_MS - 1);
    expect(registry.view(code)?.phase).toBe('countdown');
    timers.advance(1);
    expect(lastState('b').phase).toBe('playing');

    registry.died('b', 3);
    timers.advance(100);
    expect(lastState('a').phase).toBe('finished');
    timers.advance(REMATCH_DELAY_MS);
    const lobby = lastState('a');
    expect(lobby.phase).toBe('lobby');
    expect(lobby.players.every((p) => !p.ready)).toBe(true);
    expect(timers.count).toBe(0);
  });

  it('allows a rematch with a fresh seed', () => {
    startedRoom(['a', 'b']);
    registry.died('b', 0);
    timers.advance(100 + REMATCH_DELAY_MS);
    seeds.push(42);
    registry.setReady('a', true);
    registry.setReady('b', true);
    expect(registry.startMatch('a')).toBeNull();
    expect(ofType('b', 'matchStart').at(-1)?.seed).toBe(42);
  });

  it('refuses ready changes outside the lobby without counting a violation', () => {
    startedRoom(['a', 'b']);
    expect(registry.setReady('a', false)).toEqual({ error: 'wrongPhase', violation: false });
    expect(registry.startMatch('a')).toEqual({ error: 'wrongPhase', violation: false });
  });
});

describe('status relay', () => {
  it('forwards status to the others at most every 250 ms', () => {
    startedRoom(['a', 'b']);
    expect(registry.status('a', { ...baseStatus, kills: 1 })).toBeNull();
    timers.advance(100);
    registry.status('a', { ...baseStatus, kills: 2 }); // dropped: 100 ms after the last accepted one
    timers.advance(150);
    registry.status('a', { ...baseStatus, kills: 3 }); // 250 ms: accepted
    const relayed = ofType('b', 'peerStatus');
    expect(relayed.map((m) => m.status.kills)).toEqual([1, 3]);
    expect(relayed.every((m) => m.playerId === 'a')).toBe(true);
    expect(ofType('a', 'peerStatus')).toEqual([]);
  });

  it('throttles to 4 per second under a 60 Hz flood', () => {
    startedRoom(['a', 'b']);
    for (let i = 0; i < 60; i++) {
      registry.status('a', baseStatus);
      timers.advance(1000 / 60);
    }
    expect(ofType('b', 'peerStatus').length).toBeLessThanOrEqual(4);
    expect(ofType('b', 'peerStatus').length).toBeGreaterThanOrEqual(3);
  });

  it('treats status in the lobby or without a room as a violation', () => {
    registry.createRoom('a', 'Alice');
    expect(registry.status('a', baseStatus)).toEqual({ error: 'wrongPhase', violation: true });
    expect(registry.status('x', baseStatus)).toEqual({ error: 'wrongPhase', violation: true });
  });
});

describe('view relay (#114, ADR 0018)', () => {
  const view: PlayerView = { t: 100, x: 1, y: -2, f: 0, c: 0, h: 1000, e: [0, 1, 1], g: [], p: [] };
  const viewAt = (t: number): PlayerView => ({ ...view, t });

  it('relays the same object to the other players only, never storing it', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    expect(registry.relayView('a', view)).toBeNull();
    for (const id of ['b', 'c']) {
      const got = ofType(id, 'peerView');
      expect(got).toHaveLength(1);
      expect(got[0]).toEqual({ type: 'peerView', playerId: 'a', view });
      expect(got[0]?.view).toBe(view);
    }
    expect(ofType('a', 'peerView')).toEqual([]);
  });

  it('drops a second view 50 ms later and relays one 100 ms after the last relayed', () => {
    startedRoom(['a', 'b']);
    registry.relayView('a', viewAt(1));
    timers.advance(50);
    expect(registry.relayView('a', viewAt(2))).toBeNull();
    timers.advance(50);
    registry.relayView('a', viewAt(3));
    expect(ofType('b', 'peerView').map((m) => m.view.t)).toEqual([1, 3]);
  });

  it('caps a 60 Hz flood at 10 per second', () => {
    startedRoom(['a', 'b']);
    for (let i = 0; i < 60; i++) {
      registry.relayView('a', viewAt(i));
      timers.advance(1000 / 60);
    }
    expect(ofType('b', 'peerView').length).toBeLessThanOrEqual(10);
    expect(ofType('b', 'peerView').length).toBeGreaterThanOrEqual(9);
  });

  it('is dropped during the countdown, after elimination and after finished', () => {
    setup(3);
    startedRoom(['a', 'b', 'c'], { play: false });
    expect(registry.relayView('a', view)).toBeNull();
    expect(ofType('b', 'peerView')).toEqual([]);
    timers.advance(START_DELAY_MS);
    registry.died('c', 0);
    timers.advance(200);
    expect(registry.relayView('c', view)).toBeNull();
    expect(ofType('a', 'peerView')).toEqual([]);
    registry.died('b', 0);
    timers.advance(200);
    expect(result('a')).toBeDefined();
    expect(registry.relayView('a', view)).toBeNull();
    expect(ofType('b', 'peerView')).toEqual([]);
  });

  it('is a wrongPhase violation from the lobby or without a room', () => {
    registry.createRoom('a', 'Alice');
    expect(registry.relayView('a', view)).toEqual({ error: 'wrongPhase', violation: true });
    expect(registry.relayView('x', view)).toEqual({ error: 'wrongPhase', violation: true });
  });

  it('a new match resets the throttle', () => {
    startedRoom(['a', 'b']);
    registry.relayView('a', viewAt(1));
    const stamp = timers.now;
    registry.died('b', 0);
    timers.advance(REMATCH_DELAY_MS + 200);
    expect(lastState('a').phase).toBe('lobby');
    for (const id of ['a', 'b']) expect(registry.setReady(id, true)).toBeNull();
    expect(registry.startMatch('a')).toBeNull();
    timers.advance(START_DELAY_MS);
    // Wind the clock back to 10 ms after the old match's last view: only a cleared stamp lets this one through.
    timers.now = stamp + 10;
    registry.relayView('a', viewAt(2));
    expect(ofType('b', 'peerView').map((m) => m.view.t)).toEqual([1, 2]);
  });
});

describe('interference', () => {
  it('reaches only the opponent with 2 players', () => {
    startedRoom(['a', 'b']);
    expect(registry.interference('a', 'swarm')).toBeNull();
    expect(ofType('b', 'interferenceIncoming')).toEqual([
      { type: 'interferenceIncoming', kind: 'swarm', fromPlayerId: 'a', fromNickname: 'a' },
    ]);
    expect(ofType('a', 'interferenceIncoming')).toEqual([]);
  });

  it('picks a living opponent with the injected RNG among several', () => {
    setup(4);
    startedRoom(['a', 'b', 'c', 'd']);
    registry.died('c', 0);
    // Living opponents of a: b, d. Pick index 1 → d.
    picks.push(1);
    registry.interference('a', 'eliteCall');
    expect(ofType('d', 'interferenceIncoming')).toHaveLength(1);
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(0);
    expect(ofType('c', 'interferenceIncoming')).toHaveLength(0);
  });

  it('is dropped from a dead sender, in countdown and with no living opponent', () => {
    setup(3);
    startedRoom(['a', 'b', 'c'], { play: false });
    registry.interference('a', 'swarm'); // countdown
    timers.advance(START_DELAY_MS);
    registry.died('a', 0);
    registry.interference('a', 'swarm'); // dead sender
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(0);
    expect(ofType('c', 'interferenceIncoming')).toHaveLength(0);
  });

  it('caps each sender per match by the drop rules and refills one per drop interval (#21)', () => {
    startedRoom(['a', 'b']);
    for (let i = 0; i < 50; i++) registry.interference('a', 'swarm');
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(INTERFERENCE_SEND_LIMIT.burst);
    // The capped messages are dropped silently, not violations.
    expect(registry.interference('a', 'swarm')).toBeNull();
    timers.advance(INTERFERENCE_RULES.minIntervalS * 1000 - 100);
    registry.interference('a', 'gemThief');
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(INTERFERENCE_SEND_LIMIT.burst);
    timers.advance(100);
    registry.interference('a', 'gemThief');
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(INTERFERENCE_SEND_LIMIT.burst + 1);
    // The other player's budget is its own.
    registry.interference('b', 'eliteCall');
    expect(ofType('a', 'interferenceIncoming')).toHaveLength(1);
  });

  it('admits honest play: two lying pickups collected together, then one per drop interval', () => {
    startedRoom(['a', 'b']);
    for (let n = 0; n < 40; n++) {
      registry.interference('a', 'swarm');
      if (n < 2) registry.interference('a', 'swarm');
      timers.advance(INTERFERENCE_RULES.minIntervalS * 1000);
    }
    expect(ofType('b', 'interferenceIncoming')).toHaveLength(42);
  });
});

describe('win rule (ADR 0005)', () => {
  it('last alive wins', () => {
    startedRoom(['a', 'b']);
    registry.died('b', 5);
    expect(ofType('b', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'died' },
    ]);
    expect(result('a')).toBeUndefined(); // decided after the 100 ms window
    timers.advance(100);
    expect(result('a')).toEqual({
      type: 'matchResult',
      outcome: 'win',
      winnerId: 'a',
      ranking: [
        { playerId: 'a', nickname: 'a', alive: true, kills: 0 },
        { playerId: 'b', nickname: 'b', alive: false, kills: 5 },
      ],
    });
    expect(result('b')).toEqual(result('a'));
  });

  it('last alive wins among 3 players', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    registry.died('a', 1);
    timers.advance(5000);
    expect(result('b')).toBeUndefined();
    registry.died('c', 2);
    timers.advance(100);
    expect(result('b')?.winnerId).toBe('b');
    expect(result('b')?.ranking.map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
  });

  it('survived with more kills wins', () => {
    startedRoom(['a', 'b']);
    registry.survived('a', 10);
    expect(result('a')).toBeUndefined();
    registry.survived('b', 12);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' });
    expect(result('a')?.ranking.map((r) => [r.playerId, r.alive, r.kills])).toEqual([
      ['b', true, 12],
      ['a', true, 10],
    ]);
  });

  it('survived with equal kills is a draw', () => {
    startedRoom(['a', 'b']);
    registry.survived('a', 7);
    registry.survived('b', 7);
    expect(result('a')).toMatchObject({ outcome: 'draw', winnerId: null });
  });

  it('a survivor wins over a player who dies after the time limit', () => {
    startedRoom(['a', 'b']);
    registry.survived('a', 1);
    registry.died('b', 50);
    timers.advance(100);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'a' });
  });

  it('deaths 50 ms apart are a draw', () => {
    startedRoom(['a', 'b']);
    registry.died('a', 3);
    timers.advance(50);
    registry.died('b', 4);
    timers.advance(100);
    expect(result('a')).toMatchObject({ outcome: 'draw', winnerId: null });
    expect(result('a')?.ranking.every((r) => !r.alive)).toBe(true);
  });

  it('deaths 150 ms apart: the later one wins', () => {
    startedRoom(['a', 'b']);
    registry.died('a', 3);
    timers.advance(150);
    registry.died('b', 4); // arrives after the result: dropped
    timers.advance(100);
    expect(ofType('a', 'matchResult')).toHaveLength(1);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' });
  });

  it('disconnect: the player counts as dead only after the 10 s grace', () => {
    startedRoom(['a', 'b']);
    registry.disconnect('b');
    expect(lastState('a').players.find((p) => p.id === 'b')?.connected).toBe(false);
    timers.advance(DISCONNECT_GRACE_MS - 1);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    timers.advance(1);
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'disconnected' },
    ]);
    timers.advance(100);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'a' });
    expect(ofType('b', 'matchResult')).toHaveLength(0);
  });

  it('leaveRoom during a match eliminates at once', () => {
    startedRoom(['a', 'b']);
    registry.leaveRoom('b');
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'disconnected' },
    ]);
    timers.advance(100);
    expect(result('a')?.winnerId).toBe('a');
  });

  it('the room is deleted when the last player disconnects mid-match', () => {
    const code = startedRoom(['a', 'b']);
    registry.disconnect('a');
    registry.disconnect('b');
    expect(registry.view(code)).toBeNull();
    expect(timers.count).toBe(0);
  });

  it('a disconnected player is pruned when the room returns to the lobby', () => {
    startedRoom(['a', 'b']);
    registry.disconnect('b');
    timers.advance(DISCONNECT_GRACE_MS + 100 + REMATCH_DELAY_MS);
    const lobby = lastState('a');
    expect(lobby.phase).toBe('lobby');
    expect(lobby.players.map((p) => p.id)).toEqual(['a']);
  });
});

describe('away from keyboard (ADR 0005)', () => {
  it('a tab hidden for 30 s forfeits', () => {
    startedRoom(['a', 'b']);
    registry.visibility('b', true);
    expect(ofType('a', 'peerAway')).toEqual([{ type: 'peerAway', playerId: 'b', away: true }]);
    timers.advance(AFK_FORFEIT_MS - 1);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    timers.advance(1);
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'afk' },
    ]);
    timers.advance(100);
    expect(result('a')?.winnerId).toBe('a');
  });

  it('showing the tab again at 29 s cancels the forfeit', () => {
    startedRoom(['a', 'b']);
    registry.visibility('b', true);
    timers.advance(29_000);
    registry.visibility('b', false);
    expect(ofType('a', 'peerAway').at(-1)).toEqual({
      type: 'peerAway',
      playerId: 'b',
      away: false,
    });
    timers.advance(60_000);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    expect(result('a')).toBeUndefined();
  });

  it('the timer counts consecutive hidden time only', () => {
    startedRoom(['a', 'b']);
    registry.visibility('b', true);
    timers.advance(20_000);
    registry.visibility('b', false);
    registry.visibility('b', true);
    timers.advance(20_000);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    timers.advance(10_000);
    expect(ofType('a', 'playerEliminated')).toHaveLength(1);
  });

  it('starts during the countdown too', () => {
    startedRoom(['a', 'b'], { play: false });
    registry.visibility('a', true);
    timers.advance(AFK_FORFEIT_MS + 100);
    expect(result('b')?.winnerId).toBe('b');
  });

  it('a disconnect replaces the AFK timer with the grace timer', () => {
    startedRoom(['a', 'b']);
    registry.visibility('b', true);
    timers.advance(25_000);
    registry.disconnect('b');
    timers.advance(5_000); // the AFK timer would have fired here
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    timers.advance(DISCONNECT_GRACE_MS - 5_000);
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'disconnected' },
    ]);
  });

  it('is ignored in the lobby but needs a room', () => {
    registry.createRoom('a', 'Alice');
    expect(registry.visibility('a', true)).toBeNull();
    expect(registry.visibility('x', true)).toEqual({ error: 'wrongPhase', violation: true });
  });
});

describe('late in-match messages', () => {
  it('are dropped after the result without counting a violation', () => {
    startedRoom(['a', 'b']);
    registry.died('b', 0);
    timers.advance(100);
    expect(registry.status('a', baseStatus)).toBeNull();
    expect(registry.died('a', 1)).toBeNull();
    expect(registry.survived('a', 1)).toBeNull();
    expect(registry.interference('a', 'swarm')).toBeNull();
    expect(ofType('a', 'matchResult')).toHaveLength(1);
  });

  it('a second died from the same player changes nothing', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    registry.died('a', 1);
    registry.died('a', 9);
    expect(ofType('b', 'playerEliminated')).toHaveLength(1);
  });
});

describe('match deadline (#60)', () => {
  /** From `startAt` (where `startedRoom` leaves the clock) to the deadline: 910 s. */
  const DEADLINE_MS = (MATCH_TIME_LIMIT_S + MATCH_DEADLINE_GRACE_S) * 1000;

  it('is 900 s plus 10 s', () => {
    expect(MATCH_TIME_LIMIT_S).toBe(900);
    expect(MATCH_DEADLINE_GRACE_S).toBe(10);
    expect(DEADLINE_MS).toBe(910_000);
  });

  it('a silent opponent: the result arrives at 910 s, decided by kills from the last status', () => {
    startedRoom(['a', 'b']);
    const startAt = timers.now;
    timers.advance(60_000);
    registry.status('b', { ...baseStatus, kills: 5 }); // b's last report, then silence
    timers.advance(MATCH_TIME_LIMIT_S * 1000 - 60_000);
    registry.survived('a', 8);
    timers.advance(MATCH_DEADLINE_GRACE_S * 1000 - 1);
    expect(result('a')).toBeUndefined();
    timers.advance(1);
    expect(timers.now - startAt).toBe(910_000);
    expect(result('a')).toEqual({
      type: 'matchResult',
      outcome: 'win',
      winnerId: 'a',
      ranking: [
        { playerId: 'a', nickname: 'a', alive: true, kills: 8 },
        { playerId: 'b', nickname: 'b', alive: true, kills: 5 },
      ],
    });
    expect(result('b')).toEqual(result('a'));
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    expect(lastState('a').phase).toBe('finished');
  });

  it('the silent player wins when their last relayed kills are higher', () => {
    startedRoom(['a', 'b']);
    registry.status('b', { ...baseStatus, kills: 30 });
    timers.advance(MATCH_TIME_LIMIT_S * 1000);
    registry.survived('a', 8);
    timers.advance(MATCH_DEADLINE_GRACE_S * 1000);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' });
  });

  it('both players silent with equal kills: a draw at the deadline', () => {
    startedRoom(['a', 'b']);
    registry.status('a', { ...baseStatus, kills: 4 });
    registry.status('b', { ...baseStatus, kills: 4 });
    timers.advance(DEADLINE_MS - 1);
    expect(result('a')).toBeUndefined();
    timers.advance(1);
    expect(result('a')).toMatchObject({ outcome: 'draw', winnerId: null });
  });

  it('a player who died earlier still loses to the silent survivor at the deadline (3 players)', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    registry.died('c', 50);
    timers.advance(1000);
    expect(result('a')).toBeUndefined();
    registry.status('a', { ...baseStatus, kills: 2 });
    registry.status('b', { ...baseStatus, kills: 3 });
    timers.advance(DEADLINE_MS - 1000);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' });
    expect(result('a')?.ranking.map((r) => [r.playerId, r.alive])).toEqual([
      ['b', true],
      ['a', true],
      ['c', false],
    ]);
  });

  it('an earlier normal end clears the deadline timer', () => {
    startedRoom(['a', 'b']);
    registry.died('b', 1);
    timers.advance(100);
    expect(result('a')?.winnerId).toBe('a');
    expect(timers.count).toBe(1); // only the rematch reset
    timers.advance(DEADLINE_MS);
    expect(ofType('a', 'matchResult')).toHaveLength(1);
  });

  it("the first match's deadline never ends a rematch early", () => {
    startedRoom(['a', 'b']);
    registry.survived('a', 1);
    registry.survived('b', 2);
    expect(result('a')?.winnerId).toBe('b');
    timers.advance(REMATCH_DELAY_MS);
    expect(lastState('a').phase).toBe('lobby');
    registry.setReady('a', true);
    registry.setReady('b', true);
    expect(registry.startMatch('a')).toBeNull();
    timers.advance(START_DELAY_MS);
    // The first match's deadline (≈ 5 s ago + 910 s) passes without ending the rematch.
    timers.advance(DEADLINE_MS - 1);
    expect(ofType('a', 'matchResult')).toHaveLength(1);
    timers.advance(1);
    expect(ofType('a', 'matchResult')).toHaveLength(2);
  });

  it('a disconnect more than 10 s before the deadline follows the 10 s rule and ends the match first', () => {
    startedRoom(['a', 'b']);
    timers.advance(DEADLINE_MS - 15_000); // 895 s
    registry.disconnect('b');
    timers.advance(DISCONNECT_GRACE_MS); // 905 s
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'disconnected' },
    ]);
    timers.advance(100);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'a' });
    timers.advance(5000);
    expect(ofType('a', 'matchResult')).toHaveLength(1);
  });

  it('a death decision pending at the deadline still decides last alive', () => {
    startedRoom(['a', 'b']);
    timers.advance(DEADLINE_MS - 50);
    registry.died('b', 99);
    timers.advance(50); // deadline fires inside the 100 ms window
    expect(result('a')).toBeUndefined();
    timers.advance(50);
    expect(ofType('a', 'matchResult')).toHaveLength(1);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'a' });
  });

  it('a death decision pending at the deadline with the opponent disconnected: deaths 50 ms apart draw', () => {
    startedRoom(['a', 'b']);
    timers.advance(DEADLINE_MS - 5000);
    registry.disconnect('b');
    timers.advance(4950);
    registry.died('a', 3); // b is still inside the grace, so a last-alive decision is pending
    timers.advance(50); // deadline: b dies now, 50 ms after a
    timers.advance(50);
    expect(result('a')).toMatchObject({ outcome: 'draw', winnerId: null });
  });

  it('uses the injected time limit', () => {
    setup(2, 5000);
    startedRoom(['a', 'b']);
    timers.advance(5000 + MATCH_DEADLINE_GRACE_S * 1000 - 1);
    expect(result('a')).toBeUndefined();
    timers.advance(1);
    expect(result('a')).toMatchObject({ outcome: 'draw' });
  });

  it('is scheduled from matchStart, so it counts from startAt', () => {
    startedRoom(['a', 'b'], { play: false });
    timers.advance(START_DELAY_MS + DEADLINE_MS - 1);
    expect(result('a')).toBeUndefined();
    timers.advance(1);
    expect(result('a')).toBeDefined();
  });
});

describe('disconnected at the match deadline (ADR 0014, #64)', () => {
  const DEADLINE_MS = (MATCH_TIME_LIMIT_S + MATCH_DEADLINE_GRACE_S) * 1000;

  it('a player disconnected 5 s before the deadline with more kills loses to the connected player', () => {
    startedRoom(['a', 'b']);
    registry.status('b', { ...baseStatus, kills: 11 });
    timers.advance(DEADLINE_MS - 5000); // 905 s
    registry.status('a', { ...baseStatus, kills: 7 });
    registry.disconnect('b'); // the grace would end at 915 s
    timers.advance(4999);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    timers.advance(1); // 910 s: b dies at the deadline instant
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'b', reason: 'disconnected' },
    ]);
    timers.advance(100); // the ADR 0005 simultaneous-death window
    expect(result('a')).toEqual({
      type: 'matchResult',
      outcome: 'win',
      winnerId: 'a',
      ranking: [
        { playerId: 'a', nickname: 'a', alive: true, kills: 7 },
        { playerId: 'b', nickname: 'b', alive: false, kills: 11 },
      ],
    });
    expect(ofType('b', 'matchResult')).toHaveLength(0); // b's socket is closed
    timers.advance(DISCONNECT_GRACE_MS);
    expect(ofType('a', 'playerEliminated')).toHaveLength(1); // the grace timer never fires a second time
    expect(ofType('a', 'matchResult')).toHaveLength(1);
  });

  it('a player who reported survived and then disconnected still loses', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    timers.advance(MATCH_TIME_LIMIT_S * 1000);
    registry.survived('b', 40);
    registry.survived('a', 2);
    timers.advance(5000);
    registry.disconnect('b'); // c never reports, so the match waits for the deadline
    registry.status('c', { ...baseStatus, kills: 1 });
    timers.advance(MATCH_DEADLINE_GRACE_S * 1000 - 5000);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'a' });
    expect(result('a')?.ranking.map((r) => [r.playerId, r.alive])).toEqual([
      ['a', true],
      ['c', true],
      ['b', false],
    ]);
  });

  it('every alive player disconnected at the deadline: one death time, a draw (3 players)', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    registry.died('c', 50); // c stays connected but dead, so the room survives b and a leaving
    registry.status('a', { ...baseStatus, kills: 5 });
    registry.status('b', { ...baseStatus, kills: 9 });
    timers.advance(DEADLINE_MS - 3000);
    registry.disconnect('a');
    registry.disconnect('b');
    timers.advance(3000); // deadline
    expect(ofType('c', 'playerEliminated').map((m) => m.playerId)).toEqual(['c', 'a', 'b']);
    expect(result('c')).toBeUndefined();
    timers.advance(100);
    expect(result('c')).toMatchObject({ outcome: 'draw', winnerId: null });
  });

  it('players connected at the deadline keep the #60 handling while the disconnected one loses (3 players)', () => {
    setup(3);
    startedRoom(['a', 'b', 'c']);
    registry.status('a', { ...baseStatus, kills: 3 });
    registry.status('b', { ...baseStatus, kills: 5 });
    registry.status('c', { ...baseStatus, kills: 20 });
    timers.advance(DEADLINE_MS - 2000);
    registry.disconnect('c');
    timers.advance(2000);
    expect(ofType('a', 'playerEliminated')).toEqual([
      { type: 'playerEliminated', playerId: 'c', reason: 'disconnected' },
    ]);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' }); // decided at once by kills
    expect(result('a')?.ranking.map((r) => [r.playerId, r.alive, r.kills])).toEqual([
      ['b', true, 5],
      ['a', true, 3],
      ['c', false, 20],
    ]);
  });

  it('nobody disconnected: the deadline sends no playerEliminated and kills decide as before', () => {
    startedRoom(['a', 'b']);
    registry.status('a', { ...baseStatus, kills: 2 });
    registry.status('b', { ...baseStatus, kills: 6 });
    timers.advance(DEADLINE_MS);
    expect(ofType('a', 'playerEliminated')).toHaveLength(0);
    expect(result('a')).toMatchObject({ outcome: 'win', winnerId: 'b' });
  });

  it('a room whose players all disconnect is deleted, so no deadline fires', () => {
    const code = startedRoom(['a', 'b']);
    timers.advance(DEADLINE_MS - 1000);
    registry.disconnect('a');
    registry.disconnect('b');
    expect(registry.view(code)).toBeNull();
    expect(timers.count).toBe(0);
  });
});
