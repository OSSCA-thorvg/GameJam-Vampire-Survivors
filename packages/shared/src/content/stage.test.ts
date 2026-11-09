import { describe, expect, it } from 'vitest';
import { ASSET_IDS } from '../assets.js';
import { ENEMY_CAP } from './constants.js';
import { ENEMIES, ENEMY_LIST, type EnemyId } from './enemies.js';
import { MATCH_TIME_LIMIT_S } from '../protocol.js';
import { STAGE, validateStage, type StageDef, type StageEvent } from './stage.js';

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

const withEvents = (events: StageEvent[]): StageDef => ({ ...STAGE, events });

describe('STAGE events and finale (#17)', () => {
  it('keeps the time limit equal to the protocol constant the server uses (#60)', () => {
    expect(STAGE.durationSec).toBe(MATCH_TIME_LIMIT_S);
  });

  it('uses only known enemies, sorted events before the time limit and a boss as Death', () => {
    for (const wave of STAGE.waves)
      for (const { enemyId } of wave.enemies) {
        expect(ENEMY_LIST, enemyId).toContain(enemyId);
        expect(ENEMIES[enemyId].boss, enemyId).toBeUndefined();
      }
    const times = STAGE.events.map((event) => event.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(Math.max(...times)).toBeLessThan(STAGE.durationSec);
    for (const event of STAGE.events) expect(ENEMY_LIST).toContain(event.enemyId);
    expect(ENEMIES[STAGE.deathEnemyId].boss).toBeDefined();
    for (const wave of STAGE.waves) expect(wave.minAlive).toBeLessThanOrEqual(ENEMY_CAP);
  });

  it('schedules the two bosses at 5:00 and 10:00, elites and swarms', () => {
    expect(STAGE.events.filter((e) => e.kind === 'boss')).toEqual([
      { at: 300, kind: 'boss', enemyId: 'reaper5' },
      { at: 600, kind: 'boss', enemyId: 'reaper10' },
    ]);
    expect(STAGE.events.filter((e) => e.kind === 'elite')).toEqual(
      expect.arrayContaining([
        { at: 60, kind: 'elite', enemyId: 'bat', count: 1 },
        { at: 180, kind: 'elite', enemyId: 'ghoul', count: 1 },
        { at: 480, kind: 'elite', enemyId: 'brute', count: 1 },
        { at: 810, kind: 'elite', enemyId: 'wraith', count: 2 },
      ]),
    );
    expect(STAGE.events.filter((e) => e.kind === 'swarm').map((e) => e.at)).toEqual([390, 720]);
  });

  it('reports unsorted or late events, a non-boss boss event and a bad Death', () => {
    const [first, second] = STAGE.events;
    if (!first || !second) throw new Error('STAGE has fewer than two events');
    expect(validateStage(withEvents([second, first]))).toEqual([
      "event 1: events must be sorted by 'at'",
    ]);
    expect(validateStage(withEvents([{ ...first, at: STAGE.durationSec }]))).toEqual([
      "event 0: 'at' must be from 0 to below durationSec",
    ]);
    expect(validateStage(withEvents([{ at: 1, kind: 'boss', enemyId: 'bat' }]))).toEqual([
      "event 0: 'bat' is not a boss",
    ]);
    expect(
      validateStage(withEvents([{ at: 1, kind: 'elite', enemyId: 'ghoul', count: 0 }])),
    ).toEqual(['event 0: count must be a positive integer']);
    expect(validateStage({ ...STAGE, deathEnemyId: 'bat' })).toEqual([
      "deathEnemyId 'bat' must be a boss",
    ]);
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
      'enemy.skeleton',
      'enemy.wisp',
      'enemy.brute',
      'enemy.wraith',
      'boss.death',
    ]);
  });

  it('makes Death a boss that ignores armor and drops nothing (#17)', () => {
    expect(ENEMIES.death.boss).toEqual({ tether: true, dropsChest: 'always' });
    expect(ENEMIES.death.ignoresArmor).toBe(true);
    expect(ENEMIES.death.xp).toBe(0);
    for (const id of ENEMY_LIST)
      if (id !== 'death') expect(ENEMIES[id].ignoresArmor, id).toBeUndefined();
  });
});
