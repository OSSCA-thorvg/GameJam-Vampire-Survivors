import { describe, expect, it } from 'vitest';
import {
  MATCH_DEADLINE_GRACE_S,
  MATCH_DEADLINE_S,
  MATCH_TIME_LIMIT_S,
  MAX_MESSAGE_BYTES,
  NICKNAME_MAX,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  normalizeNickname,
  parseClientMessage,
  parseServerMessage,
  VIEW_ENEMY_MAX,
  VIEW_GEM_MAX,
  VIEW_KIND_MAX,
  VIEW_MAX_BYTES,
  VIEW_PICKUP_MAX,
  VIEW_POS_MAX,
  VIEW_REL_MAX,
  VIEW_TIME_MAX_MS,
  isPlayerView,
  type PlayerStatus,
  type PlayerView,
} from './protocol.js';

const status: PlayerStatus = {
  hp: 50,
  maxHp: 100,
  level: 3,
  kills: 12,
  alive: true,
  elapsedMs: 61_000,
};

const view: PlayerView = {
  t: 12_340,
  x: -153,
  y: 88,
  f: 1,
  c: 2,
  h: 750,
  e: [0, 10, -12, 5, -180, 180],
  g: [2, 3, 4],
  p: [5, 0, 12],
};

/** One valid and at least two invalid cases per client message type. */
const clientCases: Record<string, { valid: unknown; invalid: unknown[] }> = {
  hello: {
    valid: { type: 'hello', v: PROTOCOL_VERSION },
    invalid: [
      { type: 'hello' },
      { type: 'hello', v: '1' },
      { type: 'hello', v: -1 },
      { type: 'hello', v: 1.5 },
    ],
  },
  createRoom: {
    valid: { type: 'createRoom', nickname: 'Alice' },
    invalid: [
      { type: 'createRoom' },
      { type: 'createRoom', nickname: 5 },
      { type: 'createRoom', nickname: 'x'.repeat(65) },
    ],
  },
  joinRoom: {
    valid: { type: 'joinRoom', code: 'ABC234', nickname: 'Bob' },
    invalid: [
      { type: 'joinRoom', code: 'abc234', nickname: 'Bob' },
      { type: 'joinRoom', code: 'ABC23', nickname: 'Bob' },
      { type: 'joinRoom', code: 'ABC10O', nickname: 'Bob' },
      { type: 'joinRoom', code: 'ABC234' },
    ],
  },
  leaveRoom: {
    valid: { type: 'leaveRoom' },
    invalid: [{ type: 'leaveRoom', now: true }, { type: 'leaveroom' }],
  },
  setReady: {
    valid: { type: 'setReady', ready: true },
    invalid: [
      { type: 'setReady' },
      { type: 'setReady', ready: 'yes' },
      { type: 'setReady', ready: 1 },
    ],
  },
  startMatch: {
    valid: { type: 'startMatch' },
    invalid: [{ type: 'startMatch', seed: 1 }, { type: 'StartMatch' }],
  },
  status: {
    valid: { type: 'status', status },
    invalid: [
      { type: 'status', status: { ...status, hp: 101 } },
      { type: 'status', status: { ...status, kills: -1 } },
      { type: 'status', status: { ...status, level: 2.5 } },
      { type: 'status', status: { ...status, elapsedMs: Number.POSITIVE_INFINITY } },
      { type: 'status', status: { ...status, alive: 'true' } },
      { type: 'status', status: { ...status, extra: 1 } },
      { type: 'status', status: [1, 2] },
      { type: 'status' },
    ],
  },
  interference: {
    valid: { type: 'interference', kind: 'gemThief' },
    invalid: [
      { type: 'interference', kind: 'nuke' },
      { type: 'interference' },
      { type: 'interference', kind: 1 },
    ],
  },
  died: {
    valid: { type: 'died', kills: 7, elapsedMs: 1234.5 },
    invalid: [
      { type: 'died', kills: 7 },
      { type: 'died', kills: -7, elapsedMs: 1 },
      { type: 'died', kills: 7, elapsedMs: Number.NaN },
    ],
  },
  survived: {
    valid: { type: 'survived', kills: 0 },
    invalid: [
      { type: 'survived' },
      { type: 'survived', kills: '3' },
      { type: 'survived', kills: 1.1 },
    ],
  },
  visibility: {
    valid: { type: 'visibility', hidden: false },
    invalid: [
      { type: 'visibility' },
      { type: 'visibility', hidden: 'no' },
      { type: 'visibility', hidden: null },
    ],
  },
  view: {
    valid: { type: 'view', view },
    invalid: [
      { type: 'view' },
      { type: 'view', view: { ...view, extra: 1 } },
      { type: 'view', view: { ...view, h: 1001 } },
      { type: 'view', view: { ...view, f: 2 } },
    ],
  },
};

describe('match timing (ADR 0026)', () => {
  it('keeps the real-time deadline beyond the stage clear time', () => {
    expect(MATCH_TIME_LIMIT_S).toBe(900);
    expect(MATCH_DEADLINE_S).toBe(1500);
    expect(MATCH_DEADLINE_S).toBeGreaterThan(MATCH_TIME_LIMIT_S);
    expect(MATCH_DEADLINE_GRACE_S).toBe(10);
  });
});

describe('parseClientMessage', () => {
  for (const [type, { valid, invalid }] of Object.entries(clientCases)) {
    it(`accepts a valid ${type}`, () => {
      expect(parseClientMessage(valid)).toEqual(valid);
    });
    it(`rejects invalid ${type} messages`, () => {
      expect(invalid.length).toBeGreaterThanOrEqual(2);
      for (const bad of invalid) expect(parseClientMessage(bad), JSON.stringify(bad)).toBeNull();
    });
    it(`rejects ${type} with an extra field`, () => {
      expect(parseClientMessage({ ...(valid as object), extra: 1 })).toBeNull();
    });
  }

  it('covers every client message type', () => {
    expect(Object.keys(clientCases).sort()).toEqual(
      [
        'createRoom',
        'died',
        'hello',
        'interference',
        'joinRoom',
        'leaveRoom',
        'setReady',
        'startMatch',
        'status',
        'survived',
        'view',
        'visibility',
      ].sort(),
    );
  });

  it('rejects non-objects and unknown types', () => {
    for (const bad of [
      null,
      undefined,
      1,
      'hello',
      true,
      [],
      [{ type: 'hello', v: 1 }],
      { type: 'nope' },
      {},
    ]) {
      expect(parseClientMessage(bad)).toBeNull();
    }
  });

  it('rejects inherited and prototype-polluting keys', () => {
    expect(parseClientMessage(JSON.parse('{"type":"leaveRoom","__proto__":{"x":1}}'))).toBeNull();
    expect(parseClientMessage(Object.create({ type: 'leaveRoom' }) as unknown)).toBeNull();
    expect(parseClientMessage({ type: 'toString' })).toBeNull();
    expect(parseClientMessage({ type: 'constructor' })).toBeNull();
  });

  it('rejects an oversized payload', () => {
    const nickname = 'x'.repeat(MAX_MESSAGE_BYTES);
    expect(parseClientMessage({ type: 'createRoom', nickname })).toBeNull();
  });

  it('accepts every alphabet character in a code', () => {
    for (let i = 0; i < ROOM_CODE_ALPHABET.length; i += 6) {
      const code = ROOM_CODE_ALPHABET.slice(i, i + 6).padEnd(6, 'A');
      expect(parseClientMessage({ type: 'joinRoom', code, nickname: 'x' })).not.toBeNull();
    }
  });
});

const player = { id: 'p1', nickname: 'Alice', ready: true, host: true, connected: true };

const serverCases: Record<string, { valid: unknown; invalid: unknown[] }> = {
  welcome: {
    valid: { type: 'welcome', playerId: 'a1b2-c3' },
    invalid: [
      { type: 'welcome' },
      { type: 'welcome', playerId: '' },
      { type: 'welcome', playerId: 'a b' },
    ],
  },
  roomState: {
    valid: { type: 'roomState', code: 'ABC234', maxPlayers: 2, players: [player], phase: 'lobby' },
    invalid: [
      { type: 'roomState', code: 'ABC234', maxPlayers: 2, players: [player], phase: 'paused' },
      {
        type: 'roomState',
        code: 'ABC234',
        maxPlayers: 1,
        players: [player, { ...player, id: 'p2' }],
        phase: 'lobby',
      },
      {
        type: 'roomState',
        code: 'ABC234',
        maxPlayers: 2,
        players: [{ ...player, nickname: ' Alice ' }],
        phase: 'lobby',
      },
      {
        type: 'roomState',
        code: 'ABC234',
        maxPlayers: 2,
        players: [{ ...player, ready: 1 }],
        phase: 'lobby',
      },
    ],
  },
  matchStart: {
    valid: { type: 'matchStart', seed: 0xffff_ffff, startAt: 1_700_000_000_000 },
    invalid: [
      { type: 'matchStart', seed: 2 ** 32, startAt: 1 },
      { type: 'matchStart', seed: 1 },
      { type: 'matchStart', seed: -1, startAt: 1 },
    ],
  },
  peerStatus: {
    valid: { type: 'peerStatus', playerId: 'p2', status },
    invalid: [
      { type: 'peerStatus', playerId: 'p2' },
      { type: 'peerStatus', playerId: 'p2', status: { ...status, hp: 200 } },
    ],
  },
  interferenceIncoming: {
    valid: {
      type: 'interferenceIncoming',
      kind: 'swarm',
      fromPlayerId: 'p1',
      fromNickname: 'Alice',
    },
    invalid: [
      { type: 'interferenceIncoming', kind: 'swarm', fromPlayerId: 'p1' },
      { type: 'interferenceIncoming', kind: 'meteor', fromPlayerId: 'p1', fromNickname: 'Alice' },
      { type: 'interferenceIncoming', kind: 'swarm', fromPlayerId: 'p1', fromNickname: 'A‮b' },
    ],
  },
  playerEliminated: {
    valid: { type: 'playerEliminated', playerId: 'p1', reason: 'afk' },
    invalid: [
      { type: 'playerEliminated', playerId: 'p1', reason: 'quit' },
      { type: 'playerEliminated', reason: 'died' },
    ],
  },
  peerAway: {
    valid: { type: 'peerAway', playerId: 'p1', away: true },
    invalid: [
      { type: 'peerAway', playerId: 'p1' },
      { type: 'peerAway', playerId: 'p1', away: 'yes' },
    ],
  },
  peerView: {
    valid: { type: 'peerView', playerId: 'p1', view },
    invalid: [
      { type: 'peerView', view },
      { type: 'peerView', playerId: 'p 1', view },
      { type: 'peerView', playerId: 'p1', view: { ...view, e: [0, 1] } },
    ],
  },
  matchResult: {
    valid: {
      type: 'matchResult',
      outcome: 'win',
      winnerId: 'p1',
      ranking: [{ playerId: 'p1', nickname: 'Alice', alive: true, kills: 3 }],
    },
    invalid: [
      { type: 'matchResult', outcome: 'win', winnerId: null, ranking: [] },
      { type: 'matchResult', outcome: 'draw', winnerId: 'p1', ranking: [] },
      { type: 'matchResult', outcome: 'lose', winnerId: null, ranking: [] },
      { type: 'matchResult', outcome: 'draw', winnerId: null, ranking: [{ playerId: 'p1' }] },
    ],
  },
  error: {
    valid: { type: 'error', code: 'roomFull', message: 'room is full' },
    invalid: [
      { type: 'error', code: 'oops', message: 'x' },
      { type: 'error', code: 'roomFull' },
      { type: 'error', code: 'roomFull', message: 'x'.repeat(201) },
    ],
  },
};

describe('parseServerMessage', () => {
  for (const [type, { valid, invalid }] of Object.entries(serverCases)) {
    it(`accepts a valid ${type}`, () => {
      expect(parseServerMessage(valid)).toEqual(valid);
    });
    it(`rejects invalid ${type} messages`, () => {
      for (const bad of invalid) expect(parseServerMessage(bad), JSON.stringify(bad)).toBeNull();
    });
    it(`rejects ${type} with an extra field`, () => {
      expect(parseServerMessage({ ...(valid as object), extra: 1 })).toBeNull();
    });
  }

  it('accepts a draw with a null winner', () => {
    expect(
      parseServerMessage({ type: 'matchResult', outcome: 'draw', winnerId: null, ranking: [] }),
    ).not.toBeNull();
  });

  it('rejects non-objects and client message types', () => {
    for (const bad of [null, 'x', 3, [], { type: 'hello', v: 1 }])
      expect(parseServerMessage(bad)).toBeNull();
  });
});

describe('PlayerView (#114, ADR 0018)', () => {
  const withoutKey = (key: keyof PlayerView): unknown =>
    Object.fromEntries(Object.entries(view).filter(([k]) => k !== key));
  const triples = (n: number, kind = 0, dx = 1, dy = -1): number[] =>
    Array.from({ length: n }, () => [kind, dx, dy]).flat();

  it('round-trips through JSON', () => {
    const raw: unknown = JSON.parse(JSON.stringify({ type: 'view', view }));
    expect(parseClientMessage(raw)).toEqual({ type: 'view', view });
    expect(isPlayerView(view)).toBe(true);
  });

  it('rejects every malformed case', () => {
    const bad: unknown[] = [
      { ...view, extra: 1 },
      withoutKey('t'),
      withoutKey('p'),
      { ...view, e: triples(VIEW_ENEMY_MAX + 1) },
      { ...view, g: triples(VIEW_GEM_MAX + 1) },
      { ...view, p: triples(VIEW_PICKUP_MAX + 1) },
      { ...view, e: [0, 1, 2, 3] },
      { ...view, e: [0, VIEW_REL_MAX + 1, 0] },
      { ...view, g: [0, 0, -VIEW_REL_MAX - 1] },
      { ...view, e: [VIEW_KIND_MAX + 1, 0, 0] },
      { ...view, e: [-1, 0, 0] },
      { ...view, e: [0, 1.5, 0] },
      { ...view, e: [0, '1', 0] },
      { ...view, e: { length: 0 } },
      { ...view, x: 1.5 },
      { ...view, x: VIEW_POS_MAX + 1 },
      { ...view, t: -1 },
      { ...view, t: VIEW_TIME_MAX_MS + 1 },
      { ...view, h: 1001 },
      { ...view, h: -1 },
      { ...view, f: 2 },
      { ...view, f: true },
      { ...view, c: VIEW_KIND_MAX + 1 },
      [],
      null,
    ];
    for (const v of bad) {
      expect(isPlayerView(v), JSON.stringify(v)).toBe(false);
      expect(parseClientMessage({ type: 'view', view: v }), JSON.stringify(v)).toBeNull();
    }
  });

  it('accepts full lists at the caps', () => {
    expect(
      isPlayerView({
        ...view,
        e: triples(VIEW_ENEMY_MAX),
        g: triples(VIEW_GEM_MAX),
        p: triples(VIEW_PICKUP_MAX),
      }),
    ).toBe(true);
  });

  it('the worst case fits VIEW_MAX_BYTES as view and MAX_MESSAGE_BYTES as peerView', () => {
    const worst: PlayerView = {
      t: VIEW_TIME_MAX_MS,
      x: -VIEW_POS_MAX,
      y: -VIEW_POS_MAX,
      f: 1,
      c: VIEW_KIND_MAX,
      h: 1000,
      e: triples(VIEW_ENEMY_MAX, VIEW_KIND_MAX, -VIEW_REL_MAX, -VIEW_REL_MAX),
      g: triples(VIEW_GEM_MAX, VIEW_KIND_MAX, -VIEW_REL_MAX, -VIEW_REL_MAX),
      p: triples(VIEW_PICKUP_MAX, VIEW_KIND_MAX, -VIEW_REL_MAX, -VIEW_REL_MAX),
    };
    const sent = JSON.stringify({ type: 'view', view: worst });
    // A server id is a `randomUUID`: 36 characters.
    const relayed = JSON.stringify({ type: 'peerView', playerId: 'x'.repeat(36), view: worst });
    const bytes = (s: string) => new TextEncoder().encode(s).length;
    // Measured 2026-11-09: 2910 and 2964 bytes (ADR 0018).
    expect([bytes(sent), bytes(relayed)]).toEqual([2910, 2964]);
    expect(parseClientMessage(JSON.parse(sent))).not.toBeNull();
    expect(parseServerMessage(JSON.parse(relayed))).not.toBeNull();
    expect(bytes(sent)).toBeLessThanOrEqual(VIEW_MAX_BYTES);
    expect(bytes(relayed)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });
});

describe('normalizeNickname', () => {
  it('trims, applies NFC and collapses inner whitespace', () => {
    expect(normalizeNickname('  Alice  ')).toBe('Alice');
    expect(normalizeNickname('Al   ice')).toBe('Al ice');
    expect(normalizeNickname('Al　 ice')).toBe('Al ice');
    expect(normalizeNickname('Café')).toBe('Café');
  });

  it('accepts markup as plain text', () => {
    expect(normalizeNickname('<b>x</b>')).toBe('<b>x</b>');
  });

  it('accepts Korean and emoji within 12 code points', () => {
    expect(normalizeNickname('뱀파이어서바이버')).toBe('뱀파이어서바이버');
    expect(normalizeNickname('😀'.repeat(NICKNAME_MAX))).toBe('😀'.repeat(NICKNAME_MAX));
    expect(normalizeNickname('😀'.repeat(NICKNAME_MAX + 1))).toBeNull();
  });

  it('accepts 1 to 12 characters', () => {
    expect(normalizeNickname('a')).toBe('a');
    expect(normalizeNickname('a'.repeat(12))).toBe('a'.repeat(12));
    expect(normalizeNickname('a'.repeat(13))).toBeNull();
    expect(normalizeNickname('')).toBeNull();
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('rejects bidi overrides and isolates', () => {
    expect(normalizeNickname('ab‮cd')).toBeNull();
    expect(normalizeNickname('ab⁦cd')).toBeNull();
    expect(normalizeNickname('ab‏cd')).toBeNull();
  });

  it('rejects zero-width characters', () => {
    expect(normalizeNickname('a‍b')).toBeNull();
    expect(normalizeNickname('a​b')).toBeNull();
    expect(normalizeNickname('﻿ab')).toBeNull();
    expect(normalizeNickname('a⁠b')).toBeNull();
  });

  it('rejects blank-rendering and unassigned characters', () => {
    for (const s of [
      '\u3164',
      '\u115F',
      '\uFFA0',
      '\u2800',
      'a\u034Fb',
      '\u0301\u0301',
      '\uE000',
      'a\uFE0Fb',
      '\u0378',
    ]) {
      expect(normalizeNickname(s), JSON.stringify(s)).toBeNull();
    }
    expect(normalizeNickname('e\u0301')).toBe('\u00E9');
  });

  it('rejects control characters and lone surrogates', () => {
    expect(normalizeNickname('a\u0000b')).toBeNull();
    expect(normalizeNickname('a\tb')).toBeNull();
    expect(normalizeNickname('a\nb')).toBeNull();
    expect(normalizeNickname('a\u007Fb')).toBeNull();
    expect(normalizeNickname('a\uD800b')).toBeNull();
  });

  it('is idempotent', () => {
    for (const s of ['  A  b ', 'Café', '<b>x</b>']) {
      const once = normalizeNickname(s);
      expect(once).not.toBeNull();
      expect(normalizeNickname(once ?? '')).toBe(once);
    }
  });
});
