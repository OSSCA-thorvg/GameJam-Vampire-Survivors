import type { DrawableAssetId } from '../assets.js';
import type { StatModifier } from './stats.js';

/** The 8 passive items (ADR 0008), each the evolution partner of one weapon (#15). */
export type PassiveId =
  | 'hollowHeart'
  | 'emptyTome'
  | 'bracer'
  | 'candelabrador'
  | 'clover'
  | 'spellbinder'
  | 'spinach'
  | 'pummarola';

export interface PassiveDef {
  id: PassiveId;
  /** Shown on the level-up card, like `WeaponDef.name`. */
  name: string;
  description: string;
  /** `icon.passive.<id>`. */
  iconId: DrawableAssetId;
  maxLevel: number;
  /** Applied once per level owned. */
  perLevel: readonly StatModifier[];
}

function passive(
  id: PassiveId,
  name: string,
  description: string,
  perLevel: StatModifier,
): PassiveDef {
  return { id, name, description, iconId: `icon.passive.${id}`, maxLevel: 5, perLevel: [perLevel] };
}

/**
 * Initial values, untuned against the original (docs/reference/gameplay.md § Level-up and evolution rules,
 * **[unverified]**): the owner deferred tuning, so these are the issue's (#12) table. Order is the `P` debug key's.
 */
export const PASSIVES: readonly PassiveDef[] = [
  passive('hollowHeart', 'Hollow Heart', 'Max HP up by 20.', { stat: 'maxHp', add: 20 }),
  passive('emptyTome', 'Empty Tome', 'Weapon cooldown down by 8%.', {
    stat: 'cooldown',
    add: -0.08,
  }),
  passive('bracer', 'Bracer', 'Projectile speed up by 10%.', { stat: 'speed', add: 0.1 }),
  passive('candelabrador', 'Candelabrador', 'Weapon area up by 10%.', { stat: 'area', add: 0.1 }),
  passive('clover', 'Clover', 'Luck up by 10%.', { stat: 'luck', add: 0.1 }),
  passive('spellbinder', 'Spellbinder', 'Weapon effect duration up by 10%.', {
    stat: 'duration',
    add: 0.1,
  }),
  passive('spinach', 'Spinach', 'Damage up by 10%.', { stat: 'might', add: 0.1 }),
  passive('pummarola', 'Pummarola', 'Recovers 0.2 HP per second.', { stat: 'recovery', add: 0.2 }),
];
