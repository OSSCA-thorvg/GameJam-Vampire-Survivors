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
 * The stats with nothing owned. Factor stats (`might`, `area`, `cooldown`, `speed`, `duration`, `moveSpeed`,
 * `magnet`, `luck`, `growth`) sit around 1 and modifiers add to the factor; `cooldown` lower is faster. `amount`,
 * `armor` and `maxHp` are flat, and `recovery` is HP per second.
 */
export const BASE_STATS: Readonly<StatBlock> = Object.freeze({
  might: 1,
  area: 1,
  cooldown: 1,
  amount: 0,
  speed: 1,
  duration: 1,
  maxHp: BASE_MAX_HP,
  recovery: 0,
  armor: 0,
  moveSpeed: 1,
  magnet: 1,
  luck: 1,
  growth: 1,
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
