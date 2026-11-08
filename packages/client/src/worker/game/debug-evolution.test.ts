import { ELITE, EVOLUTION_MIN_TIME_S, EVOLUTIONS, MAX_WEAPON_SLOTS } from '@vs/shared';
import { expect, it } from 'vitest';
import { forceEvolution, FORCED_ELITE_OFFSET, nextEvolution } from './debug-evolution';
import { ENEMY_FLAG_ELITE } from './enemies';
import { readPassives, readWeapons } from './snapshot';
import { availableEvolution } from './systems/chest-open';
import { addWeapon } from './weapons/owned';
import { createWorld } from './world';

it('sets up each pair: maxed weapon, passive, 5:00 and an elite in front of the player', () => {
  for (let i = 0; i < EVOLUTIONS.length; i++) {
    const world = createWorld({ seed: i });
    const evolution = nextEvolution(i);
    const { done } = forceEvolution(world, evolution);
    expect(done, evolution.intoWeaponId).toBe(true);
    expect(world.time).toBe(EVOLUTION_MIN_TIME_S);
    expect(readWeapons(world)).toContainEqual({ id: evolution.weaponId, level: 8 });
    expect(readPassives(world).map((p) => p.id)).toContain(evolution.passiveId);
    expect(availableEvolution(world)).toBe(evolution);
    const { flags, x, hp } = world.enemies.cols;
    expect(world.enemies.count).toBe(1);
    expect((flags[0] ?? 0) & ENEMY_FLAG_ELITE).toBe(ENEMY_FLAG_ELITE);
    expect(x[0]).toBe(world.player.x + FORCED_ELITE_OFFSET);
    expect(hp[0]).toBe(5 * ELITE.hp);
  }
  expect(nextEvolution(EVOLUTIONS.length)).toBe(EVOLUTIONS[0]);
});

it('does nothing with all weapon slots full, and keeps a later run clock', () => {
  const world = createWorld({ seed: 1 });
  for (const id of ['magicWand', 'axe', 'cross', 'kingBible', 'fireWand'] as const)
    addWeapon(world, id);
  expect(world.weapons).toHaveLength(MAX_WEAPON_SLOTS);
  // Pair 2 is the Knife, which no longer fits.
  expect(forceEvolution(world, nextEvolution(2)).done).toBe(false);
  expect(world.enemies.count).toBe(0);
  const later = createWorld({ seed: 1 });
  later.time = 400;
  expect(forceEvolution(later, nextEvolution(0)).done).toBe(true);
  expect(later.time).toBe(400);
});
