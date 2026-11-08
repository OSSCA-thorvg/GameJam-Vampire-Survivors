import type { PassiveId } from './passives.js';
import type { WeaponId } from './weapons.js';

/** A weapon at max level plus its passive evolves into `intoWeaponId` from a chest (#15, ADR 0008). */
export interface EvolutionDef {
  weaponId: WeaponId;
  passiveId: PassiveId;
  intoWeaponId: WeaponId;
}

/** The 8 fixed pairs of ADR 0008, in its order (also the order the `E` debug key walks). */
export const EVOLUTIONS: readonly EvolutionDef[] = [
  { weaponId: 'whip', passiveId: 'hollowHeart', intoWeaponId: 'bloodyTear' },
  { weaponId: 'magicWand', passiveId: 'emptyTome', intoWeaponId: 'holyWand' },
  { weaponId: 'knife', passiveId: 'bracer', intoWeaponId: 'thousandEdge' },
  { weaponId: 'axe', passiveId: 'candelabrador', intoWeaponId: 'deathSpiral' },
  { weaponId: 'cross', passiveId: 'clover', intoWeaponId: 'heavenSword' },
  { weaponId: 'kingBible', passiveId: 'spellbinder', intoWeaponId: 'unholyVespers' },
  { weaponId: 'fireWand', passiveId: 'spinach', intoWeaponId: 'hellfire' },
  { weaponId: 'garlic', passiveId: 'pummarola', intoWeaponId: 'soulEater' },
];
