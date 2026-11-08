import type { DrawableAssetId } from '../assets.js';

/** The 8 base weapons (ADR 0008). */
export type BaseWeaponId =
  'whip' | 'magicWand' | 'knife' | 'axe' | 'cross' | 'kingBible' | 'fireWand' | 'garlic';
/** Their evolutions (#15, ADR 0008): granted only by a chest, never offered on a level-up. */
export type EvolvedWeaponId =
  | 'bloodyTear'
  | 'holyWand'
  | 'thousandEdge'
  | 'deathSpiral'
  | 'heavenSword'
  | 'unholyVespers'
  | 'hellfire'
  | 'soulEater';
export type WeaponId = BaseWeaponId | EvolvedWeaponId;

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
  /** Seconds between hits of this weapon on the same enemy (King Bible, #13). */
  hitCooldown?: number;
  /** Downward acceleration in units/s² (Axe, #13). */
  gravity?: number;
  /** Seconds until the projectile turns back (Cross, #13). */
  returnAfter?: number;
  /** Orbit radius in world units before `area` (King Bible, #13). */
  orbitRadius?: number;
  /** Seconds between the shots of one burst; the weapon system's `BURST_GAP_SEC` (0.1) when absent (#13). */
  burstIntervalSec?: number;
  /** Heal 1 HP (capped at max HP) on every Nth enemy hit of this weapon (Bloody Tear, Soul Eater; #15). */
  healEveryHits?: number;
  /** Chance per hit, drawn from the weapon stream, to multiply the damage by `critMultiplier` (Heaven Sword; #15). */
  critChance?: number;
  critMultiplier?: number;
  /** Fire `amount` projectiles evenly around the player instead of in an arc (Death Spiral; #15). */
  radial?: true;
  /** An orbit with no off-time (Unholy Vespers; #15). */
  permanent?: true;
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
  /** 8 for every base weapon, 1 for an evolved one. */
  maxLevel: number;
  /** Stats for L1..maxLevel; `levels.length === maxLevel`. */
  levels: readonly WeaponLevel[];
  /** Upgrade text shown when reaching L2..maxLevel (index 0 is L2), used by #11; empty for an evolved weapon. */
  levelText: readonly string[];
  /** An evolution (#15): in `WEAPONS` but not in `WEAPON_LIST`, so no level-up or `G` key ever offers it. */
  evolved?: true;
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

/** The numeric stats a level step may change. */
type LevelStat = {
  [K in keyof WeaponLevel]-?: NonNullable<WeaponLevel[K]> extends number ? K : never;
}[keyof WeaponLevel];
/**
 * One level's change from the previous level: `add` is flat, `pct` is a fraction of the L1 value (0.25 is +25% of
 * L1), so two +25% steps give 1.5× L1.
 */
interface LevelStep {
  add?: Partial<Record<LevelStat, number>>;
  pct?: Partial<Record<LevelStat, number>>;
}

/** The fields a level row has when the issue table does not list them. */
const UNLISTED: Pick<
  WeaponLevel,
  'area' | 'speed' | 'amount' | 'pierce' | 'durationSec' | 'knockback'
> = { area: 1, speed: 0, amount: 1, pierce: 1, durationSec: 0, knockback: 0 };

/** Rounds away float drift from summing steps (1.3 - 0.1 - 0.1 is 1.1, not 1.1000000000000003). */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Expands L1 plus one `LevelStep` per level 2..8 into the full level rows (#13). */
function steps(
  l1: Partial<WeaponLevel> & Pick<WeaponLevel, 'damage' | 'cooldownSec'>,
  changes: readonly LevelStep[],
): WeaponLevel[] {
  const first: WeaponLevel = { ...UNLISTED, ...l1 };
  const rows = [first];
  let current = first;
  for (const { add = {}, pct = {} } of changes) {
    const next: WeaponLevel = { ...current };
    for (const [stat, value] of Object.entries(add) as [LevelStat, number][])
      next[stat] = tidy((current[stat] ?? 0) + value);
    for (const [stat, value] of Object.entries(pct) as [LevelStat, number][])
      next[stat] = tidy((current[stat] ?? 0) + (first[stat] ?? 0) * value);
    rows.push(next);
    current = next;
  }
  return rows;
}

/**
 * Initial values, untuned against footage (docs/reference/gameplay.md § Weapons): the owner deferred tuning, so these
 * are the issue tables of #10 (Whip, Magic Wand) and #13 (the other six).
 */
const BASE_WEAPONS: Readonly<Record<BaseWeaponId, WeaponDef>> = {
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
  knife: {
    id: 'knife',
    name: 'Knife',
    description: 'Fires quickly in the faced direction.',
    pattern: 'knife',
    assetId: 'weapon.knife',
    iconId: 'icon.weapon.knife',
    maxLevel: 8,
    levels: steps(
      {
        damage: 6.5,
        cooldownSec: 1,
        amount: 1,
        speed: 500,
        pierce: 1,
        durationSec: 2,
        knockback: 50,
        burstIntervalSec: 0.05,
      },
      [
        { add: { amount: 1 } },
        { add: { damage: 5 } },
        { add: { amount: 1 } },
        { add: { amount: 1, pierce: 1 } },
        { add: { amount: 1 } },
        { add: { damage: 5 } },
        { add: { amount: 1, pierce: 1 } },
      ],
    ),
    levelText: [
      'Fires one more projectile.',
      'Base damage up by 5.',
      'Fires one more projectile.',
      'Fires one more projectile. Passes through one more enemy.',
      'Fires one more projectile.',
      'Base damage up by 5.',
      'Fires one more projectile. Passes through one more enemy.',
    ],
  },
  axe: {
    id: 'axe',
    name: 'Axe',
    description: 'High damage, high area scaling.',
    pattern: 'axe',
    assetId: 'weapon.axe',
    iconId: 'icon.weapon.axe',
    maxLevel: 8,
    levels: steps(
      { damage: 20, cooldownSec: 4, amount: 1, pierce: 3, durationSec: 3, gravity: 900 },
      [
        { add: { amount: 1 } },
        { add: { damage: 20 } },
        { add: { pierce: 2 } },
        { add: { amount: 1 } },
        { add: { damage: 20 } },
        { add: { pierce: 2 } },
        { add: { damage: 20 } },
      ],
    ),
    levelText: [
      'Fires one more projectile.',
      'Base damage up by 20.',
      'Passes through 2 more enemies.',
      'Fires one more projectile.',
      'Base damage up by 20.',
      'Passes through 2 more enemies.',
      'Base damage up by 20.',
    ],
  },
  cross: {
    id: 'cross',
    name: 'Cross',
    description: 'Aims at the nearest enemy, has a boomerang effect.',
    pattern: 'cross',
    assetId: 'weapon.cross',
    iconId: 'icon.weapon.cross',
    maxLevel: 8,
    levels: steps(
      {
        damage: 50,
        cooldownSec: 2,
        amount: 1,
        speed: 400,
        pierce: Infinity,
        returnAfter: 0.6,
        durationSec: 4,
        knockback: 50,
      },
      [
        { add: { damage: 10 } },
        { pct: { area: 0.1 } },
        { pct: { speed: 0.25 } },
        { add: { amount: 1 } },
        { add: { damage: 10 } },
        { pct: { area: 0.1 } },
        { pct: { speed: 0.25 } },
      ],
    ),
    levelText: [
      'Base damage up by 10.',
      'Base area up by 10%.',
      'Base speed up by 25%.',
      'Fires one more projectile.',
      'Base damage up by 10.',
      'Base area up by 10%.',
      'Base speed up by 25%.',
    ],
  },
  kingBible: {
    id: 'kingBible',
    name: 'King Bible',
    description: 'Orbits around the character.',
    pattern: 'kingBible',
    assetId: 'weapon.kingBible',
    iconId: 'icon.weapon.kingBible',
    maxLevel: 8,
    levels: steps(
      {
        damage: 10,
        cooldownSec: 3,
        durationSec: 3,
        amount: 1,
        speed: 180,
        orbitRadius: 75,
        hitCooldown: 0.5,
        knockback: 100,
      },
      [
        { add: { amount: 1 } },
        { pct: { speed: 0.25, area: 0.25 } },
        { add: { durationSec: 0.5, damage: 10 } },
        { add: { amount: 1 } },
        { pct: { speed: 0.25, area: 0.25 } },
        { add: { durationSec: 0.5, damage: 10 } },
        { add: { amount: 1 } },
      ],
    ),
    levelText: [
      'Fires one more projectile.',
      'Base speed up by 25%. Base area up by 25%.',
      'Effect lasts 0.5 seconds longer. Base damage up by 10.',
      'Fires one more projectile.',
      'Base speed up by 25%. Base area up by 25%.',
      'Effect lasts 0.5 seconds longer. Base damage up by 10.',
      'Fires one more projectile.',
    ],
  },
  fireWand: {
    id: 'fireWand',
    name: 'Fire Wand',
    description: 'Fires at a random enemy, deals heavy damage.',
    pattern: 'fireWand',
    assetId: 'weapon.fireWand',
    iconId: 'icon.weapon.fireWand',
    maxLevel: 8,
    levels: steps(
      { damage: 20, cooldownSec: 3, amount: 3, speed: 375, pierce: 1, durationSec: 2 },
      [
        { add: { damage: 10 } },
        { add: { damage: 10 }, pct: { speed: 0.2 } },
        { add: { damage: 10 } },
        { add: { damage: 10 }, pct: { speed: 0.2 } },
        { add: { damage: 10 } },
        { add: { damage: 10 }, pct: { speed: 0.2 } },
        { add: { damage: 10 } },
      ],
    ),
    levelText: [
      'Base damage up by 10.',
      'Base damage up by 10. Base speed up by 20%.',
      'Base damage up by 10.',
      'Base damage up by 10. Base speed up by 20%.',
      'Base damage up by 10.',
      'Base damage up by 10. Base speed up by 20%.',
      'Base damage up by 10.',
    ],
  },
  garlic: {
    id: 'garlic',
    name: 'Garlic',
    description: 'Damages nearby enemies.',
    pattern: 'garlic',
    assetId: 'weapon.garlic',
    iconId: 'icon.weapon.garlic',
    maxLevel: 8,
    levels: steps({ damage: 5, cooldownSec: 1.3, area: 1, amount: 1, knockback: 100 }, [
      { pct: { area: 0.4 } },
      { add: { damage: 2 } },
      { add: { cooldownSec: -0.1 } },
      { pct: { area: 0.2 } },
      { add: { damage: 2 } },
      { add: { cooldownSec: -0.1 } },
      { pct: { area: 0.2 } },
    ]),
    levelText: [
      'Base area up by 40%.',
      'Base damage up by 2.',
      'Cooldown reduced by 0.1 seconds.',
      'Base area up by 20%.',
      'Base damage up by 2.',
      'Cooldown reduced by 0.1 seconds.',
      'Base area up by 20%.',
    ],
  },
};

/** The base weapon's level-8 stats with `change` applied: the one level of its evolution (#15). */
function evolveLevel(
  baseId: BaseWeaponId,
  change: (l8: Readonly<WeaponLevel>) => Partial<WeaponLevel>,
): WeaponLevel {
  const l8 = BASE_WEAPONS[baseId].levels[7];
  if (!l8) throw new Error(`Weapon '${baseId}' has no level 8`);
  return { ...l8, ...change(l8) };
}

function evolved(
  id: EvolvedWeaponId,
  baseId: BaseWeaponId,
  name: string,
  description: string,
  change: (l8: Readonly<WeaponLevel>) => Partial<WeaponLevel>,
): WeaponDef {
  return {
    id,
    name,
    description,
    pattern: BASE_WEAPONS[baseId].pattern,
    assetId: `weapon.${id}`,
    iconId: `icon.weapon.${id}`,
    maxLevel: 1,
    levels: [evolveLevel(baseId, change)],
    levelText: [],
    evolved: true,
  };
}

/**
 * Every weapon: the 8 base weapons and their 8 evolutions (#15). Evolutions copy their base's level 8 and change a few
 * fields: initial values, untuned against footage (docs/reference/gameplay.md § Level-up and evolution rules).
 */
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  ...BASE_WEAPONS,
  bloodyTear: evolved(
    'bloodyTear',
    'whip',
    'Bloody Tear',
    'Evolved Whip. Heals 1 HP every 10 hits.',
    (l) => ({ damage: l.damage * 2, healEveryHits: 10 }),
  ),
  holyWand: evolved(
    'holyWand',
    'magicWand',
    'Holy Wand',
    'Evolved Magic Wand. Fires with no delay.',
    () => ({
      cooldownSec: 0.1,
    }),
  ),
  thousandEdge: evolved(
    'thousandEdge',
    'knife',
    'Thousand Edge',
    'Evolved Knife. Fires with no delay.',
    () => ({ cooldownSec: 0.1, amount: 1 }),
  ),
  // `speed` is not in the issue's table: the axe's own speed is 0 because it is thrown and falls (initial value).
  deathSpiral: evolved(
    'deathSpiral',
    'axe',
    'Death Spiral',
    'Evolved Axe. Scythes fly out all around, through every enemy.',
    () => ({ amount: 9, radial: true, pierce: Infinity, speed: 300 }),
  ),
  heavenSword: evolved(
    'heavenSword',
    'cross',
    'Heaven Sword',
    'Evolved Cross. Can deal critical damage.',
    (l) => ({ damage: l.damage * 2, critChance: 0.2, critMultiplier: 2 }),
  ),
  unholyVespers: evolved(
    'unholyVespers',
    'kingBible',
    'Unholy Vespers',
    'Evolved King Bible. Never ends.',
    () => ({ permanent: true }),
  ),
  hellfire: evolved(
    'hellfire',
    'fireWand',
    'Hellfire',
    'Evolved Fire Wand. Passes through enemies.',
    (l) => ({ pierce: Infinity, area: l.area * 2 }),
  ),
  soulEater: evolved(
    'soulEater',
    'garlic',
    'Soul Eater',
    'Evolved Garlic. Heals 1 HP every 10 hits.',
    (l) => ({ area: l.area * 1.5, healEveryHits: 10 }),
  ),
};

/** Fixed order of the base weapons, used by the `G` debug key and #11's choices. Never lists an evolution (#15). */
export const WEAPON_LIST: readonly BaseWeaponId[] = [
  'whip',
  'magicWand',
  'knife',
  'axe',
  'cross',
  'kingBible',
  'fireWand',
  'garlic',
];
