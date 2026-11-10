import { BASE_STATS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { indexEnemies, target } from '../combat-test-helpers';
import { armed, DT, effectiveLevel, withStats } from './arm-test-helpers';
import { kingBible } from './patterns/kingBible';
import { weaponSystem } from './system';

describe('king bible', () => {
  it('orbits the moving torso at orbitRadius × area and leaves a visible gap', () => {
    const { world } = armed('kingBible', 2);
    withStats(world, [{ stat: 'area', add: 0.2 }]);
    world.player.x = 30;
    world.player.y = -20;
    const counts: number[] = [];
    for (let i = 0; i < 60 * 13; i++) {
      world.player.y += 1;
      weaponSystem(world, DT);
      world.time += DT;
      const { books } = world.weaponVisuals;
      counts.push(books.count);
      for (let b = 0; b < books.count; b++)
        expect(
          Math.hypot((books.x[b] ?? 0) - 30, (books.y[b] ?? 0) - (world.player.y - 19.2)),
          `step ${String(i)}`,
        ).toBeCloseTo(75 * 1.2, 3);
    }
    // First out after the raw 3 s cooldown (180 steps), out for 3 s, then the cooldown counts 3 s × BASE_STATS.cooldown
    // (2.85 s since #148) with no books; float drift in `activeLeft` adds one step to each activation, and the cooldown
    // starts counting in the step the books go away.
    const cooldown = Math.round(3 * BASE_STATS.cooldown * 60);
    const changes = counts.flatMap((c, i) => (c !== (counts[i - 1] ?? 0) ? [[i, c]] : []));
    expect(changes).toEqual([
      [180, 2],
      [361, 0],
      [360 + cooldown, 2],
      [360 + cooldown + 181, 0],
    ]);
  });

  it('hits an enemy inside the ring at most once per hitCooldown', () => {
    const { world, w } = armed('kingBible');
    const lv = { ...effectiveLevel(world, w), speed: 0 };
    // A still book at angle 0, 75 units right of the torso, over a ghoul.
    const ghoul = target(world, 'ghoul', 75, -19.2);
    w.activeLeft = 10;
    const hits: number[] = [];
    let hp = world.enemies.cols.hp[ghoul] ?? 0;
    for (let i = 0; i < 180; i++) {
      indexEnemies(world);
      kingBible.update?.(world.weaponContext, w, lv, DT);
      const now = world.enemies.cols.hp[ghoul] ?? 0;
      if (now !== hp) hits.push(world.time);
      hp = now;
      world.time += DT;
    }
    expect(hits).toHaveLength(6);
    for (let i = 1; i < hits.length; i++)
      expect((hits[i] ?? 0) - (hits[i - 1] ?? 0)).toBeGreaterThanOrEqual(0.5 - 1e-4);
    expect(world.enemies.cols.hp[ghoul]).toBeCloseTo(1000 - 6 * 10 * BASE_STATS.might, 3);
  });

  it('keeps its books out longer with the duration stat', () => {
    const { world, w } = armed('kingBible');
    withStats(world, [{ stat: 'duration', add: 0.5 }]);
    w.cooldownLeft = DT;
    weaponSystem(world, DT);
    expect(w.activeLeft).toBeCloseTo(4.5, 6);
  });
});
