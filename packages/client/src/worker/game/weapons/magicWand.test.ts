import { WEAPONS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { indexEnemies, quietWorld, target } from '../combat-test-helpers';
import { addWeapon } from './owned';
import { magicWand, WAND_BOLT_RADIUS } from './patterns/magicWand';

const L1 = WEAPONS.magicWand.levels[0];
if (!L1) throw new Error('no wand L1');

function armed() {
  const world = quietWorld();
  addWeapon(world, 'magicWand');
  const w = world.weapons[0];
  if (!w) throw new Error('no wand');
  world.player.x = 100;
  world.player.y = 100;
  return { world, w };
}

describe('magic wand', () => {
  it('aims at the enemy nearest the torso and launches from there with the configured bolt stats', () => {
    const { world, w } = armed();
    // The lower bat is closer to the feet, but the upper bat is closer to the torso.
    target(world, 'bat', 100, 100 + 190);
    target(world, 'bat', 100, 100 - 200);
    target(world, 'bat', 100 - 250, 100 + 250);
    indexEnemies(world);
    magicWand.fire(world.weaponContext, w, L1, 0);
    const p = world.projectiles.cols;
    expect(world.projectiles.count).toBe(1);
    expect(p.x[0]).toBe(100);
    expect(p.y[0]).toBeCloseTo(80.8, 4);
    expect(world.player).toMatchObject({ x: 100, y: 100 });
    expect(p.vx[0]).toBeCloseTo(0, 4);
    expect(p.vy[0]).toBeCloseTo(-L1.speed, 4);
    expect(p.rot[0]).toBeCloseTo(-90, 4);
    expect(p.pierceLeft[0]).toBe(L1.pierce);
    expect(p.ttl[0]).toBe(L1.durationSec);
    expect(p.radius[0]).toBe(WAND_BOLT_RADIUS);
    expect(p.damage[0]).toBe(L1.damage);
  });

  it('fires along the last movement direction when no enemy is in range', () => {
    const { world, w } = armed();
    world.player.lastDirX = -Math.SQRT1_2;
    world.player.lastDirY = Math.SQRT1_2;
    target(world, 'bat', 100 + 2000, 100);
    indexEnemies(world);
    magicWand.fire(world.weaponContext, w, L1, 0);
    const p = world.projectiles.cols;
    expect(p.vx[0]).toBeCloseTo(-L1.speed * Math.SQRT1_2, 3);
    expect(p.vy[0]).toBeCloseTo(L1.speed * Math.SQRT1_2, 3);
  });
});
