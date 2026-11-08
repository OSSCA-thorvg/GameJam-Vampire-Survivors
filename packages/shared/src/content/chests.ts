import type { WeaponId } from './weapons.js';

/**
 * A chest offers an evolution only from this run time on (ADR 0008, user decision 2026-11-07): 5:00 for the 15-minute
 * run; the original uses 10:00.
 */
export const EVOLUTION_MIN_TIME_S = 300;
/** Chance of 5 and of 3 rewards, each multiplied by luck; otherwise 1 (initial values, untuned). */
export const CHEST_ODDS = { five: 0.03, three: 0.17 } as const;
/** HP healed by the fallback reward when nothing can be levelled; never gold (REQUIREMENTS #8). */
export const CHEST_HEAL = 30;
/** Elites (#15): HP and contact damage multipliers, and the size of the art and collision circle (initial values). */
export const ELITE = { hp: 10, damage: 1.5, scale: 1.5 } as const;

/** One reward of a chest. There is no gold kind (REQUIREMENTS #8, ADR 0008). */
export type ChestReward =
  | { kind: 'levelUp'; itemKind: 'weapon' | 'passive'; id: string; newLevel: number }
  | { kind: 'evolve'; fromWeaponId: WeaponId; intoWeaponId: WeaponId }
  | { kind: 'heal'; amount: number };

/** Every `ChestReward` kind; a test checks it against the type, so a new kind is a deliberate change. */
export const CHEST_REWARD_KINDS = [
  'levelUp',
  'evolve',
  'heal',
] as const satisfies readonly ChestReward['kind'][];
