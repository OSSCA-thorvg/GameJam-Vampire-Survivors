import { MAX_PASSIVE_SLOTS, PASSIVES, type PassiveDef, type PassiveId } from '@vs/shared';

/** A passive the player holds (#12); its index in `world.passives` is its slot. */
export interface OwnedPassive {
  def: PassiveDef;
  /** 1..`def.maxLevel`. */
  level: number;
}

export interface PassivesState {
  passives: OwnedPassive[];
}

const BY_ID = new Map<PassiveId, PassiveDef>(PASSIVES.map((p) => [p.id, p]));

/**
 * Adds `id` at level 1 in the next slot. False when it is already owned or all `MAX_PASSIVE_SLOTS` are taken. The
 * caller runs `recomputeStats` afterwards.
 */
export function addPassive(world: PassivesState, id: PassiveId): boolean {
  const def = BY_ID.get(id);
  if (!def || world.passives.length >= MAX_PASSIVE_SLOTS) return false;
  if (world.passives.some((p) => p.def.id === id)) return false;
  world.passives.push({ def, level: 1 });
  return true;
}

/** Raises an owned passive by one level. False when it is not owned or already at `maxLevel`. */
export function levelUpPassive(world: PassivesState, id: PassiveId): boolean {
  const owned = world.passives.find((p) => p.def.id === id);
  if (!owned || owned.level >= owned.def.maxLevel) return false;
  owned.level++;
  return true;
}

/**
 * The `P` debug key (dev builds): adds the first passive of `PASSIVES` not owned yet or, with every slot taken, a
 * level of the first owned passive below its max. Returns its ID, or null when there is nothing to grant.
 */
export function grantNextPassive(world: PassivesState): PassiveId | null {
  if (world.passives.length < MAX_PASSIVE_SLOTS)
    for (const { id } of PASSIVES) if (addPassive(world, id)) return id;
  for (const p of world.passives) if (levelUpPassive(world, p.def.id)) return p.def.id;
  return null;
}
