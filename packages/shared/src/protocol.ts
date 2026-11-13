/**
 * Client–server protocol (ADR 0005, ADR 0006, ADR 0011): JSON messages discriminated on `type`, with hand-written
 * validators. Pure functions only: no DOM, worker or Node APIs, so the client, the server and the runtime image's
 * compiled `dist` all use this file.
 *
 * Flow: the client's first message is `hello { v }`; the server answers `welcome { playerId }` and from then on
 * pushes `roomState` whenever a room changes. Messages that belong to a running match (`status`, `interference`,
 * `died`, `survived`, `visibility`, `view`) are answered with `wrongPhase` when the sender is in no room or its room is in
 * `lobby`, and are dropped silently when they arrive late (after `finished`, or from an eliminated player), so a
 * client is never closed for a race with the result.
 */

/** Version of the client–server protocol (ADR 0006). Bumped on every incompatible message change. */
export const PROTOCOL_VERSION = 2;

/** Room code alphabet without look-alike characters (ADR 0006). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Longest nickname, in code points after normalization (ADR 0006, ADR 0011). */
export const NICKNAME_MAX = 12;
/** Players per room unless the server is configured otherwise (ADR 0005); nothing assumes exactly 2. */
export const MAX_PLAYERS_DEFAULT = 2;
/** Minimum time between two relayed `status` messages of one player: at most 4 per second (ADR 0006). */
export const STATUS_MIN_INTERVAL_MS = 250;
/** A player disconnected during a match counts as dead after this long (ADR 0006). */
export const DISCONNECT_GRACE_MS = 10_000;
/** `matchStart.startAt` is this far ahead of the server time at `startMatch`. */
export const START_DELAY_MS = 3_000;
/** Largest accepted WebSocket message (ADR 0011). */
export const MAX_MESSAGE_BYTES = 4096;
/** Last players dying within this window of each other, by server receive time, is a draw (ADR 0005). */
export const SIMULTANEOUS_DEATH_WINDOW_MS = 100;
/** A tab hidden this long during a match forfeits (ADR 0005). */
export const AFK_FORFEIT_MS = 30_000;
/**
 * The stage clear time in seconds (ADR 0005: 15 minutes of the player's own game time), equal to `STAGE.durationSec`
 * through a test. A versus world that reaches it alive reports `survived`, and the first such report the server
 * accepts wins the match (ADR 0026).
 */
export const MATCH_TIME_LIMIT_S = 900;
/**
 * The server's real-time limit of a versus match in seconds (ADR 0026: 25 minutes from `startAt`). Game clocks stop
 * during level-up and chest dialogs, so it is longer than `MATCH_TIME_LIMIT_S`, which it must exceed (a test keeps
 * it so). The versus HUD counts down to `startAt + MATCH_DEADLINE_S`.
 */
export const MATCH_DEADLINE_S = 1500;
/**
 * The server ends a match by itself this long after the real-time limit (#60, ADR 0014): every player who has
 * reported neither `died` nor `survived` by `startAt + (MATCH_DEADLINE_S + MATCH_DEADLINE_GRACE_S) s` is treated as
 * survived, and kills decide.
 */
export const MATCH_DEADLINE_GRACE_S = 10;
/** Longest raw `nickname` string the validator accepts before normalization; bounds the work done on it. */
export const NICKNAME_RAW_MAX = 64;

// ---------------------------------------------------------------------------------------------------------------
// The view stream (#114, ADR 0018): a quantized snapshot of the sender's own world, relayed to the opponent for display.

/** Least time between two relayed `view` messages of one player, by server receive time (ADR 0018). */
export const VIEW_MIN_INTERVAL_MS = 100;
/** World units per encoded offset step. */
export const VIEW_QUANT = 4;
/** Largest `|dx|` and `|dy|`, in steps: 720 units, the 640×360 half view plus the 64-unit spawn margin. */
export const VIEW_REL_MAX = 180;
/** Most enemies in one view: the nearest, when more are in range. */
export const VIEW_ENEMY_MAX = 160;
/** Most idle gems in one view. */
export const VIEW_GEM_MAX = 48;
/** Most pickups (light-source and interference) in one view. */
export const VIEW_PICKUP_MAX = 8;
/** Largest kind and character index on the wire; the receiver skips kinds its content does not know. */
export const VIEW_KIND_MAX = 63;
/** Largest `|x|`, `|y|` of the player, in whole world units. */
export const VIEW_POS_MAX = 1_000_000;
/** Largest `t`, simulated ms (one hour, four times the match time limit). */
export const VIEW_TIME_MAX_MS = 3_600_000;
/** The encoder's budget for one `view` message, below `MAX_MESSAGE_BYTES` with room for the relay's `playerId`. */
export const VIEW_MAX_BYTES = 3072;

/**
 * One player's world as the opponent sees it (ADR 0018). `t` simulated ms; `x`, `y` the player in whole world units;
 * `f` 1 when facing left; `c` the `CHARACTERS` index; `h` HP in permille. `e`, `g` and `p` are flat `[kind, dx, dy]`
 * triples for enemies (`ENEMY_LIST index * 2 + elite bit`), idle gems (`GEM_ASSETS` index) and pickups (the pickup
 * pool index: `PICKUPS`, then `INTERFERENCE`), with `dx`, `dy` = `round((entity - player) / VIEW_QUANT)`.
 */
export interface PlayerView {
  t: number;
  x: number;
  y: number;
  f: 0 | 1;
  c: number;
  h: number;
  e: number[];
  g: number[];
  p: number[];
}

export const INTERFERENCE_KINDS = ['swarm', 'gemThief', 'eliteCall'] as const;
export type InterferenceKind = (typeof INTERFERENCE_KINDS)[number];

export const ROOM_PHASES = ['lobby', 'countdown', 'playing', 'finished'] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];

export const ELIMINATION_REASONS = ['died', 'disconnected', 'afk'] as const;
export type EliminationReason = (typeof ELIMINATION_REASONS)[number];

export const ERROR_CODES = [
  'badMessage',
  'versionMismatch',
  'roomNotFound',
  'roomFull',
  'nicknameTaken',
  'invalidNickname',
  'notHost',
  'notAllReady',
  'wrongPhase',
  'rateLimited',
] as const;
/**
 * `roomNotFound` also covers rooms that exist but cannot be joined (full, or in a match), so a code's existence is
 * not revealed (ADR 0011); the server therefore never sends `roomFull`, which stays in the set for compatibility.
 */
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface PlayerInfo {
  id: string;
  nickname: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export interface PlayerStatus {
  hp: number;
  maxHp: number;
  level: number;
  kills: number;
  alive: boolean;
  elapsedMs: number;
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  alive: boolean;
  kills: number;
}

export type ClientMessage =
  | { type: 'hello'; v: number }
  | { type: 'createRoom'; nickname: string }
  | { type: 'joinRoom'; code: string; nickname: string }
  | { type: 'leaveRoom' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startMatch' }
  | { type: 'status'; status: PlayerStatus }
  | { type: 'interference'; kind: InterferenceKind }
  | { type: 'died'; kills: number; elapsedMs: number }
  | { type: 'survived'; kills: number }
  | { type: 'visibility'; hidden: boolean }
  /** #114: this player's world view (ADR 0018), relayed as `peerView`. */
  | { type: 'view'; view: PlayerView };

export type ServerMessage =
  | { type: 'welcome'; playerId: string }
  | { type: 'roomState'; code: string; maxPlayers: number; players: PlayerInfo[]; phase: RoomPhase }
  | { type: 'matchStart'; seed: number; startAt: number }
  | { type: 'peerStatus'; playerId: string; status: PlayerStatus }
  | {
      type: 'interferenceIncoming';
      kind: InterferenceKind;
      fromPlayerId: string;
      fromNickname: string;
    }
  | { type: 'playerEliminated'; playerId: string; reason: EliminationReason }
  | { type: 'peerAway'; playerId: string; away: boolean }
  /** #114: another player's `view`, relayed unchanged (ADR 0018). */
  | { type: 'peerView'; playerId: string; view: PlayerView }
  | {
      type: 'matchResult';
      outcome: 'win' | 'draw';
      winnerId: string | null;
      ranking: RankingEntry[];
    }
  | { type: 'error'; code: ErrorCode; message: string };

export type ClientMessageType = ClientMessage['type'];
export type ServerMessageType = ServerMessage['type'];

// ---------------------------------------------------------------------------------------------------------------
// Validation helpers

type Obj = Record<string, unknown>;

/** A plain object as produced by `JSON.parse` (not an array, not null, no custom prototype). */
function isPlainObject(x: unknown): x is Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const proto: unknown = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

/** `o` has exactly these own keys, no more and no fewer. `__proto__` from JSON counts as an extra key. */
function hasExactKeys(o: Obj, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
}

function isNonNegativeNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

function isNonNegativeInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
}

function isBoolean(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

function isOneOf<T extends string>(set: readonly T[], x: unknown): x is T {
  return typeof x === 'string' && (set as readonly string[]).includes(x);
}

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${String(ROOM_CODE_LENGTH)}}$`);

export function isRoomCode(x: unknown): x is string {
  return typeof x === 'string' && ROOM_CODE_PATTERN.test(x);
}

/** Server-issued identifiers: 1–64 characters of `[A-Za-z0-9_-]`. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isId(x: unknown): x is string {
  return typeof x === 'string' && ID_PATTERN.test(x);
}

/** A nickname exactly as the server relays it: already normalized. */
function isNormalizedNickname(x: unknown): x is string {
  return typeof x === 'string' && x.length <= NICKNAME_RAW_MAX && normalizeNickname(x) === x;
}

function isRawNickname(x: unknown): x is string {
  return typeof x === 'string' && x.length <= NICKNAME_RAW_MAX;
}

const STATUS_KEYS = ['hp', 'maxHp', 'level', 'kills', 'alive', 'elapsedMs'] as const;

export function isPlayerStatus(x: unknown): x is PlayerStatus {
  return (
    isPlainObject(x) &&
    hasExactKeys(x, STATUS_KEYS) &&
    isNonNegativeNumber(x.hp) &&
    isNonNegativeNumber(x.maxHp) &&
    x.hp <= x.maxHp &&
    isNonNegativeInt(x.level) &&
    isNonNegativeInt(x.kills) &&
    isBoolean(x.alive) &&
    isNonNegativeNumber(x.elapsedMs)
  );
}

const VIEW_KEYS = ['t', 'x', 'y', 'f', 'c', 'h', 'e', 'g', 'p'] as const;

function isIntIn(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max;
}

/** Flat `[kind, dx, dy]` triples: at most `maxCount`, kinds in `0..VIEW_KIND_MAX`, offsets in `±VIEW_REL_MAX`. */
function isTriples(x: unknown, maxCount: number): x is number[] {
  if (!Array.isArray(x) || x.length % 3 !== 0 || x.length > 3 * maxCount) return false;
  for (let i = 0; i < x.length; i += 3) {
    if (
      !isIntIn(x[i], 0, VIEW_KIND_MAX) ||
      !isIntIn(x[i + 1], -VIEW_REL_MAX, VIEW_REL_MAX) ||
      !isIntIn(x[i + 2], -VIEW_REL_MAX, VIEW_REL_MAX)
    )
      return false;
  }
  return true;
}

/** A `PlayerView` with exactly its keys and every number an integer in its range (ADR 0018). */
export function isPlayerView(x: unknown): x is PlayerView {
  return (
    isPlainObject(x) &&
    hasExactKeys(x, VIEW_KEYS) &&
    isIntIn(x.t, 0, VIEW_TIME_MAX_MS) &&
    isIntIn(x.x, -VIEW_POS_MAX, VIEW_POS_MAX) &&
    isIntIn(x.y, -VIEW_POS_MAX, VIEW_POS_MAX) &&
    (x.f === 0 || x.f === 1) &&
    isIntIn(x.c, 0, VIEW_KIND_MAX) &&
    isIntIn(x.h, 0, 1000) &&
    isTriples(x.e, VIEW_ENEMY_MAX) &&
    isTriples(x.g, VIEW_GEM_MAX) &&
    isTriples(x.p, VIEW_PICKUP_MAX)
  );
}

/** Upper bound on list lengths in server messages; rooms are far smaller. */
const MAX_LIST = 64;
const ERROR_MESSAGE_MAX = 200;
const UINT32_MAX = 0xffff_ffff;

function isPlayerInfo(x: unknown): x is PlayerInfo {
  return (
    isPlainObject(x) &&
    hasExactKeys(x, ['id', 'nickname', 'ready', 'host', 'connected']) &&
    isId(x.id) &&
    isNormalizedNickname(x.nickname) &&
    isBoolean(x.ready) &&
    isBoolean(x.host) &&
    isBoolean(x.connected)
  );
}

function isRankingEntry(x: unknown): x is RankingEntry {
  return (
    isPlainObject(x) &&
    hasExactKeys(x, ['playerId', 'nickname', 'alive', 'kills']) &&
    isId(x.playerId) &&
    isNormalizedNickname(x.nickname) &&
    isBoolean(x.alive) &&
    isNonNegativeInt(x.kills)
  );
}

function isListOf<T>(x: unknown, item: (v: unknown) => v is T): x is T[] {
  return Array.isArray(x) && x.length <= MAX_LIST && x.every(item);
}

/** Checks a message object's fields after its `type` is known. Each entry lists the exact keys besides `type`. */
type FieldCheck = (o: Obj) => boolean;

const CLIENT_FIELDS: Record<ClientMessageType, readonly [readonly string[], FieldCheck]> = {
  hello: [['v'], (o) => isNonNegativeInt(o.v)],
  createRoom: [['nickname'], (o) => isRawNickname(o.nickname)],
  joinRoom: [['code', 'nickname'], (o) => isRoomCode(o.code) && isRawNickname(o.nickname)],
  leaveRoom: [[], () => true],
  setReady: [['ready'], (o) => isBoolean(o.ready)],
  startMatch: [[], () => true],
  status: [['status'], (o) => isPlayerStatus(o.status)],
  interference: [['kind'], (o) => isOneOf(INTERFERENCE_KINDS, o.kind)],
  died: [
    ['kills', 'elapsedMs'],
    (o) => isNonNegativeInt(o.kills) && isNonNegativeNumber(o.elapsedMs),
  ],
  survived: [['kills'], (o) => isNonNegativeInt(o.kills)],
  visibility: [['hidden'], (o) => isBoolean(o.hidden)],
  view: [['view'], (o) => isPlayerView(o.view)],
};

const SERVER_FIELDS: Record<ServerMessageType, readonly [readonly string[], FieldCheck]> = {
  welcome: [['playerId'], (o) => isId(o.playerId)],
  roomState: [
    ['code', 'maxPlayers', 'players', 'phase'],
    (o) =>
      isRoomCode(o.code) &&
      isNonNegativeInt(o.maxPlayers) &&
      o.maxPlayers >= 1 &&
      o.maxPlayers <= MAX_LIST &&
      isListOf(o.players, isPlayerInfo) &&
      o.players.length <= o.maxPlayers &&
      isOneOf(ROOM_PHASES, o.phase),
  ],
  matchStart: [
    ['seed', 'startAt'],
    (o) => isNonNegativeInt(o.seed) && o.seed <= UINT32_MAX && isNonNegativeNumber(o.startAt),
  ],
  peerStatus: [['playerId', 'status'], (o) => isId(o.playerId) && isPlayerStatus(o.status)],
  interferenceIncoming: [
    ['kind', 'fromPlayerId', 'fromNickname'],
    (o) =>
      isOneOf(INTERFERENCE_KINDS, o.kind) &&
      isId(o.fromPlayerId) &&
      isNormalizedNickname(o.fromNickname),
  ],
  playerEliminated: [
    ['playerId', 'reason'],
    (o) => isId(o.playerId) && isOneOf(ELIMINATION_REASONS, o.reason),
  ],
  peerAway: [['playerId', 'away'], (o) => isId(o.playerId) && isBoolean(o.away)],
  peerView: [['playerId', 'view'], (o) => isId(o.playerId) && isPlayerView(o.view)],
  matchResult: [
    ['outcome', 'winnerId', 'ranking'],
    (o) =>
      ((o.outcome === 'win' && isId(o.winnerId)) ||
        (o.outcome === 'draw' && o.winnerId === null)) &&
      isListOf(o.ranking, isRankingEntry),
  ],
  error: [
    ['code', 'message'],
    (o) =>
      isOneOf(ERROR_CODES, o.code) &&
      typeof o.message === 'string' &&
      o.message.length <= ERROR_MESSAGE_MAX,
  ],
};

function parseWith(
  table: Record<string, readonly [readonly string[], FieldCheck]>,
  raw: unknown,
): Obj | null {
  if (!isPlainObject(raw) || typeof raw.type !== 'string' || !Object.hasOwn(table, raw.type)) {
    return null;
  }
  const entry = table[raw.type];
  if (entry === undefined) return null;
  const [keys, check] = entry;
  if (!hasExactKeys(raw, ['type', ...keys]) || !check(raw)) return null;
  return raw;
}

/**
 * Validates a decoded client message: known `type`, exactly the expected fields, each of the right type and range
 * (finite non-negative numbers, integer counters, `hp ≤ maxHp`, `kind` in the set, `code` in the room-code
 * alphabet). Returns the same object typed, or `null`. Nicknames are only length-bounded here; the server runs
 * `normalizeNickname` and answers `invalidNickname`.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  return parseWith(CLIENT_FIELDS, raw) as ClientMessage | null;
}

/** Validates a decoded server message the same way; nicknames must already be normalized. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  return parseWith(SERVER_FIELDS, raw) as ServerMessage | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Nicknames (ADR 0011)

/**
 * Control (`Cc`), format (`Cf`: bidi embeddings, overrides and isolates, LRM/RLM, zero-width space, joiners, BOM,
 * word joiner) and lone-surrogate (`Cs`) characters. Any of them rejects the nickname.
 */
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
/**
 * Characters that render blank or invisible without being in those categories: Hangul fillers, the braille blank,
 * the combining grapheme joiner and variation selectors.
 */
const INVISIBLE =
  /\u115F|\u1160|\u3164|\uFFA0|\u2800|\u034F|[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/u;
/** A nickname needs at least one visible letter, digit, punctuation mark or symbol. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * Applies NFC, trims, collapses internal whitespace runs to one space, rejects control, bidi and zero-width
 * characters (and blank-rendering ones such as U+3164), requires one visible character, and accepts
 * 1–`NICKNAME_MAX` code points. Returns the normalized nickname or `null`. Markup such as
 * `<b>x</b>` is accepted as plain text: clients render nicknames with `textContent` (ADR 0009).
 */
export function normalizeNickname(s: string): string | null {
  if (s.length > NICKNAME_RAW_MAX) return null;
  const nfc = s.normalize('NFC');
  if (FORBIDDEN.test(nfc) || INVISIBLE.test(nfc) || !VISIBLE.test(nfc)) return null;
  const collapsed = nfc.trim().replace(/\s+/gu, ' ');
  const length = Array.from(collapsed).length;
  if (length < 1 || length > NICKNAME_MAX) return null;
  return collapsed;
}
