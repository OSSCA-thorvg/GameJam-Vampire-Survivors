import { describe, expect, it } from 'vitest';
import { target } from '../combat-test-helpers';
import { armed, effectiveLevel, flyProjectiles, withStats } from './arm-test-helpers';
import { cross, CROSS_RADIUS } from './patterns/cross';

describe('cross', () => {
  it('flies at the nearest enemy, turns and comes back past the player, hitting it once each way', () => {
    const { world, w } = armed('cross');
    const enemy = target(world, 'ghoul', 60, 0);
    world.enemyGrid.rebuild(world.enemies.cols.x, world.enemies.cols.y, world.enemies.count);
    cross.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    const p = world.projectiles.cols;
    expect([p.vx[0], p.vy[0]]).toEqual([400, 0]);
    const hits: number[] = [];
    let far = 0;
    let lastX = 0;
    let hp = world.enemies.cols.hp[enemy] ?? 0;
    flyProjectiles(world, 120, (step) => {
      if (world.projectiles.count === 0) return;
      lastX = p.x[0] ?? 0;
      far = Math.max(far, lastX);
      const now = world.enemies.cols.hp[enemy] ?? 0;
      if (now !== hp) hits.push(step);
      hp = now;
    });
    // Speed × returnAfter / 2: it turns about 120 units out (a little more with discrete steps).
    expect(far).toBeGreaterThan(118);
    expect(far).toBeLessThan(126);
    expect(lastX).toBeLessThan(-200);
    expect(hits).toHaveLength(2);
    expect(world.enemies.cols.hp[enemy]).toBe(1000 - 2 * 50);
  });

  it('is removed once it leaves the view after turning', () => {
    const { world, w } = armed('cross');
    cross.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    let gone = -1;
    flyProjectiles(world, 240, (step) => {
      if (gone < 0 && world.projectiles.count === 0) gone = step;
    });
    // It reaches -704 (the view's left edge minus 64) at about 1.8 s, before its 4 s lifetime.
    expect(gone).toBeGreaterThan(90);
    expect(gone).toBeLessThan(150);
  });

  it('scales its radius and art with area and its speed with the speed stat', () => {
    const { world, w } = armed('cross');
    withStats(world, [
      { stat: 'area', add: 0.5 },
      { stat: 'speed', add: 0.25 },
    ]);
    cross.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    const p = world.projectiles.cols;
    expect([p.radius[0], p.scale[0], p.vx[0]]).toEqual([CROSS_RADIUS * 1.5, 1.5, 500]);
  });
});
