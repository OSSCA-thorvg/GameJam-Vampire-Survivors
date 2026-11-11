import { BASE_STATS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { indexEnemies, target } from '../combat-test-helpers';
import { armed, DT, effectiveLevel, withStats } from './arm-test-helpers';
import { garlic, GARLIC_ART_RING_RATIO, garlicDrawScale, GARLIC_RADIUS } from './patterns/garlic';
import { weaponSystem } from './system';

describe('garlic', () => {
  it('damages and pushes an enemy inside the torso-centered aura and leaves one below it alone', () => {
    const { world, w } = armed('garlic');
    // A bat has radius 12: it overlaps the 50-unit aura up to 62 units away.
    const inside = target(world, 'bat', 30, -68);
    const outside = target(world, 'bat', 0, 50);
    indexEnemies(world);
    garlic.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    expect(world.enemies.cols.hp[inside]).toBe(Math.fround(1000 - 5 * BASE_STATS.might));
    expect(world.enemies.cols.hp[outside]).toBe(1000);
    expect(world.enemies.cols.kbX[inside]).toBeGreaterThan(0);
    expect(world.enemies.cols.kbY[inside]).toBeLessThan(0);
  });

  it('ticks on its cooldown, is always shown and grows with area', () => {
    const { world } = armed('garlic');
    const far = target(world, 'bat', 100, 0);
    withStats(world, [{ stat: 'area', add: 1 }]);
    let ticks = 0;
    let hp = world.enemies.cols.hp[far] ?? 0;
    for (let i = 0; i < 300; i++) {
      indexEnemies(world);
      weaponSystem(world, DT);
      const now = world.enemies.cols.hp[far] ?? 0;
      if (now !== hp) ticks++;
      hp = now;
    }
    // 5 s at a 1.3 s × BASE_STATS.cooldown (1 since #173) tick, the first included (#154): 3 ticks; at area 2 the aura
    // reaches 100 + 12 units.
    expect(ticks).toBe(3);
    expect(world.weaponVisuals.garlic).toEqual({
      shown: true,
      scale: garlicDrawScale(2),
      evolved: false,
    });
    expect(GARLIC_RADIUS * 2).toBe(100);
  });

  it.each([1, 1.5])('draws the visible ring on the hit radius at area %s (#91)', (area) => {
    const { world } = armed('garlic');
    withStats(world, [{ stat: 'area', add: area - 1 }]);
    indexEnemies(world);
    weaponSystem(world, DT);
    const { scale } = world.weaponVisuals.garlic;
    // The 100×100 art is 50 units from centre to edge at scale 1; its ring edge sits at GARLIC_ART_RING_RATIO of that.
    expect(50 * scale * GARLIC_ART_RING_RATIO).toBeCloseTo(GARLIC_RADIUS * area, 9);
    expect(scale).toBeGreaterThan(area);
  });
});
