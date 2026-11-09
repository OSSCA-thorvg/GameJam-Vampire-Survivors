// Applying one single-player run to the personal records (#143, ADR 0022). Pure: `prev` is never mutated.
import type { RunSummary } from '../../protocol/worker-messages';
import {
  emptyBest,
  ID_PATTERN,
  MAX_AT,
  MAX_DAMAGE,
  MAX_KILLS,
  MAX_LEVEL,
  MAX_MAP_KEYS,
  MAX_PLAY_TIME_SEC,
  MAX_RUNS,
  MAX_TIME_SEC,
  MAX_TOTAL_KILLS,
  RECENT_MAX,
  type BestSet,
  type Records,
} from './format';

export type BestScope = 'character' | 'overall';

export interface RecordBreaks {
  timeSec: BestScope | null;
  kills: BestScope | null;
  level: BestScope | null;
  /** The run cleared 15:00 and this character had no clear before. */
  firstClear: boolean;
  /** Weapon IDs whose damage beat their stored best. */
  weapons: string[];
}

const clamp = (n: number, max: number): number =>
  Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
const clampInt = (n: number, max: number): number => clamp(Math.floor(n), max);

type BestNumber = 'timeSec' | 'kills' | 'level';

function scope(
  key: BestNumber,
  value: number,
  overall: BestSet,
  character: BestSet,
): BestScope | null {
  if (value <= 0) return null;
  if (value > overall[key]) return 'overall';
  if (value > character[key]) return 'character';
  return null;
}

const merge = (b: BestSet, run: BestSet): BestSet => ({
  timeSec: Math.max(b.timeSec, run.timeSec),
  kills: Math.max(b.kills, run.kills),
  level: Math.max(b.level, run.level),
  cleared: b.cleared || run.cleared,
});

/**
 * Applies `summary` (ended at `at`, epoch milliseconds) to `prev`: bests per character and overall, totals, the recent
 * list and weapon bests. The summary is clamped first so the result always passes `parseRecords`. Returns the new
 * records and what the run broke: a value breaks a best when it is greater than 0 and strictly greater than it.
 */
export function applyRun(
  prev: Records,
  summary: RunSummary,
  at: number,
): { records: Records; breaks: RecordBreaks } {
  const run: BestSet = {
    timeSec: clamp(summary.timeSec, MAX_TIME_SEC),
    kills: clampInt(summary.kills, MAX_KILLS),
    level: clampInt(summary.level, MAX_LEVEL),
    cleared: summary.cleared,
  };
  const characterId = ID_PATTERN.test(summary.characterId) ? summary.characterId : null;
  const prevChar =
    characterId !== null && Object.hasOwn(prev.characters, characterId)
      ? (prev.characters[characterId] ?? emptyBest())
      : emptyBest();

  const weaponBest: Record<string, number> = { ...prev.weaponBest };
  const brokenWeapons: string[] = [];
  for (const w of summary.weapons) {
    if (!ID_PATTERN.test(w.id)) continue;
    const damage = clamp(w.damage, MAX_DAMAGE);
    const known = Object.hasOwn(weaponBest, w.id);
    // A map past MAX_MAP_KEYS would not load again, so a new ID beyond it is not stored.
    if (!known && Object.keys(weaponBest).length >= MAX_MAP_KEYS) continue;
    const old = known ? (weaponBest[w.id] ?? 0) : 0;
    weaponBest[w.id] = Math.max(old, damage);
    if (damage > old && !brokenWeapons.includes(w.id)) brokenWeapons.push(w.id);
  }

  const breaks: RecordBreaks = {
    timeSec: scope('timeSec', run.timeSec, prev.overall, prevChar),
    kills: scope('kills', run.kills, prev.overall, prevChar),
    level: scope('level', run.level, prev.overall, prevChar),
    firstClear: run.cleared && !prevChar.cleared,
    weapons: brokenWeapons,
  };

  const characters: Record<string, BestSet> = { ...prev.characters };
  if (
    characterId !== null &&
    (Object.hasOwn(characters, characterId) || Object.keys(characters).length < MAX_MAP_KEYS)
  )
    characters[characterId] = merge(prevChar, run);

  const t = prev.totals;
  const records: Records = {
    v: 1,
    overall: merge(prev.overall, run),
    characters,
    totals: {
      runs: Math.min(MAX_RUNS, t.runs + 1),
      kills: Math.min(MAX_TOTAL_KILLS, t.kills + run.kills),
      clears: Math.min(MAX_RUNS, t.clears + (run.cleared ? 1 : 0)),
      playTimeSec: Math.min(MAX_PLAY_TIME_SEC, t.playTimeSec + run.timeSec),
    },
    recent:
      characterId === null
        ? prev.recent.slice(0, RECENT_MAX)
        : [
            {
              at: clampInt(at, MAX_AT),
              characterId,
              timeSec: run.timeSec,
              kills: run.kills,
              level: run.level,
              cleared: run.cleared,
            },
            ...prev.recent,
          ].slice(0, RECENT_MAX),
    weaponBest,
  };
  return { records, breaks };
}
