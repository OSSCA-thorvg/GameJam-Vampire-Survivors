import { describe, expect, it } from 'vitest';
import { ASSET_IDS } from '../assets.js';
import { ENEMY_CAP } from './constants.js';
import { ENEMIES, ENEMY_LIST, type EnemyId } from './enemies.js';
import { STAGE, validateStage, type StageDef } from './stage.js';

const withWave = (patch: Partial<StageDef['waves'][number]>): StageDef => ({
  ...STAGE,
  waves: STAGE.waves.map((wave, i) => (i === 3 ? { ...wave, ...patch } : wave)),
});

describe('STAGE', () => {
  it('is valid: 15 one-minute waves over 900 s', () => {
    expect(validateStage(STAGE)).toEqual([]);
    expect(STAGE.durationSec).toBe(900);
    expect(STAGE.waves.map((w) => w.fromMinute)).toEqual([...Array(15).keys()]);
    expect(STAGE.waves.at(-1)?.minAlive).toBeLessThanOrEqual(ENEMY_CAP);
  });

  it('reports an unknown enemy and a zero weight', () => {
    expect(
      validateStage(withWave({ enemies: [{ enemyId: 'slime' as EnemyId, weight: 1 }] })),
    ).toEqual(["wave 3: unknown enemy 'slime'"]);
    expect(validateStage(withWave({ enemies: [{ enemyId: 'bat', weight: 0 }] }))).toEqual([
      "wave 3: weight of 'bat' must be positive",
    ]);
  });

  it('reports unsorted waves, a late start and minAlive above the cap', () => {
    expect(validateStage(withWave({ fromMinute: 1 }))).toEqual([
      "wave 3: fromMinute must be greater than the previous wave's",
    ]);
    expect(validateStage({ ...STAGE, waves: STAGE.waves.slice(1) })).toContain(
      'the first wave must start at minute 0',
    );
    expect(validateStage(withWave({ minAlive: ENEMY_CAP + 1 }))).toHaveLength(1);
  });
});

describe('ENEMIES', () => {
  it('lists every enemy once, keyed by its own id, with a catalog asset', () => {
    expect([...ENEMY_LIST].sort()).toEqual(Object.keys(ENEMIES).sort());
    for (const id of ENEMY_LIST) {
      expect(ENEMIES[id].id).toBe(id);
      expect(ASSET_IDS).toContain(ENEMIES[id].assetId);
    }
    expect(ENEMY_LIST.map((id) => ENEMIES[id].assetId)).toEqual([
      'enemy.bat',
      'enemy.ghoul',
      'boss.reaper5',
      'boss.reaper10',
    ]);
  });
});
