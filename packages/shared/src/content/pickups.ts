import type { DrawableAssetId } from '../assets.js';
import type { StatId } from './stats.js';

/** What collecting a pickup does (#16, ADR 0008). Nothing here involves gold. */
export type PickupEffect =
  | { kind: 'heal'; amount: number }
  /** Kills every non-boss enemy inside the camera rect. */
  | { kind: 'clearScreen' }
  /** Freezes every enemy for `seconds`. */
  | { kind: 'freeze'; seconds: number }
  /** Pulls every gem on the map at that moment. */
  | { kind: 'vacuum' }
  /** Permanent for the run (`player.runModifiers`). */
  | { kind: 'stat'; stat: StatId; add: number };

export interface PickupDef {
  id: string;
  displayName: string;
  assetId: DrawableAssetId;
  effect: PickupEffect;
  /** Relative drop weight from light sources. */
  weight: number;
  /** When true, the drop weight is `weight × stats.luck`. */
  luckAffected: boolean;
  /** Not dropped by light sources before this player level (Namu Wiki §7.3). */
  minPlayerLevel: number;
}

/**
 * The five pickups of ADR 0008, in the order the `K` debug key cycles. Effects from Namu Wiki §7.3; weights and level
 * gates are initial values, tune against footage (untuned: the owner deferred tuning). The level gates of Vacuum and
 * Little Clover are **[unverified]**.
 */
export const PICKUPS: readonly PickupDef[] = [
  {
    id: 'floorChicken',
    displayName: 'Floor Chicken',
    assetId: 'pickup.floorChicken',
    effect: { kind: 'heal', amount: 30 },
    weight: 10,
    luckAffected: true,
    minPlayerLevel: 1,
  },
  {
    id: 'rosary',
    displayName: 'Rosary',
    assetId: 'pickup.rosary',
    effect: { kind: 'clearScreen' },
    weight: 1,
    luckAffected: true,
    minPlayerLevel: 8,
  },
  {
    id: 'orologion',
    displayName: 'Orologion',
    assetId: 'pickup.orologion',
    effect: { kind: 'freeze', seconds: 10 },
    weight: 2,
    luckAffected: true,
    minPlayerLevel: 4,
  },
  {
    id: 'vacuum',
    displayName: 'Vacuum',
    assetId: 'pickup.vacuum',
    effect: { kind: 'vacuum' },
    weight: 2,
    luckAffected: true,
    minPlayerLevel: 1,
  },
  {
    id: 'littleClover',
    displayName: 'Little Clover',
    assetId: 'pickup.littleClover',
    effect: { kind: 'stat', stat: 'luck', add: 0.1 },
    weight: 3,
    luckAffected: false,
    minPlayerLevel: 1,
  },
];

/**
 * Breakable light sources (#16). Distances are in view widths from the player. Initial values, tune against footage
 * (untuned).
 */
export const LIGHT_SOURCE = {
  /** Intact lights kept around the player. */
  targetCount: 6,
  spawnRingMin: 1.0,
  spawnRingMax: 2.0,
  /** Lights farther than this are recycled. */
  despawnDistance: 3,
  hp: 1,
  /** Chance that a broken light drops a pickup. */
  dropChance: 1.0,
  respawnCheckIntervalS: 2,
  /** Store capacity: intact plus broken lights. */
  poolSize: 16,
} as const;

/** World units; a pickup is collected within this plus `PLAYER_RADIUS` (initial value). */
export const PICKUP_COLLECT_RADIUS = 16;
