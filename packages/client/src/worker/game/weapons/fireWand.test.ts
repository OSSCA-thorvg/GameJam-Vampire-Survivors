import { BASE_STATS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { target } from '../combat-test-helpers';
import { armed, DT, effectiveLevel, withStats } from './arm-test-helpers';
import { fireWand } from './patterns/fireWand';
import { weaponSystem } from './system';

describe('fire wand', () => {
  it('targets random enemies inside the view only, every one of them eventually', () => {
    const { world, w } = armed('fireWand');
    const onScreen = [
      [300, 100],
      [-500, -300],
      [100, 300],
    ] as const;
    for (const [x, y] of onScreen) target(world, 'bat', x, y);
    target(world, 'bat', 2000, 0);
    const lv = effectiveLevel(world, w);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      fireWand.fire(world.weaponContext, w, lv, 0);
      const k = world.projectiles.count - 1;
      const { y: launchY, vx, vy } = world.projectiles.cols;
      expect(launchY[k]).toBeCloseTo(-19.2, 4);
      const dx = vx[k] ?? 0;
      const dy = vy[k] ?? 0;
      expect(Math.hypot(dx, dy)).toBeCloseTo(375, 2);
      const aimed = onScreen.find(
        ([x, y]) => Math.abs(Math.atan2(y + 19.2, x) - Math.atan2(dy, dx)) < 1e-4,
      );
      expect(aimed, `shot ${String(i)}`).toBeDefined();
      seen.add(String(aimed));
    }
    expect(seen.size).toBe(3);
  });

  it('fires along the last movement direction when no enemy is on screen', () => {
    const { world, w } = armed('fireWand');
    target(world, 'bat', 0, 900);
    world.player.lastDirX = -1;
    fireWand.fire(world.weaponContext, w, effectiveLevel(world, w), 0);
    expect(world.projectiles.cols.vx[0]).toBe(-375);
    expect(world.projectiles.cols.vy[0]).toBe(0);
  });

  it('fires sooner with a lower cooldown stat and lives longer with the duration stat', () => {
    const { world } = armed('fireWand');
    withStats(world, [
      { stat: 'cooldown', add: -0.5 },
      { stat: 'duration', add: 0.5 },
    ]);
    let first = -1;
    for (let i = 1; i <= 200 && first < 0; i++) {
      weaponSystem(world, DT);
      if (world.projectiles.count > 0) first = i;
    }
    // The first burst comes after the L1 cooldown (3 s, 180 steps) and the next after 3 s × (BASE_STATS.cooldown - 0.5).
    expect(first).toBe(180);
    expect(world.projectiles.cols.ttl[0]).toBe(3);
    const w = world.weapons[0];
    expect(w?.cooldownLeft).toBeCloseTo(3 * (BASE_STATS.cooldown - 0.5), 6);
  });
});
