import { CHARACTERS, findCharacter, type CharacterDef } from '@vs/shared';
import type { PassivesState } from './passives';
import type { PlayerState } from './player';
import { recomputeStats } from './stats';
import { addWeapon, type WeaponsState } from './weapons/owned';

/** The character for `id`; an unknown id (any string can arrive in `startRun`) falls back to `CHARACTERS[0]` with a warning. */
export function resolveCharacter(id: string): CharacterDef {
  const def = findCharacter(id);
  if (def) return def;
  const fallback = CHARACTERS[0];
  if (!fallback) throw new Error('CHARACTERS is empty');
  console.warn(`[worker] unknown character '${id}'; starting as '${fallback.id}'`);
  return fallback;
}

/**
 * Sets up the player of a fresh world as `def` (#14): the starting weapon at level 1, the character's modifiers
 * (applied by `recomputeStats` after `BASE_STATS` and before passives) and full HP. Called once by `createWorld`.
 */
export function applyCharacter(
  world: WeaponsState & PassivesState & { player: PlayerState },
  def: CharacterDef,
): void {
  addWeapon(world, def.startingWeaponId);
  world.player.characterModifiers.splice(0, Infinity, ...def.modifiers);
  recomputeStats(world);
  world.player.hp = world.player.maxHp;
}
