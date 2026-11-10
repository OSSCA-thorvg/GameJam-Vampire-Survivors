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
 * Sets up the player of a fresh world as `def` (#14): the character's modifiers (applied by `recomputeStats` after
 * `BASE_STATS` and before passives), then the starting weapon at level 1 timed by those stats (#154), and full HP.
 * Called once by `createWorld`.
 */
export function applyCharacter(
  world: WeaponsState & PassivesState & { player: PlayerState },
  def: CharacterDef,
): void {
  world.player.characterModifiers.splice(0, Infinity, ...def.modifiers);
  recomputeStats(world);
  // After the stats, so the starting weapon's first burst follows the character's cooldown modifier (#154).
  addWeapon(world, def.startingWeaponId);
  world.player.hp = world.player.maxHp;
}
