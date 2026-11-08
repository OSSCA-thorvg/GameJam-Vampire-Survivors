import {
  EVOLUTIONS,
  LEVELUP_CHOICES,
  LEVELUP_HEAL,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PASSIVES,
  WEAPONS,
  WEAPON_LIST,
  type PassiveDef,
  type Rng,
  type StatBlock,
  type WeaponDef,
} from '@vs/shared';
import type { LevelUpOption } from '../../protocol/worker-messages';
import type { OwnedPassive } from './passives';
import type { OwnedWeapon } from './weapons/owned';

/** What the options read: the inventory, the luck stat and the level-up stream (`world.rng.fork('levelup')`). */
export interface LevelUpOptionsWorld {
  weapons: readonly Pick<OwnedWeapon, 'def' | 'level'>[];
  passives: readonly OwnedPassive[];
  player: { readonly stats: Pick<StatBlock, 'luck'> };
  levelUpRng: Rng;
}

/** Draw weights (initial values, untuned): an upgrade is a little likelier than a new item. */
export const NEW_ITEM_WEIGHT = 1;
export const UPGRADE_WEIGHT = 1.2;
/** The 4th card's chance is `min(FOURTH_CARD_MAX_CHANCE, luck - 1)` (**[unverified]**, gameplay.md). */
export const FOURTH_CARD_MAX_CHANCE = 0.5;

const ALL_WEAPONS: readonly WeaponDef[] = WEAPON_LIST.map((id) => WEAPONS[id]);

/** Whether `id` is owned, or its evolution is (#15): an evolved base weapon is never offered again. */
function ownedOrEvolved(weapons: LevelUpOptionsWorld['weapons'], id: WeaponDef['id']): boolean {
  const into = EVOLUTIONS.find((e) => e.weaponId === id)?.intoWeaponId;
  return weapons.some((w) => w.def.id === id || w.def.id === into);
}

function weight(o: LevelUpOption | undefined): number {
  if (!o) return 0;
  return o.kind === 'upgradeWeapon' || o.kind === 'upgradePassive'
    ? UPGRADE_WEIGHT
    : NEW_ITEM_WEIGHT;
}

/** Moves one pick from `candidates[from..]`, drawn by `weight`, to index `from`. */
function pickInto(candidates: LevelUpOption[], from: number, rng: Rng): void {
  let total = 0;
  for (let i = from; i < candidates.length; i++) total += weight(candidates[i]);
  let r = rng.next() * total;
  let j = candidates.length - 1;
  for (let i = from; i < candidates.length; i++) {
    r -= weight(candidates[i]);
    if (r < 0) {
      j = i;
      break;
    }
  }
  const swap = candidates[from];
  const chosen = candidates[j];
  if (!swap || !chosen) return;
  candidates[from] = chosen;
  candidates[j] = swap;
}

/**
 * The cards of one level-up (#11, passives #12): `LEVELUP_CHOICES` distinct candidates drawn by weight (new items
 * `NEW_ITEM_WEIGHT`, upgrades `UPGRADE_WEIGHT`) from the upgrades of owned weapons and passives below their
 * `maxLevel` and, while a slot of that kind is free, the weapons and passives not owned yet (a weapon whose evolution
 * is owned counts as owned, #15); then a 4th card with probability `min(0.5, luck - 1)` when a 4th candidate exists.
 * With no candidate it is a single heal of `LEVELUP_HEAL`; never gold (REQUIREMENTS #8, #9). `catalog` and `passiveCatalog` exist for tests.
 */
export function buildLevelUpOptions(
  world: LevelUpOptionsWorld,
  catalog: readonly WeaponDef[] = ALL_WEAPONS,
  passiveCatalog: readonly PassiveDef[] = PASSIVES,
): LevelUpOption[] {
  const candidates: LevelUpOption[] = [];
  for (const { def, level } of world.weapons)
    if (level < def.maxLevel)
      candidates.push({
        kind: 'upgradeWeapon',
        weaponId: def.id,
        name: def.name,
        toLevel: level + 1,
        description: def.levelText[level - 1] ?? '',
        iconId: def.iconId,
      });
  for (const { def, level } of world.passives)
    if (level < def.maxLevel)
      candidates.push({
        kind: 'upgradePassive',
        passiveId: def.id,
        name: def.name,
        toLevel: level + 1,
        description: def.description,
        iconId: def.iconId,
      });
  if (world.weapons.length < MAX_WEAPON_SLOTS)
    for (const def of catalog)
      if (!ownedOrEvolved(world.weapons, def.id))
        candidates.push({
          kind: 'newWeapon',
          weaponId: def.id,
          name: def.name,
          description: def.description,
          iconId: def.iconId,
        });
  if (world.passives.length < MAX_PASSIVE_SLOTS)
    for (const def of passiveCatalog)
      if (!world.passives.some((p) => p.def.id === def.id))
        candidates.push({
          kind: 'newPassive',
          passiveId: def.id,
          name: def.name,
          description: def.description,
          iconId: def.iconId,
        });
  if (candidates.length === 0)
    return [
      {
        kind: 'heal',
        amount: LEVELUP_HEAL,
        description: `Recover ${String(LEVELUP_HEAL)} HP.`,
        iconId: null,
      },
    ];
  const rng = world.levelUpRng;
  let picked = Math.min(LEVELUP_CHOICES, candidates.length);
  for (let i = 0; i < picked; i++) pickInto(candidates, i, rng);
  const fourthChance = Math.min(FOURTH_CARD_MAX_CHANCE, world.player.stats.luck - 1);
  if (picked < candidates.length && fourthChance > 0 && rng.next() < fourthChance) {
    pickInto(candidates, picked, rng);
    picked++;
  }
  return candidates.slice(0, picked);
}
