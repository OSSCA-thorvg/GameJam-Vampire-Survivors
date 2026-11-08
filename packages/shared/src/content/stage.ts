import { ENEMY_CAP } from './constants.js';
import { ENEMIES, type EnemyId } from './enemies.js';

export interface WaveDef {
  /** Active from this minute until the next wave. */
  fromMinute: number;
  /** Top up to this many live enemies when below. */
  minAlive: number;
  /** Periodic batch spawn interval. */
  spawnIntervalSec: number;
  batchSize: number;
  enemies: { enemyId: EnemyId; weight: number }[];
}

/**
 * A timed event of the stage (#17), fired once when `world.time` reaches `at` seconds: a boss (`spawnBoss`), `count`
 * elites on the spawn ring (`spawnElite`), or a swarm of `count` enemies in a `ring` around the player or a vertical
 * `line` beyond the view edge behind the player.
 */
export type StageEvent =
  | { at: number; kind: 'boss'; enemyId: EnemyId }
  | { at: number; kind: 'elite'; enemyId: EnemyId; count: number }
  | { at: number; kind: 'swarm'; enemyId: EnemyId; count: number; formation: 'ring' | 'line' };

export interface StageDef {
  id: 'forest';
  /** The time limit (ADR 0005), equal to the protocol's `MATCH_TIME_LIMIT_S` (a test keeps them equal). */
  durationSec: number;
  waves: WaveDef[];
  /** Sorted by `at`, each before `durationSec`. */
  events: StageEvent[];
  /** The boss that appears at `durationSec` in single player (#17); never in versus play (ADR 0005). */
  deathEnemyId: EnemyId;
}

type Mix = WaveDef['enemies'];
const mix = (...pairs: [EnemyId, number][]): Mix =>
  pairs.map(([enemyId, weight]) => ({ enemyId, weight }));

// [minAlive, spawnIntervalSec, batchSize, mix] per minute (#17). Initial values, untuned: the project owner decided not
// to tune against the original's footage (docs/reference/gameplay.md § Enemies and waves).
const WAVES: [number, number, number, Mix][] = [
  [15, 2.0, 3, mix(['bat', 3], ['ghoul', 1])],
  [25, 1.8, 4, mix(['bat', 3], ['ghoul', 2])],
  [40, 1.6, 5, mix(['bat', 2], ['ghoul', 2])],
  [55, 1.5, 6, mix(['bat', 2], ['ghoul', 2], ['skeleton', 1])],
  [70, 1.4, 7, mix(['ghoul', 2], ['skeleton', 2], ['bat', 1])],
  [90, 1.3, 8, mix(['skeleton', 2], ['ghoul', 1], ['wisp', 1])],
  [110, 1.2, 9, mix(['skeleton', 2], ['wisp', 2], ['bat', 1])],
  [130, 1.1, 10, mix(['skeleton', 2], ['wisp', 2], ['brute', 1])],
  [150, 1.0, 11, mix(['wisp', 2], ['brute', 2], ['skeleton', 1])],
  [170, 0.9, 12, mix(['brute', 2], ['wisp', 2], ['skeleton', 1])],
  [195, 0.8, 13, mix(['brute', 2], ['wisp', 1], ['wraith', 1])],
  [220, 0.75, 15, mix(['brute', 2], ['wraith', 1], ['wisp', 1])],
  [245, 0.65, 16, mix(['wraith', 2], ['brute', 2])],
  [270, 0.6, 18, mix(['wraith', 2], ['brute', 1], ['wisp', 1])],
  [300, 0.5, 20, mix(['wraith', 3], ['brute', 1])],
];

/** Initial values, untuned (see `WAVES`). */
const EVENTS: StageEvent[] = [
  { at: 180, kind: 'elite', enemyId: 'ghoul', count: 1 },
  { at: 300, kind: 'boss', enemyId: 'reaper5' },
  { at: 390, kind: 'swarm', enemyId: 'bat', count: 40, formation: 'ring' },
  { at: 480, kind: 'elite', enemyId: 'brute', count: 1 },
  { at: 600, kind: 'boss', enemyId: 'reaper10' },
  { at: 720, kind: 'swarm', enemyId: 'wisp', count: 60, formation: 'line' },
  { at: 810, kind: 'elite', enemyId: 'wraith', count: 2 },
];

/** The one stage (ADR 0008): 15 minutes (ADR 0005), one wave per minute, seven timed events, then Death. */
export const STAGE: StageDef = {
  id: 'forest',
  durationSec: 900,
  waves: WAVES.map(([minAlive, spawnIntervalSec, batchSize, enemies], fromMinute) => ({
    fromMinute,
    minAlive,
    spawnIntervalSec,
    batchSize,
    enemies,
  })),
  events: EVENTS,
  deathEnemyId: 'death',
};

/** Returns one message per problem; empty when the stage is valid. */
export function validateStage(stage: StageDef): string[] {
  const errors: string[] = [];
  if (stage.waves[0]?.fromMinute !== 0) errors.push('the first wave must start at minute 0');
  stage.waves.forEach((wave, i) => {
    const at = `wave ${String(i)}`;
    const previous = stage.waves[i - 1];
    if (previous && wave.fromMinute <= previous.fromMinute)
      errors.push(`${at}: fromMinute must be greater than the previous wave's`);
    if (!(wave.minAlive >= 0 && wave.minAlive <= ENEMY_CAP))
      errors.push(`${at}: minAlive must be from 0 to ENEMY_CAP (${String(ENEMY_CAP)})`);
    if (!(wave.spawnIntervalSec > 0)) errors.push(`${at}: spawnIntervalSec must be positive`);
    if (!(Number.isInteger(wave.batchSize) && wave.batchSize >= 0))
      errors.push(`${at}: batchSize must be a nonnegative integer`);
    if (wave.enemies.length === 0) errors.push(`${at}: needs at least one enemy`);
    for (const { enemyId, weight } of wave.enemies) {
      if (!Object.hasOwn(ENEMIES, enemyId)) errors.push(`${at}: unknown enemy '${enemyId}'`);
      if (!(weight > 0)) errors.push(`${at}: weight of '${enemyId}' must be positive`);
    }
  });
  stage.events.forEach((event, i) => {
    const at = `event ${String(i)}`;
    const previous = stage.events[i - 1];
    if (previous && event.at < previous.at) errors.push(`${at}: events must be sorted by 'at'`);
    if (!(event.at >= 0 && event.at < stage.durationSec))
      errors.push(`${at}: 'at' must be from 0 to below durationSec`);
    if (!Object.hasOwn(ENEMIES, event.enemyId))
      errors.push(`${at}: unknown enemy '${event.enemyId}'`);
    else if ((event.kind === 'boss') !== Boolean(ENEMIES[event.enemyId].boss))
      errors.push(`${at}: '${event.enemyId}' ${event.kind === 'boss' ? 'is not' : 'is'} a boss`);
    if (event.kind !== 'boss' && !(Number.isInteger(event.count) && event.count > 0))
      errors.push(`${at}: count must be a positive integer`);
  });
  if (!Object.hasOwn(ENEMIES, stage.deathEnemyId) || !ENEMIES[stage.deathEnemyId].boss)
    errors.push(`deathEnemyId '${stage.deathEnemyId}' must be a boss`);
  return errors;
}
