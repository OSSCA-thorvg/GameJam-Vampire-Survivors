import { LIGHT_SOURCE, PICKUPS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { VIEW_WIDTH } from '../constants';
import { indexEnemies, quietWorld, target } from './combat-test-helpers';
import {
  addLight,
  hitLightsInBox,
  hitLightsInCircle,
  readLights,
  rollPickup,
} from './light-sources';
import { readPickups } from './pickups';
import { armed, DT, effectiveLevel, flyProjectiles } from './weapons/arm-test-helpers';
import { garlic } from './weapons/patterns/garlic';
import { kingBible } from './weapons/patterns/kingBible';
import { whip } from './weapons/patterns/whip';
import { lightSourceSystem } from './systems/light-sources';
import type { World } from './world';

const BREAKS = 10_000;

/** Counts `rollPickup` results over `BREAKS` rolls, by pickup ID. */
function drops(world: World): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < BREAKS; i++) {
    const id = PICKUPS[rollPickup(world)]?.id ?? 'none';
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** The expected share of each eligible pickup at `level` and `luck`, from the data. */
function expectedShares(level: number, luck: number): Map<string, number> {
  const eligible = PICKUPS.filter((p) => p.minPlayerLevel <= level);
  const w = (p: (typeof PICKUPS)[number]) => p.weight * (p.luckAffected ? luck : 1);
  const total = eligible.reduce((sum, p) => sum + w(p), 0);
  return new Map(eligible.map((p) => [p.id, w(p) / total]));
}

describe('drop rolls', () => {
  it('never drops Rosary or Orologion to a level-1 player over 10,000 breaks of real lights', () => {
    const world = quietWorld();
    for (let i = 0; i < BREAKS; i++) {
      addLight(world, 0, 0);
      hitLightsInCircle(world, 0, 0, 1, 1);
      // Collect nothing: read the drop, then clear both stores.
      const [drop] = readPickups(world);
      expect(drop, `break ${String(i)}`).toBeDefined();
      expect(['rosary', 'orologion']).not.toContain(drop?.id);
      world.pickups.clear();
      world.lights.clear();
    }
  });

  it('matches the weights within ±1.5% at level 8', () => {
    const world = quietWorld();
    world.player.level = 8;
    // Base luck 1, whatever the starting character's modifiers (#14).
    world.player.stats.luck = 1;
    const got = drops(world);
    for (const [id, share] of expectedShares(8, 1))
      expect(Math.abs((got.get(id) ?? 0) / BREAKS - share), id).toBeLessThan(0.015);
  });

  it('gates Orologion at level 4 and Rosary at level 8', () => {
    const world = quietWorld();
    world.player.level = 4;
    const got = drops(world);
    expect(got.get('orologion')).toBeGreaterThan(0);
    expect(got.has('rosary')).toBe(false);
  });

  it('doubling luck doubles the luck-affected weights and leaves Little Clover unchanged', () => {
    const world = quietWorld();
    world.player.level = 8;
    world.player.stats.luck = 2;
    const got = drops(world);
    const shares = expectedShares(8, 2);
    // Little Clover 3 of 33 instead of 3 of 18.
    expect(shares.get('littleClover')).toBeCloseTo(3 / 33, 10);
    for (const [id, share] of shares)
      expect(Math.abs((got.get(id) ?? 0) / BREAKS - share), id).toBeLessThan(0.015);
    // Ratios between luck-affected pickups stay those of the weights.
    expect((got.get('floorChicken') ?? 0) / (got.get('vacuum') ?? 1)).toBeCloseTo(5, 0);
  });
});

describe('breaking a light', () => {
  it('switches it to broken, drops one pickup at its position and is not hittable again', () => {
    const world = quietWorld();
    addLight(world, 100, 50);
    expect(hitLightsInCircle(world, 100, 50, 1, 5)).toBe(1);
    expect(readLights(world)).toEqual([{ x: 100, y: 50, broken: true }]);
    expect(readPickups(world).map(({ x, y }) => [x, y])).toEqual([[100, 50]]);
    expect(hitLightsInCircle(world, 100, 50, 1, 5)).toBe(0);
    expect(world.pickups.count).toBe(1);
    expect(world.stats.kills).toBe(0);
  });

  it('hits by box with a closest-point test', () => {
    const world = quietWorld();
    addLight(world, 0, 30);
    addLight(world, 0, 40);
    // Light radius 12: the light at 30 overlaps a box ending at y = 20, the one at 40 does not.
    expect(hitLightsInBox(world, -10, -20, 10, 20, 1)).toBe(1);
    expect(readLights(world).map((l) => l.broken)).toEqual([true, false]);
  });
});

describe('weapon hit sites', () => {
  it('the whip strike breaks a light inside its box', () => {
    const { world, w } = armed('whip');
    addLight(world, 80, 0);
    indexEnemies(world);
    whip.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    expect(readLights(world)[0]?.broken).toBe(true);
    expect(world.pickups.count).toBe(1);
  });

  it('a projectile that hits a light keeps its pierce count and still hits the enemy behind it', () => {
    const { world } = armed('magicWand');
    addLight(world, 40, 0);
    const bat = target(world, 'bat', 80, 0);
    world.weaponContext.spawnProjectile('weapon.magicWand', 0, 0, 600, 0, {
      damage: 10,
      knockback: 0,
      radius: 6,
      pierce: 1,
      ttl: 2,
    });
    let pierceAfterLight = -1;
    flyProjectiles(world, 30, () => {
      if (pierceAfterLight < 0 && readLights(world)[0]?.broken)
        pierceAfterLight = world.projectiles.cols.pierceLeft[0] ?? -2;
    });
    expect(pierceAfterLight).toBe(1);
    expect(world.enemies.cols.hp[bat]).toBe(990);
  });

  it('a King Bible book breaks a light it overlaps', () => {
    const { world, w } = armed('kingBible');
    const lv = { ...effectiveLevel(world, w), speed: 0 };
    // The single book sits at angle 0, `orbitRadius` right of the player.
    addLight(world, lv.orbitRadius ?? 0, 0);
    kingBible.fire(world.weaponContext, w, lv, 0);
    indexEnemies(world);
    kingBible.update?.(world.weaponContext, w, lv, DT);
    expect(readLights(world)[0]?.broken).toBe(true);
  });

  it('a Garlic tick breaks a light inside the aura', () => {
    const { world, w } = armed('garlic');
    addLight(world, 40, 0);
    addLight(world, 0, 90);
    indexEnemies(world);
    garlic.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    expect(readLights(world).map((l) => l.broken)).toEqual([true, false]);
  });
});

describe('lightSourceSystem', () => {
  const intact = (world: World) => readLights(world).filter((l) => !l.broken).length;

  it('places 6 intact lights in the ring around the player on the first step', () => {
    const world = quietWorld();
    lightSourceSystem(world, DT);
    expect(intact(world)).toBe(LIGHT_SOURCE.targetCount);
    for (const l of readLights(world)) {
      const d = Math.hypot(l.x, l.y);
      expect(d).toBeGreaterThanOrEqual(LIGHT_SOURCE.spawnRingMin * VIEW_WIDTH - 1);
      expect(d).toBeLessThanOrEqual(LIGHT_SOURCE.spawnRingMax * VIEW_WIDTH + 1);
    }
  });

  it('recycles lights beyond the despawn distance and returns to 6 intact', () => {
    const world = quietWorld();
    lightSourceSystem(world, DT);
    const before = readLights(world);
    // Walk far away: every old light is now beyond 3 view widths.
    world.player.x = 10 * VIEW_WIDTH;
    for (let i = 0; i < 60 * LIGHT_SOURCE.respawnCheckIntervalS; i++) lightSourceSystem(world, DT);
    const after = readLights(world);
    expect(after).toHaveLength(LIGHT_SOURCE.targetCount);
    expect(intact(world)).toBe(LIGHT_SOURCE.targetCount);
    for (const l of after)
      expect(Math.hypot(l.x - world.player.x, l.y)).toBeLessThanOrEqual(
        LIGHT_SOURCE.despawnDistance * VIEW_WIDTH,
      );
    expect(after.some((l) => before.some((b) => b.x === l.x && b.y === l.y))).toBe(false);
  });

  it('replaces broken lights with intact ones and makes room in a full store', () => {
    const world = quietWorld();
    for (let round = 0; round < 5; round++) {
      world.lightTimer = 0;
      lightSourceSystem(world, DT);
      // Break every intact light where it stands.
      for (const l of readLights(world)) if (!l.broken) hitLightsInCircle(world, l.x, l.y, 1, 1);
      world.pickups.clear();
    }
    world.lightTimer = 0;
    lightSourceSystem(world, DT);
    expect(world.lights.count).toBeLessThanOrEqual(LIGHT_SOURCE.poolSize);
    expect(intact(world)).toBe(LIGHT_SOURCE.targetCount);
  });

  it('draws only from the lights stream, never the spawn stream', () => {
    const a = quietWorld(7);
    const b = quietWorld(7);
    lightSourceSystem(a, DT);
    expect(a.spawnRng.next()).toBe(b.spawnRng.next());
  });
});
