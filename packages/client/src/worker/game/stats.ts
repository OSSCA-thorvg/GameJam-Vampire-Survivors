import {
  BASE_MOVE_SPEED,
  BASE_STATS,
  STAT_IDS,
  type StatBlock,
  type StatModifier,
} from '@vs/shared';
import type { PassivesState } from './passives';
import type { PlayerState } from './player';

function apply(stats: StatBlock, mods: readonly StatModifier[], times: number): void {
  for (const { stat, add } of mods) stats[stat] += add * times;
}

/**
 * Rebuilds `player.stats` in place (#12): `BASE_STATS`, then the character's modifiers, then each owned passive's
 * `perLevel` times its level, then the run's modifiers. Derives `maxHp` (current HP moves by the same delta when it
 * rises and is clamped when it falls), `armor` and `moveSpeed`. Runs only when the inventory changes (a level-up
 * choice, a chest in #15, a pickup in #16) and once in `createWorld`, never per frame.
 */
export function recomputeStats(world: PassivesState & { player: PlayerState }): void {
  const { player } = world;
  const { stats } = player;
  for (const id of STAT_IDS) stats[id] = BASE_STATS[id];
  apply(stats, player.characterModifiers, 1);
  for (const { def, level } of world.passives) apply(stats, def.perLevel, level);
  apply(stats, player.runModifiers, 1);
  const delta = stats.maxHp - player.maxHp;
  player.maxHp = stats.maxHp;
  player.hp = delta > 0 ? player.hp + delta : Math.min(player.hp, player.maxHp);
  player.armor = stats.armor;
  player.moveSpeed = BASE_MOVE_SPEED * stats.moveSpeed;
}
