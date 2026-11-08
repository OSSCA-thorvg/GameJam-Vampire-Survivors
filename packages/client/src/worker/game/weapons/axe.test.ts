import { describe, expect, it } from 'vitest';
import { armed, effectiveLevel, flyProjectiles, withStats } from './arm-test-helpers';
import { axe, AXE_LAUNCH_VY, AXE_RADIUS, AXE_SPREAD_X } from './patterns/axe';

describe('axe', () => {
  it('is thrown up, falls under gravity (vy changes sign) and is removed below the view', () => {
    const { world, w } = armed('axe');
    axe.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    const p = world.projectiles.cols;
    expect(p.vy[0]).toBe(AXE_LAUNCH_VY);
    expect(Math.abs(p.vx[0] ?? NaN)).toBeLessThan(AXE_SPREAD_X);
    expect(p.radius[0]).toBe(AXE_RADIUS);
    const vys: number[] = [];
    let top = 0;
    let removedAt = -1;
    flyProjectiles(world, 180, (step) => {
      if (world.projectiles.count === 0) {
        if (removedAt < 0) removedAt = step;
        return;
      }
      vys.push(p.vy[0] ?? NaN);
      top = Math.min(top, p.y[0] ?? 0);
    });
    expect(vys[0]).toBeLessThan(0);
    expect(vys.at(-1)).toBeGreaterThan(0);
    // 600² / (2 × 900) = 200 units above the player at the top of the arc (less 5 for the discrete steps).
    expect(top).toBeLessThan(-190);
    expect(top).toBeGreaterThan(-205);
    // Removed once below the view's bottom (360 under the camera) plus 100, before its 3 s run out: about 1.8 s.
    expect(removedAt).toBeGreaterThan(100);
    expect(removedAt).toBeLessThan(120);
  });

  it('hits up to its pierce, with damage after might', () => {
    const { world, w } = armed('axe');
    withStats(world, [{ stat: 'might', add: 0.5 }]);
    const lv = effectiveLevel(world, w);
    expect(lv.damage).toBe(30);
    axe.fire(world.weaponContext, w, lv, 0);
    expect(world.projectiles.cols.damage[0]).toBe(30);
  });
});
