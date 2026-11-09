// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  STATUS_MIN_INTERVAL_MS,
  VIEW_MIN_INTERVAL_MS,
  type PlayerInfo,
  type PlayerView,
} from '@vs/shared';
import type {
  MainToWorker,
  RunSummary,
  WorkerStatus,
  WorkerView,
} from '../../protocol/worker-messages';
import type { VersusResult } from '../ui/versus-result';
import {
  createVersusController,
  headlineOf,
  OFFLINE_BANNER,
  PEER_DEADLINE_NOTE,
  SELF_DEADLINE_NOTE,
  STATUS_SEND_INTERVAL_MS,
  SURVIVED_BANNER,
  VIEW_SEND_INTERVAL_MS,
  type VersusStart,
} from './versusController';
import { fakeNet } from './versus-test-helpers';

const players: PlayerInfo[] = [
  { id: 'a', nickname: 'Alice', ready: true, host: true, connected: true },
  { id: 'b', nickname: 'Bob', ready: true, host: false, connected: true },
];
const start: VersusStart = {
  seed: 77,
  startAt: 10_000,
  roomCode: 'ABCDEF',
  selfId: 'a',
  players,
  characterId: 'swift',
};
const stats = (cleared: boolean): RunSummary => ({
  timeSec: cleared ? 900 : 61.25,
  kills: 12,
  level: 4,
  cleared,
  characterId: 'swift',
  weapons: [],
  passives: [],
});
const status = (elapsedMs: number, alive = true): WorkerStatus => ({
  type: 'status',
  hp: 50,
  maxHp: 100,
  level: 3,
  kills: 7,
  alive,
  elapsedMs,
});

function setup(netState: 'open' | 'connecting' = 'open') {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const f = fakeNet(netState);
  const posted: MainToWorker[] = [];
  const results: VersusResult[] = [];
  let offline = 0;
  let time = 10_000;
  const timers: { cb: () => void; at: number }[] = [];
  const frames: (() => void)[] = [];
  const controller = createVersusController({
    net: f.net,
    post: (m) => posted.push(m),
    root,
    start,
    onResult: (r) => results.push(r),
    onOffline: () => offline++,
    now: () => time,
    setTimer: (cb, ms) => {
      timers.push({ cb, at: time + ms });
      return timers.length;
    },
    clearTimer: (id) => {
      const t = timers[id - 1];
      if (t) t.at = Infinity;
    },
    raf: (cb) => frames.push(cb),
    cancelRaf: () => undefined,
  });
  /** Moves the clock by `ms`, firing each due timer at its own time. */
  const advance = (ms: number) => {
    const end = time + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      time = due.at;
      due.at = Infinity;
      due.cb();
    }
    time = end;
  };
  const flushFrames = () => {
    for (const cb of frames.splice(0)) cb();
  };
  return {
    root,
    ...f,
    posted,
    results,
    controller,
    advance,
    flushFrames,
    offline: () => offline,
    setTime: (t: number) => {
      time = t;
    },
    time: () => time,
  };
}

describe('versusController (#20)', () => {
  it('starts a versus run with the match seed, finale end and the simulate policy, and mounts the panel', () => {
    const t = setup();
    expect(t.posted).toEqual([
      { type: 'setBackgroundPolicy', policy: 'simulate' },
      { type: 'startRun', mode: 'versus', seed: 77, characterId: 'swift', finale: 'end' },
    ]);
    expect([...t.root.querySelectorAll('.opponent-name')].map((n) => n.textContent)).toEqual([
      'Bob',
    ]);
    expect(t.sent).toEqual([]);
  });

  it('forwards worker status as status, never more often than STATUS_MIN_INTERVAL_MS, keeping the latest', () => {
    const t = setup();
    expect(STATUS_SEND_INTERVAL_MS).toBeGreaterThanOrEqual(STATUS_MIN_INTERVAL_MS);
    t.controller.status(status(250));
    expect(t.sent).toEqual([
      {
        type: 'status',
        status: { hp: 50, maxHp: 100, level: 3, kills: 7, alive: true, elapsedMs: 250 },
      },
    ]);
    // A worker status every 250 ms for 10 s, with ±20 ms jitter.
    for (let i = 2; i <= 41; i++) {
      t.advance(i % 2 === 0 ? 230 : 270);
      t.controller.status(status(i * 250));
    }
    t.advance(1000);
    const statuses = t.sent.filter((m) => m.type === 'status');
    expect(statuses.length).toBeGreaterThanOrEqual(36);
    expect(statuses.length).toBeLessThanOrEqual(41);
    // The last one sent is the latest the worker reported.
    expect(statuses.at(-1)).toMatchObject({ status: { elapsedMs: 41 * 250 } });
  });

  it('spaces sends by at least the interval in wall time', () => {
    const t = setup();
    const times: number[] = [];
    const send = t.net.send.bind(t.net);
    t.net.send = (m) => {
      if (m.type === 'status') times.push(t.time());
      return send(m);
    };
    for (let i = 1; i <= 80; i++) {
      t.advance(125);
      t.controller.status(status(i * 125));
    }
    t.advance(500);
    for (let i = 1; i < times.length; i++)
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(STATUS_MIN_INTERVAL_MS);
    // 10 s at about 4 per second.
    expect(times.length).toBeGreaterThanOrEqual(30);
    expect(times.length).toBeLessThanOrEqual(41);
  });

  it('gameOver sends died with elapsedMs from timeSec, or survived and shows the waiting banner', () => {
    const dead = setup();
    dead.controller.gameOver(stats(false));
    expect(dead.sent).toEqual([{ type: 'died', kills: 12, elapsedMs: 61_250 }]);
    dead.controller.status(status(62_000));
    dead.controller.gameOver(stats(false));
    expect(dead.sent).toHaveLength(1);
    const alive = setup();
    alive.controller.gameOver(stats(true));
    expect(alive.sent).toEqual([{ type: 'survived', kills: 12 }]);
    expect(alive.root.querySelector('.versus-banner')?.textContent).toBe(SURVIVED_BANNER);
  });

  it('matchResult sends forceEnd, restores the pause policy and maps the headline', () => {
    expect(headlineOf({ outcome: 'win', winnerId: 'a' }, 'a')).toBe('Win');
    expect(headlineOf({ outcome: 'win', winnerId: 'b' }, 'a')).toBe('Lose');
    expect(headlineOf({ outcome: 'draw', winnerId: null }, 'a')).toBe('Draw');
    for (const [outcome, winnerId, headline] of [
      ['win', 'a', 'Win'],
      ['win', 'b', 'Lose'],
      ['draw', null, 'Draw'],
    ] as const) {
      const t = setup();
      t.posted.length = 0;
      const ranking = [
        { playerId: winnerId ?? 'a', nickname: 'W', alive: winnerId !== null, kills: 3 },
        { playerId: winnerId === 'a' ? 'b' : 'a', nickname: 'L', alive: false, kills: 1 },
      ];
      t.emit({ type: 'matchResult', outcome, winnerId, ranking });
      expect(t.posted).toEqual([
        { type: 'forceEnd', reason: 'matchOver' },
        { type: 'setBackgroundPolicy', policy: 'pause' },
      ]);
      expect(t.results).toEqual([{ kind: 'official', headline, ranking, out: {}, note: null }]);
      // Nothing more is sent after the result.
      t.controller.status(status(1000));
      t.controller.gameOver(stats(false));
      expect(t.sent).toEqual([]);
    }
  });

  it('a result at the server deadline notes who was counted as survived (#60)', () => {
    const ranking = [
      { playerId: 'a', nickname: 'Alice', alive: true, kills: 9 },
      { playerId: 'b', nickname: 'Bob', alive: true, kills: 4 },
    ];
    // This world was still playing (behind wall time after its level-ups): the server counted it as survived.
    const behind = setup();
    behind.emit({ type: 'matchResult', outcome: 'win', winnerId: 'a', ranking });
    expect(behind.results[0]).toMatchObject({ headline: 'Win', note: SELF_DEADLINE_NOTE });
    // This player survived; the result came at the deadline, so the opponent was counted as survived.
    const waited = setup();
    waited.controller.gameOver(stats(true));
    waited.setTime(10_000 + 910_000);
    waited.emit({ type: 'matchResult', outcome: 'win', winnerId: 'a', ranking });
    expect(waited.results[0]).toMatchObject({ note: PEER_DEADLINE_NOTE });
    // Both survived well before the deadline: no note.
    const normal = setup();
    normal.controller.gameOver(stats(true));
    normal.setTime(10_000 + 300_000);
    normal.emit({ type: 'matchResult', outcome: 'draw', winnerId: null, ranking });
    expect(normal.results[0]).toMatchObject({ headline: 'Draw', note: null });
  });

  it('the socket leaving open shows the banner, stops sending, and a local gameOver gives the unofficial result', () => {
    const t = setup();
    t.setState('connecting');
    expect(t.offline()).toBe(1);
    expect(t.root.querySelector('.versus-banner')?.textContent).toBe(OFFLINE_BANNER);
    t.setState('open');
    t.controller.status(status(500));
    expect(t.sent).toEqual([]);
    t.controller.gameOver(stats(false));
    expect(t.results).toEqual([{ kind: 'unofficial', stats: stats(false) }]);
    expect(t.posted.at(-1)).toEqual({ type: 'setBackgroundPolicy', policy: 'pause' });
    expect(t.offline()).toBe(1);
  });

  it('visibilitychange sends visibility; peer messages reach the panel', () => {
    const t = setup();
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(t.sent).toEqual([
      { type: 'visibility', hidden: true },
      { type: 'visibility', hidden: false },
    ]);
    const row = () => t.root.querySelector('.opponent');
    t.emit({ type: 'peerAway', playerId: 'b', away: true });
    expect(row()?.getAttribute('data-badge')).toBe('away');
    t.emit({ type: 'peerStatus', playerId: 'b', status: { ...status(1000), kills: 31 } });
    t.flushFrames();
    expect(row()?.querySelector('.opponent-kills')?.textContent).toBe('Kills 31');
    t.emit({
      type: 'roomState',
      code: 'ABCDEF',
      maxPlayers: 2,
      phase: 'playing',
      players: players.map((p) => (p.id === 'b' ? { ...p, connected: false } : p)),
    });
    expect(row()?.getAttribute('data-badge')).toBe('disconnected');
    t.emit({ type: 'playerEliminated', playerId: 'b', reason: 'afk' });
    expect(row()?.getAttribute('data-badge')).toBe('forfeited');
    t.emit({ type: 'matchResult', outcome: 'win', winnerId: 'a', ranking: [] });
    expect(t.results[0]).toMatchObject({ out: { b: 'afk' } });
    Reflect.deleteProperty(document, 'hidden');
  });

  it('this player eliminated (afk) stops its status; dispose removes everything once', () => {
    const t = setup();
    t.emit({ type: 'playerEliminated', playerId: 'a', reason: 'afk' });
    t.controller.status(status(500));
    expect(t.sent).toEqual([]);
    t.posted.length = 0;
    t.controller.dispose();
    t.controller.dispose();
    expect(t.posted).toEqual([{ type: 'setBackgroundPolicy', policy: 'pause' }]);
    expect(t.listeners()).toBe(0);
    expect(t.root.children).toHaveLength(0);
  });

  it('starts offline when the socket is not open', () => {
    const t = setup('connecting');
    expect(t.root.querySelector('.versus-banner')?.textContent).toBe(OFFLINE_BANNER);
    t.controller.gameOver(stats(true));
    expect(t.results[0]?.kind).toBe('unofficial');
  });
});

describe('interference (#21)', () => {
  it('sends a collected interference to the server and lets the server pick the target', () => {
    const t = setup();
    t.controller.interferenceCollected('swarm');
    expect(t.sent).toEqual([{ type: 'interference', kind: 'swarm' }]);
  });

  it('applies an incoming interference in the worker and names the sender on a banner, without the nickname', () => {
    const t = setup();
    t.posted.length = 0;
    t.emit({
      type: 'interferenceIncoming',
      kind: 'gemThief',
      fromPlayerId: 'b',
      fromNickname: '<b>밥</b>',
    });
    expect(t.posted).toEqual([{ type: 'applyInterference', kind: 'gemThief' }]);
    expect(t.controller.banners()).toEqual(['<b>밥</b> sent Gem Thief!']);
    const banner = t.root.querySelector('.interference-banner');
    expect(banner?.textContent).toBe('<b>밥</b> sent Gem Thief!');
    expect(banner?.querySelector('b')).toBeNull();
    t.advance(3_000);
    expect(t.controller.banners()).toEqual([]);
    expect(t.root.querySelector('.interference-banner')).toBeNull();
  });

  it('stops sending and applying once this player is out, and removes the banners on dispose', () => {
    const t = setup();
    t.emit({ type: 'interferenceIncoming', kind: 'swarm', fromPlayerId: 'b', fromNickname: 'Bob' });
    t.controller.dispose();
    expect(t.root.querySelector('.interference-banners')).toBeNull();
    const u = setup();
    u.emit({ type: 'playerEliminated', playerId: 'a', reason: 'died' });
    u.posted.length = 0;
    u.controller.interferenceCollected('swarm');
    u.emit({ type: 'interferenceIncoming', kind: 'swarm', fromPlayerId: 'b', fromNickname: 'Bob' });
    expect(u.sent.filter((m) => m.type === 'interference')).toEqual([]);
    expect(u.posted).toEqual([]);
  });
});

describe('view stream (#114, ADR 0018)', () => {
  const pv = (t: number): PlayerView => ({
    t,
    x: 1,
    y: 2,
    f: 0,
    c: 0,
    h: 1000,
    e: [],
    g: [],
    p: [],
  });
  const wv = (t: number): WorkerView => ({ type: 'view', view: pv(t) });

  function recordViews(t: ReturnType<typeof setup>): number[] {
    const times: number[] = [];
    const send = t.net.send.bind(t.net);
    t.net.send = (m) => {
      if (m.type === 'view') times.push(t.time());
      return send(m);
    };
    return times;
  }

  it('never sends two views within 110 ms, keeping the latest', () => {
    expect(VIEW_SEND_INTERVAL_MS).toBe(VIEW_MIN_INTERVAL_MS + 10);
    const t = setup();
    const times = recordViews(t);
    // A worker view every 100 ms of wall time with ±15 ms jitter, for 10 s.
    for (let i = 1; i <= 100; i++) {
      t.advance(i % 2 === 0 ? 85 : 115);
      t.controller.view(wv(i * 100));
    }
    t.advance(500);
    for (let i = 1; i < times.length; i++)
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(VIEW_SEND_INTERVAL_MS);
    expect(times.length).toBeGreaterThanOrEqual(80);
    expect(times.length).toBeLessThanOrEqual(91);
    const views = t.sent.filter((m) => m.type === 'view');
    expect(views.at(-1)).toEqual({ type: 'view', view: pv(10_000) });
  });

  it('sends none while hidden, and drops a pending one on hiding', () => {
    const t = setup();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    t.controller.view(wv(100));
    t.controller.view(wv(200)); // pending behind the first
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    t.advance(500);
    t.controller.view(wv(300));
    t.advance(500);
    expect(t.sent.filter((m) => m.type === 'view')).toEqual([{ type: 'view', view: pv(100) }]);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    t.controller.view(wv(400));
    expect(t.sent.filter((m) => m.type === 'view').at(-1)).toEqual({ type: 'view', view: pv(400) });
    Reflect.deleteProperty(document, 'hidden');
  });

  it('sends none after this player died, after being eliminated, after the result or offline', () => {
    const died = setup();
    died.controller.gameOver(stats(false));
    died.controller.view(wv(1));
    expect(died.sent.some((m) => m.type === 'view')).toBe(false);

    const out = setup();
    out.controller.view(wv(1));
    out.controller.view(wv(2)); // pending
    out.emit({ type: 'playerEliminated', playerId: 'a', reason: 'afk' });
    out.advance(500);
    out.controller.view(wv(3));
    expect(out.sent.filter((m) => m.type === 'view')).toEqual([{ type: 'view', view: pv(1) }]);

    const result = setup();
    result.emit({ type: 'matchResult', outcome: 'win', winnerId: 'b', ranking: [] });
    result.controller.view(wv(1));
    expect(result.sent.some((m) => m.type === 'view')).toBe(false);

    const offline = setup();
    offline.setState('closed');
    offline.controller.view(wv(1));
    expect(offline.sent.some((m) => m.type === 'view')).toBe(false);
  });

  it("forwards only the first opponent's peerView to the worker, until the result", () => {
    const t = setup();
    expect(t.controller.opponentId).toBe('b');
    t.posted.length = 0;
    t.emit({ type: 'peerView', playerId: 'b', view: pv(5) });
    t.emit({ type: 'peerView', playerId: 'c', view: pv(6) });
    t.emit({ type: 'peerView', playerId: 'a', view: pv(7) });
    expect(t.posted).toEqual([{ type: 'opponentView', view: pv(5) }]);
    t.emit({ type: 'matchResult', outcome: 'win', winnerId: 'a', ranking: [] });
    t.posted.length = 0;
    t.emit({ type: 'peerView', playerId: 'b', view: pv(8) });
    expect(t.posted).toEqual([]);
  });
});

describe('opponent pane state (#115)', () => {
  const states = (posted: MainToWorker[]) =>
    posted.flatMap((m) => (m.type === 'opponentState' ? [m.state] : []));

  it('posts away while the opponent is hidden or disconnected, live when both clear, and out once eliminated', () => {
    const t = setup();
    expect(states(t.posted)).toEqual([]);
    t.emit({ type: 'peerAway', playerId: 'b', away: true });
    t.emit({
      type: 'roomState',
      code: 'ABCDEF',
      maxPlayers: 2,
      phase: 'playing',
      players: players.map((p) => (p.id === 'b' ? { ...p, connected: false } : p)),
    });
    t.emit({ type: 'peerAway', playerId: 'b', away: false });
    expect(states(t.posted)).toEqual(['away']);
    t.emit({ type: 'roomState', code: 'ABCDEF', maxPlayers: 2, phase: 'playing', players });
    expect(states(t.posted)).toEqual(['away', 'live']);
    t.emit({ type: 'playerEliminated', playerId: 'b', reason: 'disconnected' });
    t.emit({ type: 'peerAway', playerId: 'b', away: true });
    expect(states(t.posted)).toEqual(['away', 'live', 'out']);
  });

  it('ignores this player and players other than the first opponent', () => {
    const t = setup();
    t.emit({ type: 'peerAway', playerId: 'c', away: true });
    t.emit({ type: 'playerEliminated', playerId: 'a', reason: 'afk' });
    expect(states(t.posted)).toEqual([]);
  });
});
