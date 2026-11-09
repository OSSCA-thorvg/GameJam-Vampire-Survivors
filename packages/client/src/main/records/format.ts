// The personal records format (#143, ADR 0022): one versioned JSON document in `localStorage` under `vs.records`. Reads
// are validated with exact fields at every level and range checks; anything else loads as empty records.

export const RECORDS_KEY = 'vs.records';
export const RECORDS_VERSION = 1;
/** The last runs kept, newest first. */
export const RECENT_MAX = 10;
/** Characters of raw JSON; a longer stored value is not one this client wrote, so it is treated as corrupt. */
export const STORED_MAX = 32768;

export const MAX_TIME_SEC = 86_400;
export const MAX_KILLS = 10_000_000;
export const MAX_LEVEL = 10_000;
export const MAX_DAMAGE = 1e12;
export const MAX_RUNS = 10_000_000;
export const MAX_TOTAL_KILLS = Number.MAX_SAFE_INTEGER;
export const MAX_PLAY_TIME_SEC = 1e10;
/** The largest valid `Date` value, in epoch milliseconds. */
export const MAX_AT = 8.64e15;
export const MAX_MAP_KEYS = 64;
/** Matches every `CharacterId` and `WeaponId`; rejects `__proto__` and anything with markup characters. */
export const ID_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;

export interface BestSet {
  timeSec: number;
  kills: number;
  level: number;
  cleared: boolean;
}

export interface RecentRun {
  /** Epoch milliseconds when the run ended. */
  at: number;
  characterId: string;
  timeSec: number;
  kills: number;
  level: number;
  cleared: boolean;
}

export interface Totals {
  runs: number;
  kills: number;
  clears: number;
  playTimeSec: number;
}

export interface Records {
  v: 1;
  overall: BestSet;
  /** Keyed by character ID; a character with no run has no key. */
  characters: Record<string, BestSet>;
  totals: Totals;
  /** Newest first, at most RECENT_MAX. */
  recent: RecentRun[];
  /** Best single-run damage, keyed by weapon ID (base and evolved). */
  weaponBest: Record<string, number>;
}

export type ParseStatus = 'empty' | 'ok' | 'invalid';

export const emptyBest = (): BestSet => ({ timeSec: 0, kills: 0, level: 0, cleared: false });

export function emptyRecords(): Records {
  return {
    v: 1,
    overall: emptyBest(),
    characters: {},
    totals: { runs: 0, kills: 0, clears: 0, playTimeSec: 0 },
    recent: [],
    weaponBest: {},
  };
}

/** Thrown inside `parseRecords` only; never escapes it. */
class Invalid extends Error {}

const fail = (): never => {
  throw new Invalid();
};

/** A plain object with exactly `keys` as its own keys. */
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return fail();
  const own = Object.keys(value);
  if (own.length !== keys.length || !keys.every((k) => Object.hasOwn(value, k))) return fail();
  return value as Record<string, unknown>;
}

function num(value: unknown, max: number, integer: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    return fail();
  if (integer && !Number.isInteger(value)) return fail();
  return value;
}

function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : fail();
}

function id(value: unknown): string {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : fail();
}

const BEST_KEYS = ['timeSec', 'kills', 'level', 'cleared'] as const;
const TOTALS_KEYS = ['runs', 'kills', 'clears', 'playTimeSec'] as const;
const RECENT_KEYS = ['at', 'characterId', 'timeSec', 'kills', 'level', 'cleared'] as const;
const TOP_KEYS = ['v', 'overall', 'characters', 'totals', 'recent', 'weaponBest'] as const;

function best(value: unknown): BestSet {
  const o = exact(value, BEST_KEYS);
  return {
    timeSec: num(o.timeSec, MAX_TIME_SEC, false),
    kills: num(o.kills, MAX_KILLS, true),
    level: num(o.level, MAX_LEVEL, true),
    cleared: bool(o.cleared),
  };
}

/** A map keyed by content IDs, rebuilt with `Object.fromEntries` (never walking the prototype). */
function map<T>(value: unknown, read: (v: unknown) => T): Record<string, T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return fail();
  const keys = Object.keys(value);
  if (keys.length > MAX_MAP_KEYS) return fail();
  const source = value as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [id(k), read(source[k])]));
}

function totals(value: unknown): Totals {
  const o = exact(value, TOTALS_KEYS);
  const t = {
    runs: num(o.runs, MAX_RUNS, true),
    kills: num(o.kills, MAX_TOTAL_KILLS, true),
    clears: num(o.clears, MAX_RUNS, true),
    playTimeSec: num(o.playTimeSec, MAX_PLAY_TIME_SEC, false),
  };
  return t.clears > t.runs ? fail() : t;
}

function recentRun(value: unknown): RecentRun {
  const o = exact(value, RECENT_KEYS);
  return {
    at: num(o.at, MAX_AT, true),
    characterId: id(o.characterId),
    timeSec: num(o.timeSec, MAX_TIME_SEC, false),
    kills: num(o.kills, MAX_KILLS, true),
    level: num(o.level, MAX_LEVEL, true),
    cleared: bool(o.cleared),
  };
}

/**
 * Parses the stored value: `null` is `'empty'`; anything that is not exactly a valid v1 document (oversized, bad JSON,
 * another version, a missing or extra field, a value out of range) is `'invalid'` and gives empty records. Unknown but
 * well-formed character and weapon IDs are kept.
 */
export function parseRecords(raw: string | null): { records: Records; status: ParseStatus } {
  if (raw === null) return { records: emptyRecords(), status: 'empty' };
  if (raw.length > STORED_MAX) return { records: emptyRecords(), status: 'invalid' };
  try {
    const o = exact(JSON.parse(raw), TOP_KEYS);
    if (o.v !== RECORDS_VERSION) return fail();
    if (!Array.isArray(o.recent) || o.recent.length > RECENT_MAX) return fail();
    const records: Records = {
      v: 1,
      overall: best(o.overall),
      characters: map(o.characters, best),
      totals: totals(o.totals),
      recent: (o.recent as unknown[]).map(recentRun),
      weaponBest: map(o.weaponBest, (v) => num(v, MAX_DAMAGE, false)),
    };
    return { records, status: 'ok' };
  } catch {
    return { records: emptyRecords(), status: 'invalid' };
  }
}

const bestOut = (b: BestSet): BestSet => ({
  timeSec: b.timeSec,
  kills: b.kills,
  level: b.level,
  cleared: b.cleared,
});

/** The stored form, with keys in the order of the types. */
export function serializeRecords(r: Records): string {
  return JSON.stringify({
    v: r.v,
    overall: bestOut(r.overall),
    characters: Object.fromEntries(Object.entries(r.characters).map(([k, b]) => [k, bestOut(b)])),
    totals: {
      runs: r.totals.runs,
      kills: r.totals.kills,
      clears: r.totals.clears,
      playTimeSec: r.totals.playTimeSec,
    },
    recent: r.recent.map((x) => ({
      at: x.at,
      characterId: x.characterId,
      timeSec: x.timeSec,
      kills: x.kills,
      level: x.level,
      cleared: x.cleared,
    })),
    weaponBest: { ...r.weaponBest },
  });
}

/** `H:MM:SS` for a play time in seconds, whole seconds rounded down, hours unpadded. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${String(hh)}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
