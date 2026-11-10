import {
  BASE_MAX_HP,
  BASE_MOVE_SPEED,
  BASE_STATS,
  ENEMIES,
  PLAYER_RADIUS,
  WEAPONS,
  type PassiveId,
  type StatBlock,
} from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { cleanupSystem } from './combat';
import { hpByUid, indexEnemies, quietWorld, target } from './combat-test-helpers';
import { spawnEnemy } from './enemies';
import { addPassive, grantNextPassive, levelUpPassive } from './passives';
import { recomputeStats } from './stats';
import { contactDamageSystem } from './systems/contact-damage';
import { WHIP_WIDTH } from './weapons/patterns/whip';
import { addWeapon } from './weapons/owned';
import { applyStats, weaponSystem } from './weapons/system';
import type { World } from './world';
import { createBaseWorld } from './base-world';

const DT = 1 / 60;
const WHIP_L1 = WEAPONS.whip.levels[0]?.damage ?? NaN;

function withPassive(world: World, id: PassiveId, level: number): World {
  addPassive(world, id);
  for (let l = 1; l < level; l++) levelUpPassive(world, id);
  recomputeStats(world);
  return world;
}

describe('recomputeStats', () => {
  it('starts every world at BASE_STATS with the #7/#9 base fields', () => {
    const world = createBaseWorld({ seed: 1 });
    expect(world.player.stats).toEqual(BASE_STATS);
    expect(world.player.maxHp).toBe(BASE_MAX_HP);
    expect(world.player.hp).toBe(BASE_MAX_HP);
    expect(world.player.armor).toBe(BASE_STATS.armor);
    expect(world.player.moveSpeed).toBe(BASE_MOVE_SPEED);
  });

  it('adds perLevel × level to BASE_STATS: Spinach Lv3 gives might +0.3, Empty Tome Lv5 gives cooldown -0.4', () => {
    expect(withPassive(createBaseWorld({ seed: 1 }), 'spinach', 3).player.stats.might).toBeCloseTo(
      BASE_STATS.might + 0.3,
      10,
    );
    expect(
      withPassive(createBaseWorld({ seed: 1 }), 'emptyTome', 5).player.stats.cooldown,
    ).toBeCloseTo(BASE_STATS.cooldown - 0.4, 10);
  });

  it('applies character and run modifiers, and derives armor and move speed', () => {
    const world = createBaseWorld({ seed: 1 });
    world.player.characterModifiers.push({ stat: 'moveSpeed', add: 0.2 });
    world.player.runModifiers.push({ stat: 'armor', add: 2 });
    recomputeStats(world);
    expect(world.player.armor).toBe(BASE_STATS.armor + 2);
    expect(world.player.moveSpeed).toBeCloseTo(BASE_MOVE_SPEED * 1.2, 10);
  });

  it('raises HP with max HP by the same delta, and clamps it when max HP falls', () => {
    const world = createBaseWorld({ seed: 1 });
    world.player.hp = 50;
    withPassive(world, 'hollowHeart', 1);
    expect(world.player.maxHp).toBe(BASE_MAX_HP + 20);
    expect(world.player.hp).toBe(70);
    world.player.hp = BASE_MAX_HP + 20;
    world.passives.length = 0;
    recomputeStats(world);
    expect(world.player.maxHp).toBe(BASE_MAX_HP);
    expect(world.player.hp).toBe(BASE_MAX_HP);
  });

  it('keeps the same stats object and is idempotent', () => {
    const world = withPassive(createBaseWorld({ seed: 1 }), 'candelabrador', 2);
    const stats = world.player.stats;
    const before = { ...stats };
    recomputeStats(world);
    recomputeStats(world);
    expect(world.player.stats).toBe(stats);
    expect(world.player.stats).toEqual(before);
    expect(world.player.maxHp).toBe(BASE_MAX_HP);
  });

  it('armor from the stats never reduces a hit below 1', () => {
    const world = createBaseWorld({ seed: 1 });
    world.spawnTimer = 1e9;
    world.player.runModifiers.push({ stat: 'armor', add: 50 });
    recomputeStats(world);
    spawnEnemy(world, 'ghoul', 0, PLAYER_RADIUS);
    const { x, y } = world.enemies.cols;
    world.enemyGrid.rebuild(x, y, world.enemies.count);
    contactDamageSystem(world, DT);
    expect(world.player.hp).toBe(BASE_MAX_HP - 1);
  });
});

describe('passive inventory', () => {
  it('holds at most 6 passives, never twice, each up to its max level', () => {
    const world = createBaseWorld({ seed: 1 });
    expect(addPassive(world, 'spinach')).toBe(true);
    expect(addPassive(world, 'spinach')).toBe(false);
    for (let l = 2; l <= 5; l++) expect(levelUpPassive(world, 'spinach')).toBe(true);
    expect(levelUpPassive(world, 'spinach')).toBe(false);
    expect(levelUpPassive(world, 'clover')).toBe(false);
    for (const id of ['hollowHeart', 'emptyTome', 'bracer', 'candelabrador', 'clover'] as const)
      expect(addPassive(world, id)).toBe(true);
    expect(addPassive(world, 'pummarola')).toBe(false);
    expect(world.passives).toHaveLength(6);
  });

  it('grants the next passive with P, then levels with 6 owned, then nothing', () => {
    const world = createBaseWorld({ seed: 1 });
    const granted: (string | null)[] = [];
    for (let i = 0; i < 6 + 6 * 4 + 1; i++) granted.push(grantNextPassive(world));
    expect(granted.slice(0, 6)).toEqual([
      'hollowHeart',
      'emptyTome',
      'bracer',
      'candelabrador',
      'clover',
      'spellbinder',
    ]);
    expect(granted.slice(6, 10)).toEqual(Array(4).fill('hollowHeart'));
    expect(granted.at(-1)).toBeNull();
    expect(world.passives.every((p) => p.level === 5)).toBe(true);
  });
});

describe('weapons read the stats', () => {
  it('passes every WeaponLevel value through the helpers, unchanged at identity stats', () => {
    // Identity factors, not BASE_STATS: since #148 BASE_STATS carries the built-in PowerUps (might 1.1, cooldown 0.95).
    const identity: StatBlock = {
      ...BASE_STATS,
      might: 1,
      area: 1,
      cooldown: 1,
      amount: 0,
      speed: 1,
      duration: 1,
    };
    for (const def of Object.values(WEAPONS))
      for (const lv of def.levels) expect(applyStats(lv, identity, { ...lv })).toEqual(lv);
    const lv = WEAPONS.magicWand.levels[0];
    if (!lv) throw new Error('no wand L1');
    const s = {
      ...BASE_STATS,
      might: 1.5,
      area: 1.2,
      cooldown: 0.6,
      amount: 1,
      speed: 1.1,
      duration: 1.5,
    };
    expect(applyStats(lv, s, { ...lv })).toEqual({
      ...lv,
      damage: 15,
      area: 1.2,
      cooldownSec: lv.cooldownSec * 0.6,
      amount: 2,
      speed: lv.speed * 1.1,
      durationSec: 3,
    });
  });

  it('Spinach Lv5 adds 50% to a level-1 Whip strike, and Candelabrador reaches farther', () => {
    const strike = (passive: PassiveId | null, level: number, x: number): number | undefined => {
      const world = quietWorld();
      if (passive) withPassive(world, passive, level);
      addWeapon(world, 'whip');
      const w = world.weapons[0];
      if (w) w.cooldownLeft = DT;
      const uid = world.enemies.uid[target(world, 'bat', x, 0)] ?? -1;
      indexEnemies(world);
      weaponSystem(world, DT);
      return 1000 - (hpByUid(world).get(uid) ?? 1000);
    };
    expect(strike(null, 0, 40)).toBeCloseTo(WHIP_L1 * BASE_STATS.might, 10);
    expect(strike('spinach', 5, 40)).toBeCloseTo(WHIP_L1 * (BASE_STATS.might + 0.5), 10);
    // A bat (radius 12) 20 units past the area-1 box is out of reach, and in reach with area 1.3.
    const beyond = WHIP_WIDTH + 12 + 20;
    expect(strike(null, 0, beyond)).toBe(0);
    expect(strike('candelabrador', 3, beyond)).toBeCloseTo(WHIP_L1 * BASE_STATS.might, 10);
  });
});

describe('Spinach and kill time (#12)', () => {
  /** Whip L1 strikes on one real ghoul until it dies; returns the strikes and `damageDealt`. */
  function strikesToKillGhoul(spinachLevel: number) {
    const world = quietWorld();
    if (spinachLevel > 0) withPassive(world, 'spinach', spinachLevel);
    addWeapon(world, 'whip');
    const w = world.weapons[0];
    if (!w) throw new Error('no whip');
    const uid = world.enemies.uid[spawnEnemy(world, 'ghoul', 40, 0)] ?? -1;
    let strikes = 0;
    while (world.enemies.indexOf(uid) >= 0 && strikes < 5) {
      const slot = world.enemies.indexOf(uid);
      // Keep the ghoul in the box: knockback would push it out between strikes.
      world.enemies.cols.x[slot] = 40;
      world.enemies.cols.y[slot] = 0;
      indexEnemies(world);
      w.cooldownLeft = DT;
      w.burstLeft = 0;
      weaponSystem(world, DT);
      cleanupSystem(world, DT);
      strikes++;
    }
    return { strikes, dealt: { ...world.damageDealt } };
  }

  it('a ghoul needs two level-1 Whip strikes, and one with Spinach Lv5', () => {
    const plain = WHIP_L1 * BASE_STATS.might;
    const boosted = WHIP_L1 * (BASE_STATS.might + 0.5);
    // The premise: one plain strike leaves the ghoul alive, one boosted strike kills it.
    expect(plain).toBeLessThan(ENEMIES.ghoul.maxHp);
    expect(boosted).toBeGreaterThanOrEqual(ENEMIES.ghoul.maxHp);
    const base = strikesToKillGhoul(0);
    expect(base.strikes).toBe(2);
    expect(base.dealt.hits).toBe(2);
    expect(base.dealt.total).toBeCloseTo(2 * plain, 10);
    const spinach = strikesToKillGhoul(5);
    expect(spinach.strikes).toBe(1);
    expect(spinach.dealt.hits).toBe(1);
    expect(spinach.dealt.total).toBeCloseTo(boosted, 10);
  });
});
