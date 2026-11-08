import {
  LEVELUP_CHOICES,
  LEVELUP_HEAL,
  MAX_WEAPON_SLOTS,
  WEAPONS,
  WEAPON_LIST,
  type Rng,
  type WeaponDef,
} from '@vs/shared';
import type { LevelUpOption } from '../../protocol/worker-messages';
import type { OwnedWeapon } from './weapons/owned';

/** What the options read: the owned weapons and the level-up stream (`world.rng.fork('levelup')`). */
export interface LevelUpOptionsWorld {
  weapons: readonly Pick<OwnedWeapon, 'def' | 'level'>[];
  levelUpRng: Rng;
}

const ALL_WEAPONS: readonly WeaponDef[] = WEAPON_LIST.map((id) => WEAPONS[id]);

/**
 * The cards of one level-up (#11): up to `LEVELUP_CHOICES` distinct candidates picked uniformly from the upgrades of
 * owned weapons below their `maxLevel` and, while a slot is free, the weapons not owned yet. With no candidate it is
 * a single heal of `LEVELUP_HEAL`; never gold (REQUIREMENTS #8, #9). #12 adds passives. `catalog` exists for tests.
 */
export function buildLevelUpOptions(
  world: LevelUpOptionsWorld,
  catalog: readonly WeaponDef[] = ALL_WEAPONS,
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
  if (world.weapons.length < MAX_WEAPON_SLOTS)
    for (const def of catalog)
      if (!world.weapons.some((w) => w.def.id === def.id))
        candidates.push({
          kind: 'newWeapon',
          weaponId: def.id,
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
  // A partial Fisher-Yates shuffle: the first `picked` entries are a uniform sample without repeats.
  const picked = Math.min(LEVELUP_CHOICES, candidates.length);
  for (let i = 0; i < picked; i++) {
    const j = i + world.levelUpRng.int(candidates.length - i);
    const swap = candidates[i];
    const chosen = candidates[j];
    if (!swap || !chosen) break;
    candidates[i] = chosen;
    candidates[j] = swap;
  }
  return candidates.slice(0, picked);
}
