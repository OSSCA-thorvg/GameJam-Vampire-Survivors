import { WEAPONS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { armed, DT, effectiveLevel, flyProjectiles, withStats } from './arm-test-helpers';
import { knife, KNIFE_RADIUS, KNIFE_SPREAD } from './patterns/knife';
import { weaponSystem } from './system';

describe('knife', () => {
  it('flies along the last movement direction at its speed, with its pierce, lifetime and radius', () => {
    const { world, w } = armed('knife');
    world.player.lastDirX = 0;
    world.player.lastDirY = 1;
    const lv = effectiveLevel(world, w);
    knife.fire(world.weaponContext, w, lv, 0);
    const p = world.projectiles.cols;
    expect(world.projectiles.count).toBe(1);
    expect([p.vx[0], p.vy[0]]).toEqual([0, 500]);
    expect([p.radius[0], p.pierceLeft[0], p.ttl[0], p.damage[0]]).toEqual([
      KNIFE_RADIUS,
      1,
      2,
      6.5,
    ]);
    flyProjectiles(world, 30);
    expect(p.x[0]).toBeCloseTo(0, 4);
    expect(p.y[0]).toBeCloseTo(250, 2);
  });

  it('spreads a burst sideways, alternating sides, 0.05 s apart', () => {
    const { world, w } = armed('knife', 8);
    expect(WEAPONS.knife.levels[7]?.amount).toBe(6);
    world.player.lastDirX = 1;
    world.player.lastDirY = 0;
    w.cooldownLeft = DT;
    const fireSteps: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const before = world.projectiles.count;
      weaponSystem(world, DT);
      if (world.projectiles.count > before) fireSteps.push(i);
    }
    // 0.05 s is 3 steps.
    expect(fireSteps).toEqual([1, 4, 7, 10, 13, 16]);
    const ys = Array.from(world.projectiles.cols.y.subarray(0, 6), (y) => Math.round(y));
    expect(ys).toEqual([0, 1, -1, 2, -2, 3].map((k) => k * KNIFE_SPREAD));
    expect(Array.from(world.projectiles.cols.vx.subarray(0, 6))).toEqual(Array(6).fill(500));
  });

  it('reads amount, speed, might and area from the player stats', () => {
    const { world, w } = armed('knife');
    withStats(world, [
      { stat: 'amount', add: 1 },
      { stat: 'speed', add: 0.5 },
      { stat: 'might', add: 1 },
      { stat: 'area', add: 1 },
    ]);
    w.cooldownLeft = DT;
    for (let i = 0; i < 10; i++) weaponSystem(world, DT);
    const p = world.projectiles.cols;
    expect(world.projectiles.count).toBe(2);
    expect([p.vx[0], p.damage[0], p.radius[0], p.scale[0]]).toEqual([750, 13, KNIFE_RADIUS * 2, 2]);
  });
});
