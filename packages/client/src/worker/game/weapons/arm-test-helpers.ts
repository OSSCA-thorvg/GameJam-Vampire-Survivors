import type { WeaponId, WeaponLevel } from '@vs/shared';
import { indexEnemies, quietWorld } from '../combat-test-helpers';
import { projectileSystem } from '../projectiles';
import { recomputeStats } from '../stats';
import type { World } from '../world';
import { addWeapon, levelUpWeapon, type OwnedWeapon } from './owned';
import { applyStats } from './system';

export const DT = 1 / 60;

/** A quiet world holding only `id` at `level`, with the player at the origin. */
export function armed(id: WeaponId, level = 1): { world: World; w: OwnedWeapon } {
  const world = quietWorld();
  addWeapon(world, id);
  for (let l = 1; l < level; l++) levelUpWeapon(world, id);
  const w = world.weapons[0];
  if (!w) throw new Error(`no ${id}`);
  return { world, w };
}

/** The weapon's level after the player's stats, as `weaponSystem` hands it to the pattern. */
export function effectiveLevel(world: World, w: OwnedWeapon): WeaponLevel {
  const base = w.def.levels[w.level - 1];
  if (!base) throw new Error('no level');
  return applyStats(base, world.player.stats, { ...base });
}

/** Adds run modifiers (for example `{ stat: 'area', add: 0.5 }`) and recomputes the stats, as a passive would. */
export function withStats(world: World, mods: World['player']['runModifiers']): void {
  world.player.runModifiers.push(...mods);
  recomputeStats(world);
}

/** Steps only the projectiles, rebuilding the grid each step; advances `world.time`. */
export function flyProjectiles(world: World, steps: number, each?: (step: number) => void): void {
  for (let i = 0; i < steps; i++) {
    indexEnemies(world);
    projectileSystem(world, DT);
    world.time += DT;
    each?.(i);
  }
}
