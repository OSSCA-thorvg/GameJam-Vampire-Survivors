import type { DrawableAssetId } from '../assets.js';
import type { InterferenceKind } from '../protocol.js';

/** What an interference does in the target's world (#21, ADR 0005). */
export type InterferenceEffect =
  /** `count` enemies evenly on a circle of `ringRadiusFactor` × half the view diagonal around the player. */
  | { type: 'spawnPack'; count: number; ringRadiusFactor: number }
  /** Removes every gem lying in the world; XP and level are untouched. */
  | { type: 'clearGems' }
  /** One elite `distance` units from the player, in a random direction. */
  | { type: 'spawnElite'; distance: number };

export interface InterferenceDef {
  kind: InterferenceKind;
  /** `pickup.interference.<kind>`. */
  assetId: DrawableAssetId;
  /** Shown on the sender's toast (ThorVG, printable ASCII only) and the target's banner. */
  label: string;
  /** Relative drop weight. */
  weight: number;
  effect: InterferenceEffect;
}

/**
 * The three interference items of ADR 0005, in `INTERFERENCE_KINDS` order; the index is the pickup's `defIdx`. Swarm
 * and Elite Call use the current wave's highest-weight enemy in the target's world. Initial values, tune in
 * playtests (untuned: the owner decided not to tune against the original).
 */
export const INTERFERENCE: readonly InterferenceDef[] = [
  {
    kind: 'swarm',
    assetId: 'pickup.interference.swarm',
    label: 'Swarm',
    weight: 3,
    effect: { type: 'spawnPack', count: 30, ringRadiusFactor: 1.1 },
  },
  {
    kind: 'gemThief',
    assetId: 'pickup.interference.gemThief',
    label: 'Gem Thief',
    weight: 2,
    effect: { type: 'clearGems' },
  },
  {
    kind: 'eliteCall',
    assetId: 'pickup.interference.eliteCall',
    label: 'Elite Call',
    weight: 2,
    effect: { type: 'spawnElite', distance: 400 },
  },
];

/**
 * When an enemy kill in a versus world drops an interference pickup (#21): only after `notBeforeS` of simulated time,
 * at least `minIntervalS` after the previous drop, and while fewer than `maxOnGround` lie in the world; elites roll
 * `eliteDropChance`, other kills `dropChancePerKill`. Initial values, tune in playtests (untuned).
 */
export const INTERFERENCE_RULES = {
  dropChancePerKill: 0.004,
  eliteDropChance: 0.25,
  minIntervalS: 20,
  maxOnGround: 2,
  notBeforeS: 60,
} as const;

/**
 * The server's cap on `interference` messages per player per match (#21, the thread of #18): a token bucket that
 * starts full. Honest play collects at most the `maxOnGround` pickups lying in the world plus one dropped meanwhile in
 * a burst, then one per `minIntervalS`; one token more absorbs network jitter. Excess messages are dropped.
 */
export const INTERFERENCE_SEND_LIMIT = {
  burst: INTERFERENCE_RULES.maxOnGround + 2,
  perSecond: 1 / INTERFERENCE_RULES.minIntervalS,
} as const;

/** The index of `kind` in `INTERFERENCE`, or -1 for anything outside `INTERFERENCE_KINDS`. */
export function interferenceIndex(kind: string): number {
  return INTERFERENCE.findIndex((d) => d.kind === kind);
}
