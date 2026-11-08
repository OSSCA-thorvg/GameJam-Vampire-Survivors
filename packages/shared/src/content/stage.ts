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

export interface StageDef {
  id: 'forest';
  durationSec: number;
  waves: WaveDef[];
}

const BATS = [{ enemyId: 'bat', weight: 1 }] satisfies WaveDef['enemies'];
const MOSTLY_BATS = [
  { enemyId: 'bat', weight: 3 },
  { enemyId: 'ghoul', weight: 1 },
] satisfies WaveDef['enemies'];
const EVEN = [
  { enemyId: 'bat', weight: 1 },
  { enemyId: 'ghoul', weight: 1 },
] satisfies WaveDef['enemies'];

// [minAlive, spawnIntervalSec, batchSize, mix] per minute. Initial values, tune against footage
// (docs/reference/gameplay.md § Enemies and waves; untuned as of #8).
const WAVES: [number, number, number, WaveDef['enemies']][] = [
  [15, 2.0, 3, BATS],
  [25, 1.9, 4, BATS],
  [40, 1.8, 5, BATS],
  [60, 1.6, 6, MOSTLY_BATS],
  [80, 1.5, 7, MOSTLY_BATS],
  [100, 1.4, 8, MOSTLY_BATS],
  [130, 1.3, 9, EVEN],
  [160, 1.2, 10, EVEN],
  [190, 1.1, 11, EVEN],
  [220, 1.0, 12, EVEN],
  [240, 0.9, 14, EVEN],
  [260, 0.8, 16, EVEN],
  [280, 0.7, 17, EVEN],
  [290, 0.6, 18, EVEN],
  [300, 0.5, 20, EVEN],
];

/** The one stage (ADR 0008): 15 minutes (ADR 0005), one wave per minute. */
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
  return errors;
}
