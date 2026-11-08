import { EVOLUTIONS, EVOLUTION_MIN_TIME_S, type EnemyId, type EvolutionDef } from '@vs/shared';
import { addPassive } from './passives';
import { recomputeStats } from './stats';
import { spawnElite } from './systems/elites';
import { addWeapon } from './weapons/owned';
import type { World } from './world';

/** How far in front of the player the `E` key's elite appears, inside the reach of a maxed Whip (dev only). */
export const FORCED_ELITE_OFFSET = 120;
/** The forced elite's enemy: the weakest, so its chest comes quickly. */
export const FORCED_ELITE_ENEMY: EnemyId = 'bat';

/**
 * The `E` debug key (#15, dev builds only): reaches the preconditions of `evolution` in one press. It adds the base
 * weapon if missing and raises it to `maxLevel`, adds the passive if missing, moves the run clock forward to
 * `EVOLUTION_MIN_TIME_S` if earlier (a jump, not a fast-forward: 5 minutes of steps would stop at the first level-up
 * and bury a standing player), and spawns an elite of the current wave's first enemy `FORCED_ELITE_OFFSET` in front of
 * the player. The chest itself is still earned by killing that elite. Returns whether it set the pair up, and a log
 * line saying what it did or why it did nothing.
 */
export function forceEvolution(
  world: World,
  evolution: EvolutionDef,
): { done: boolean; log: string } {
  const skip = (log: string) => ({ done: false, log });
  const { weaponId, passiveId, intoWeaponId } = evolution;
  if (world.weapons.some((w) => w.def.id === intoWeaponId))
    return skip(`${intoWeaponId} already owned`);
  if (!world.weapons.some((w) => w.def.id === weaponId) && !addWeapon(world, weaponId))
    return skip(`no free weapon slot for ${weaponId}`);
  const weapon = world.weapons.find((w) => w.def.id === weaponId);
  if (!weapon) return skip(`no ${weaponId}`);
  if (!world.passives.some((p) => p.def.id === passiveId) && !addPassive(world, passiveId))
    return skip(`no free passive slot for ${passiveId}`);
  weapon.level = weapon.def.maxLevel;
  recomputeStats(world);
  if (world.time < EVOLUTION_MIN_TIME_S) {
    world.time = EVOLUTION_MIN_TIME_S;
    world.stats.timeSec = world.time;
  }
  // Always a bat (an elite has 50 HP), so any maxed weapon kills it within seconds: since #17 minute 5's first enemy is
  // a skeleton, whose elite (300 HP) outlasted slow-targeting weapons.
  const enemyId = FORCED_ELITE_ENEMY;
  const { x, y, facingX } = world.player;
  const slot = spawnElite(world, enemyId, { x: x + facingX * FORCED_ELITE_OFFSET, y });
  return {
    done: true,
    log: `${weaponId} L${String(weapon.level)} + ${passiveId} -> ${intoWeaponId}, elite ${enemyId} ${slot < 0 ? 'not spawned (cap)' : 'spawned'}`,
  };
}

/** The pair the next `E` press targets: walks `EVOLUTIONS` in order, wrapping, across runs of the worker session. */
export function nextEvolution(index: number): EvolutionDef {
  const evolution = EVOLUTIONS[index % EVOLUTIONS.length];
  if (!evolution) throw new Error('EVOLUTIONS is empty');
  return evolution;
}
