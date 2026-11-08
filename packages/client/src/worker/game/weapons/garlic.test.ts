import { describe, expect, it } from 'vitest';
import { indexEnemies, target } from '../combat-test-helpers';
import { armed, DT, effectiveLevel, withStats } from './arm-test-helpers';
import { garlic, GARLIC_RADIUS } from './patterns/garlic';
import { weaponSystem } from './system';

describe('garlic', () => {
  it('damages and pushes an enemy inside the radius and not one outside it', () => {
    const { world, w } = armed('garlic');
    // A bat has radius 12: it overlaps the 50-unit aura up to 62 units away.
    const inside = target(world, 'bat', 55, 0);
    const outside = target(world, 'bat', 0, 70);
    indexEnemies(world);
    garlic.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    expect(world.enemies.cols.hp[inside]).toBe(995);
    expect(world.enemies.cols.hp[outside]).toBe(1000);
    expect(world.enemies.cols.kbX[inside]).toBeGreaterThan(0);
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
    // 5 s at a 1.3 s tick: 3 ticks; at area 2 the aura reaches 100 + 12 units.
    expect(ticks).toBe(3);
    expect(world.weaponVisuals.garlic).toEqual({ shown: true, scale: 2 });
    expect(GARLIC_RADIUS * 2).toBe(100);
  });
});
