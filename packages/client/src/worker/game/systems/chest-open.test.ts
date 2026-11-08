import {
  CHEST_HEAL,
  CHEST_REWARD_KINDS,
  EVOLUTIONS,
  EVOLUTION_MIN_TIME_S,
  WEAPONS,
  type ChestReward,
} from '@vs/shared';
import { describe, expect, it, vi } from 'vitest';
import { addChest } from '../chests';
import { damageEnemy } from '../combat';
import { spawnEnemy } from '../enemies';
import { indexEnemies, quietWorld } from '../combat-test-helpers';
import { buildLevelUpOptions } from '../levelup-options';
import { addPassive } from '../passives';
import { readWeapons } from '../snapshot';
import { addWeapon } from '../weapons/owned';
import type { World } from '../world';
import { spawnBoss } from './bosses';
import {
  availableEvolution,
  CHEST_OPEN_RADIUS,
  createChestFlow,
  openChest,
  rollRewardCount,
} from './chest-open';
import { spawnElite } from './elites';

const DT = 1 / 60;

/** Whip at max level, Hollow Heart owned, at `time`. */
function whipReady(time: number): World {
  const world = quietWorld();
  addWeapon(world, 'whip');
  const whip = world.weapons[0];
  if (whip) whip.level = whip.def.maxLevel;
  addPassive(world, 'hollowHeart');
  world.time = time;
  return world;
}

describe('chest reward count', () => {
  it('is 5 / 3 / 1 about 3% / 17% / 80% of the time at luck 1 over 10,000 rolls', () => {
    const world = quietWorld(7);
    const counts = { 1: 0, 3: 0, 5: 0 };
    for (let i = 0; i < 10_000; i++) counts[rollRewardCount(world)]++;
    expect(Math.abs(counts[5] / 10_000 - 0.03)).toBeLessThan(0.015);
    expect(Math.abs(counts[3] / 10_000 - 0.17)).toBeLessThan(0.015);
    expect(Math.abs(counts[1] / 10_000 - 0.8)).toBeLessThan(0.015);
  });

  it('scales the odds of 3 and 5 with luck', () => {
    const world = quietWorld(7);
    world.player.stats.luck = 2;
    let many = 0;
    for (let i = 0; i < 10_000; i++) if (rollRewardCount(world) > 1) many++;
    expect(Math.abs(many / 10_000 - 0.4)).toBeLessThan(0.02);
  });
});

describe('the evolution gate', () => {
  it('evolves a maxed Whip with Hollow Heart at 5:00 into Bloody Tear in the same slot, keeping the passive', () => {
    const world = whipReady(EVOLUTION_MIN_TIME_S);
    addWeapon(world, 'knife');
    const [first] = openChest(world);
    expect(first).toEqual({ kind: 'evolve', fromWeaponId: 'whip', intoWeaponId: 'bloodyTear' });
    // Further rewards of a 3- or 5-reward chest may level the Knife.
    expect(readWeapons(world).map((w) => w.id)).toEqual(['bloodyTear', 'knife']);
    expect(world.weapons[0]?.level).toBe(1);
    expect(world.weapons[0]?.slot).toBe(0);
    expect(world.passives.map((p) => p.def.id)).toEqual(['hollowHeart']);
    // The base weapon is never offered again.
    for (let seed = 0; seed < 50; seed++) {
      world.levelUpRng.next();
      for (const o of buildLevelUpOptions(world))
        if (o.kind === 'newWeapon' || o.kind === 'upgradeWeapon')
          expect(o.weaponId).not.toBe('whip');
    }
  });

  it('gives a level-up or a heal instead at 4:59 with the same inventory', () => {
    const world = whipReady(EVOLUTION_MIN_TIME_S - 1);
    expect(availableEvolution(world)).toBeNull();
    const rewards = openChest(world);
    expect(rewards.some((r) => r.kind === 'evolve')).toBe(false);
    expect(rewards[0]).toEqual({
      kind: 'levelUp',
      itemKind: 'passive',
      id: 'hollowHeart',
      newLevel: 2,
    });
    expect(world.weapons[0]?.def.id).toBe('whip');
  });

  it('needs every condition: a Whip below max, or no Hollow Heart, gets no evolution at 5:00', () => {
    const below = whipReady(EVOLUTION_MIN_TIME_S);
    const whip = below.weapons[0];
    if (whip) whip.level = 7;
    expect(availableEvolution(below)).toBeNull();
    const noPassive = whipReady(EVOLUTION_MIN_TIME_S);
    noPassive.passives.length = 0;
    expect(availableEvolution(noPassive)).toBeNull();
  });

  it('can grant each of the 8 evolutions', () => {
    for (const e of EVOLUTIONS) {
      const world = quietWorld();
      world.time = EVOLUTION_MIN_TIME_S;
      addWeapon(world, e.weaponId);
      const w = world.weapons[0];
      if (w) w.level = w.def.maxLevel;
      addPassive(world, e.passiveId);
      expect(openChest(world)[0], e.intoWeaponId).toMatchObject({ kind: 'evolve' });
      expect(world.weapons[0]?.def).toBe(WEAPONS[e.intoWeaponId]);
    }
  });
});

describe('chest rewards', () => {
  it('fall back to a heal of CHEST_HEAL with everything maxed, and never yield gold', () => {
    const world = quietWorld();
    addWeapon(world, 'whip');
    const whip = world.weapons[0];
    if (whip) whip.level = whip.def.maxLevel;
    world.player.hp = 10;
    const rewards = openChest(world);
    for (const r of rewards) expect(r).toEqual({ kind: 'heal', amount: CHEST_HEAL });
    expect(world.player.hp).toBe(Math.min(world.player.maxHp, 10 + CHEST_HEAL * rewards.length));
    const kinds: readonly string[] = CHEST_REWARD_KINDS;
    for (let seed = 0; seed < 300; seed++) {
      const w = quietWorld(seed);
      addWeapon(w, 'whip');
      addPassive(w, 'clover');
      w.time = seed * 3;
      for (const r of openChest(w)) {
        expect(kinds).toContain(r.kind);
        expect(JSON.stringify(r)).not.toMatch(/gold|coin/i);
      }
    }
  });
});

describe('chest drops and opening', () => {
  function killAt(world: World, slot: number): void {
    damageEnemy(world, slot, 1e9, 0, 0, 0, 0);
  }

  it('an elite and a boss each drop exactly one chest; a plain enemy drops none', () => {
    const world = quietWorld();
    world.player.x = -1000;
    spawnElite(world, 'bat', { x: 0, y: 0 });
    spawnBoss(world, 'reaper5');
    world.enemies.cols.x[1] = 100;
    world.enemies.cols.y[1] = 0;
    spawnEnemy(world, 'ghoul', 50, 0);
    for (let i = 0; i < world.enemies.count; i++) killAt(world, i);
    world.step(DT);
    expect(world.chests.count).toBe(2);
    expect(world.stats.kills).toBe(3);
    world.step(DT);
    expect(world.chests.count).toBe(2);
  });

  it('opens a chest in reach, freezes the world until the flow closes it, then resumes without a time jump', () => {
    const world = quietWorld();
    addChest(world, CHEST_OPEN_RADIUS - 1, 0);
    const post = vi.fn<(m: { type: 'chestOpened'; rewards: ChestReward[] }) => void>();
    const pause = vi.fn();
    const resume = vi.fn();
    const flow = createChestFlow({ post, pause, resume });
    world.step(DT);
    flow.afterStep(world);
    expect(world.chests.count).toBe(0);
    expect(world.fx.count).toBeGreaterThanOrEqual(1);
    expect(pause).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith({ type: 'chestOpened', rewards: world.chestRewards });
    const frozen = world.time;
    world.step(DT);
    world.step(DT);
    expect(world.time).toBe(frozen);
    flow.close(world);
    expect(resume).toHaveBeenCalledOnce();
    expect(world.chestRewards).toBeNull();
    world.step(DT);
    expect(world.time).toBeCloseTo(frozen + DT);
  });

  it('waits on the ground while a level-up is pending, and out of reach', () => {
    const world = quietWorld();
    addChest(world, CHEST_OPEN_RADIUS + 5, 0);
    world.step(DT);
    expect(world.chests.count).toBe(1);
    world.chests.cols.x[0] = 0;
    world.pendingLevelUps = 1;
    world.step(DT);
    expect(world.chests.count).toBe(1);
    world.pendingLevelUps = 0;
    world.step(DT);
    expect(world.chests.count).toBe(0);
    expect(world.chestRewards).not.toBeNull();
  });

  it('kills of the indexed elite in a real step drop its chest at its position', () => {
    const world = quietWorld();
    const slot = spawnElite(world, 'bat', { x: 300, y: 40 });
    indexEnemies(world);
    killAt(world, slot);
    world.step(DT);
    expect(world.chests.count).toBe(1);
    expect(Math.abs((world.chests.cols.x[0] ?? 0) - 300)).toBeLessThan(5);
  });
});
