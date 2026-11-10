import { BASE_MAX_HP } from './constants.js';

/** The player's stats (#12). Every system reads them from `player.stats`; nothing keeps its own multiplier. */
export type StatId =
  | 'might'
  | 'area'
  | 'cooldown'
  | 'amount'
  | 'speed'
  | 'duration'
  | 'maxHp'
  | 'recovery'
  | 'armor'
  | 'moveSpeed'
  | 'magnet'
  | 'luck'
  | 'growth';

export type StatBlock = Record<StatId, number>;

/** One additive change to a stat; a passive applies its modifiers once per level owned. */
export interface StatModifier {
  stat: StatId;
  add: number;
}

/**
 * The stats with nothing owned. This game has no gold or meta progression (ADR 0008), so these carry a fixed built-in
 * equivalent of the original's permanent PowerUps, about a third of their maximum ranks (#148): `might` 1.1, `armor` 1,
 * `maxHp` `BASE_MAX_HP` 120, `recovery` 0.2, `cooldown` 0.95, `magnet` 1.25, `growth` 1.1 (initial values, tuned for
 * playability, not a footage match). Factor stats (`might`, `area`, `cooldown`, `speed`, `duration`, `moveSpeed`,
 * `magnet`, `luck`, `growth`) sit around 1 and modifiers add to the factor; `cooldown` lower is faster. `amount`,
 * `armor` and `maxHp` are flat, and `recovery` is HP per second.
 */
export const BASE_STATS: Readonly<StatBlock> = Object.freeze({
  might: 1.1,
  area: 1,
  cooldown: 0.95,
  amount: 0,
  speed: 1,
  duration: 1,
  maxHp: BASE_MAX_HP,
  recovery: 0.2,
  armor: 1,
  moveSpeed: 1,
  magnet: 1.25,
  luck: 1,
  growth: 1.1,
});

/** Every `StatId`, in `BASE_STATS` order. */
export const STAT_IDS = Object.keys(BASE_STATS) as readonly StatId[];

/** The shortest cooldown any weapon can reach, in seconds. */
export const MIN_COOLDOWN_SEC = 0.05;

export const effDamage = (base: number, s: Readonly<StatBlock>): number => base * s.might;
export const effArea = (base: number, s: Readonly<StatBlock>): number => base * s.area;
export const effCooldown = (base: number, s: Readonly<StatBlock>): number =>
  Math.max(MIN_COOLDOWN_SEC, base * s.cooldown);
export const effAmount = (base: number, s: Readonly<StatBlock>): number => base + s.amount;
export const effSpeed = (base: number, s: Readonly<StatBlock>): number => base * s.speed;
export const effDuration = (base: number, s: Readonly<StatBlock>): number => base * s.duration;

/** The stat names shown in the UI (#14's character cards). */
export const STAT_LABELS: Readonly<Record<StatId, string>> = Object.freeze({
  might: 'Might',
  area: 'Area',
  cooldown: 'Cooldown',
  amount: 'Amount',
  speed: 'Projectile speed',
  duration: 'Duration',
  maxHp: 'Max HP',
  recovery: 'Recovery',
  armor: 'Armor',
  moveSpeed: 'Move speed',
  magnet: 'Magnet',
  luck: 'Luck',
  growth: 'Growth',
});

/** Stats whose modifiers add a flat number; the others add to a factor around 1 and read as percents. */
const FLAT_STATS: ReadonlySet<StatId> = new Set<StatId>(['amount', 'armor', 'maxHp', 'recovery']);

/**
 * A modifier as UI text: flat stats as signed numbers ("+20 Max HP"), factor stats as signed percents
 * ("−5% Move speed"). Negative values use the minus sign U+2212.
 */
export function formatModifier({ stat, add }: StatModifier): string {
  const value = FLAT_STATS.has(stat) ? Number(add.toFixed(2)) : Math.round(add * 100);
  const sign = value < 0 ? '\u2212' : '+';
  return `${sign}${String(Math.abs(value))}${FLAT_STATS.has(stat) ? '' : '%'} ${STAT_LABELS[stat]}`;
}
