import { MAX_WEAPON_SLOTS, WEAPONS, WEAPON_LIST, type WeaponDef, type WeaponId } from '@vs/shared';
import { PATTERNS } from './patterns/registry';

/** A weapon the player holds (#10); its index in `world.weapons` is its slot. */
export interface OwnedWeapon {
  def: WeaponDef;
  /** 1..`def.maxLevel`. */
  level: number;
  /** Seconds until the next burst. */
  cooldownLeft: number;
  /** Shots left in the current burst, fired `BURST_GAP_SEC` apart. */
  burstLeft: number;
  /** Seconds until the burst's next shot. */
  burstTimer: number;
  /** Index of the burst's next shot (0 is the first), passed to the pattern's `fire`. */
  shot: number;
  /** `player.facingX` when the burst started, so a burst keeps its sides when the player turns mid-burst. */
  burstFacingX: -1 | 1;
}

export interface WeaponsState {
  weapons: OwnedWeapon[];
}

/**
 * Adds `id` at level 1 in the next slot; its first burst comes after one cooldown. False when it is already owned or
 * all `MAX_WEAPON_SLOTS` are taken. Used by `createWorld`, the `G` debug key and #11's level-up choices.
 */
export function addWeapon(world: WeaponsState, id: WeaponId): boolean {
  if (world.weapons.length >= MAX_WEAPON_SLOTS) return false;
  if (world.weapons.some((w) => w.def.id === id)) return false;
  const def = WEAPONS[id];
  if (import.meta.env.DEV && !PATTERNS[def.pattern])
    throw new Error(`Weapon '${id}' uses pattern '${def.pattern}', which has no module`);
  world.weapons.push({
    def,
    level: 1,
    cooldownLeft: def.levels[0]?.cooldownSec ?? 0,
    burstLeft: 0,
    burstTimer: 0,
    shot: 0,
    burstFacingX: 1,
  });
  return true;
}

/** Raises an owned weapon by one level. False when it is not owned or already at `maxLevel`. Used by #11. */
export function levelUpWeapon(world: WeaponsState, id: WeaponId): boolean {
  const weapon = world.weapons.find((w) => w.def.id === id);
  if (!weapon || weapon.level >= weapon.def.maxLevel) return false;
  weapon.level++;
  return true;
}

/** The `G` debug key (dev builds): adds the first weapon of `WEAPON_LIST` not owned yet. Returns its ID, or null. */
export function grantNextWeapon(world: WeaponsState): WeaponId | null {
  for (const id of WEAPON_LIST) if (addWeapon(world, id)) return id;
  return null;
}
