import type { DrawableAssetId } from '../assets.js';

/** The base weapons of this phase. #13 adds the other six (ADR 0008). */
export type WeaponId = 'whip' | 'magicWand';

/** Selects the behaviour code for a weapon (ADR 0008): one module per pattern in the worker's `weapons/patterns/`. */
export type WeaponPattern =
  'whip' | 'magicWand' | 'knife' | 'axe' | 'cross' | 'kingBible' | 'fireWand' | 'garlic';

/** Full stats at one level; every level is spelled out, so tuning never needs code. */
export interface WeaponLevel {
  damage: number;
  cooldownSec: number;
  /** Scale multiplier on the weapon's hit area. */
  area: number;
  /** Projectile speed in world units per second; 0 for the Whip. */
  speed: number;
  /** Shots (or strikes) per cooldown. */
  amount: number;
  /** Projectile lifetime, or how long a strike stays visible, in seconds. */
  durationSec: number;
  /** Enemies a projectile can hit before it is removed; `Infinity` for the Whip. */
  pierce: number;
  /** Knockback impulse in world units per second. */
  knockback: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  pattern: WeaponPattern;
  /** The in-world strike or projectile art. */
  assetId: DrawableAssetId;
  /** The UI icon (#11). */
  iconId: DrawableAssetId;
  /** 8 for every base weapon. */
  maxLevel: number;
  /** Stats for L1..maxLevel; `levels.length === maxLevel`. */
  levels: readonly WeaponLevel[];
  /** Upgrade text shown when reaching L2..maxLevel (index 0 is L2), used by #11. */
  levelText: readonly string[];
}

/** The stats that differ per level, one array of 8 values each, as in the issue's tables. */
type LevelColumns = Record<
  'damage' | 'cooldownSec' | 'area' | 'amount' | 'pierce' | 'knockback',
  readonly number[]
>;

/** Builds the level rows from `columns` plus the stats every level shares. */
function levels(
  shared: Pick<WeaponLevel, 'speed' | 'durationSec'>,
  columns: LevelColumns,
): WeaponLevel[] {
  return columns.damage.map((damage, i) => ({
    ...shared,
    damage,
    cooldownSec: columns.cooldownSec[i] ?? NaN,
    area: columns.area[i] ?? NaN,
    amount: columns.amount[i] ?? NaN,
    pierce: columns.pierce[i] ?? NaN,
    knockback: columns.knockback[i] ?? NaN,
  }));
}

const eight = (value: number): number[] => Array.from({ length: 8 }, () => value);

/**
 * Initial values, untuned against footage (docs/reference/gameplay.md § Weapons): the owner deferred tuning, so these
 * are the issue's (#10) tables.
 */
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  whip: {
    id: 'whip',
    name: 'Whip',
    description: 'Attacks horizontally, passes through enemies.',
    pattern: 'whip',
    assetId: 'weapon.whip',
    iconId: 'icon.weapon.whip',
    maxLevel: 8,
    levels: levels(
      { speed: 0, durationSec: 0.15 },
      {
        damage: [10, 10, 15, 20, 25, 30, 35, 40],
        cooldownSec: eight(1.35),
        area: [1, 1, 1, 1.1, 1.1, 1.2, 1.2, 1.2],
        amount: [1, 2, 2, 2, 2, 2, 2, 2],
        pierce: eight(Infinity),
        knockback: eight(200),
      },
    ),
    levelText: [
      'Fires one more strike, behind you.',
      'Base damage up by 5.',
      'Base area up by 10%. Base damage up by 5.',
      'Base damage up by 5.',
      'Base area up by 10%. Base damage up by 5.',
      'Base damage up by 5.',
      'Base damage up by 5.',
    ],
  },
  magicWand: {
    id: 'magicWand',
    name: 'Magic Wand',
    description: 'Fires at the nearest enemy.',
    pattern: 'magicWand',
    assetId: 'weapon.magicWand',
    iconId: 'icon.weapon.magicWand',
    maxLevel: 8,
    levels: levels(
      { speed: 400, durationSec: 2 },
      {
        damage: [10, 10, 10, 10, 20, 20, 20, 30],
        cooldownSec: [1.2, 1.2, 1, 1, 1, 1, 1, 1],
        area: eight(1),
        amount: [1, 2, 2, 3, 3, 4, 4, 4],
        pierce: [1, 1, 1, 1, 1, 1, 2, 2],
        knockback: eight(100),
      },
    ),
    levelText: [
      'Fires one more projectile.',
      'Cooldown reduced by 0.2 seconds.',
      'Fires one more projectile.',
      'Base damage up by 10.',
      'Fires one more projectile.',
      'Passes through one more enemy.',
      'Base damage up by 10.',
    ],
  },
};

/** Fixed order of the base weapons, used by the `G` debug key and #11's choices. */
export const WEAPON_LIST: readonly WeaponId[] = ['whip', 'magicWand'];
