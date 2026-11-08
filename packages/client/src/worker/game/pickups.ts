import type { Scene } from '@thorvg/webcanvas';
import { INTERFERENCE, INTERFERENCE_RULES, PICKUPS, type Rng } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';

/**
 * Pickup columns (#16). `family` 0 is a light-source pickup (`defIdx` indexes `PICKUPS`), 1 an interference item (#21,
 * `defIdx` indexes `INTERFERENCE`).
 */
export const PICKUP_SCHEMA = {
  x: 'f32',
  y: 'f32',
  defIdx: 'u8',
  family: 'u8',
  ...RenderBinding.columns,
} as const;

export type PickupStore = Store<typeof PICKUP_SCHEMA>;

/** Live pickups at most; a drop beyond it is skipped. */
export const PICKUP_CAP = 32;
/** A pickup dropped by a light source (`PICKUPS`). */
export const PICKUP_FAMILY_LIGHT = 0;
/** A multiplayer interference item (#21); `defIdx` indexes `INTERFERENCE`. */
export const PICKUP_FAMILY_INTERFERENCE = 1;

export interface PickupState {
  pickups: PickupStore;
  /**
   * `null` when the world only simulates (unit tests). Pool `i` draws `PICKUPS[i].assetId`, then pool
   * `PICKUPS.length + k` draws `INTERFERENCE[k].assetId` (#21, `pickupPoolIndex`).
   */
  pickupBinding: RenderBinding<typeof PICKUP_SCHEMA> | null;
  /** `rng.fork('pickups')`: drop rolls only, so drops never shift the spawn stream. */
  readonly pickupRng: Rng;
}

/**
 * One pool per `PICKUPS` entry in the `pickups` layer, prewarmed to `PICKUP_CAP`, then one per `INTERFERENCE` entry
 * (#21), prewarmed to `INTERFERENCE_RULES.maxOnGround`. Created once by the game view.
 */
export function createPickupPools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return [
    ...PICKUPS.map((def) => new PaintPool(library, def.assetId, layer, PICKUP_CAP)),
    ...INTERFERENCE.map(
      (def) => new PaintPool(library, def.assetId, layer, INTERFERENCE_RULES.maxOnGround),
    ),
  ];
}

/** The pickup pool that draws `defIdx` of `family` (#21). */
export function pickupPoolIndex(family: number, defIdx: number): number {
  return family === PICKUP_FAMILY_INTERFERENCE ? PICKUPS.length + defIdx : defIdx;
}

export function createPickupState(rng: Rng, pools?: readonly PaintPool[]): PickupState {
  const pickups = createStore(PICKUP_SCHEMA, PICKUP_CAP);
  return {
    pickups,
    pickupBinding: pools ? new RenderBinding(pickups, pools) : null,
    pickupRng: rng.fork('pickups'),
  };
}

/** Drops pickup `defIdx` of `family` at (x, y). Returns the slot, or -1 when `PICKUP_CAP` pickups are live. */
export function spawnPickup(
  world: PickupState,
  family: number,
  defIdx: number,
  x: number,
  y: number,
): number {
  const slot = world.pickups.add();
  if (slot < 0) return -1;
  const { cols } = world.pickups;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.defIdx[slot] = defIdx;
  cols.family[slot] = family;
  world.pickupBinding?.bind(slot, pickupPoolIndex(family, defIdx));
  return slot;
}

/** The `pickups` snapshot field (test bridge, #16): each light-source pickup's ID and rounded position. */
export function readPickups(world: PickupState): { id: string; x: number; y: number }[] {
  const { count, cols } = world.pickups;
  const out: { id: string; x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (cols.family[i] !== PICKUP_FAMILY_LIGHT) continue;
    out.push({
      id: PICKUPS[cols.defIdx[i] ?? 0]?.id ?? '?',
      x: Math.round(cols.x[i] ?? 0),
      y: Math.round(cols.y[i] ?? 0),
    });
  }
  return out;
}

/** Debug offset of `spawnDebugPickup`, in world units to the right of the player. */
const DEBUG_PICKUP_OFFSET = 48;
let debugPickupNext = 0;

/**
 * The `K` debug key (#16, dev builds only): drops the next `PICKUPS` entry, cycling and ignoring `minPlayerLevel`,
 * `DEBUG_PICKUP_OFFSET` units right of the player. Collection is still driven by walking into it. Returns the pickup's
 * ID, or null when the store is full.
 */
export function spawnDebugPickup(
  world: PickupState & { player: { x: number; y: number } },
): string | null {
  const defIdx = debugPickupNext;
  const slot = spawnPickup(
    world,
    PICKUP_FAMILY_LIGHT,
    defIdx,
    world.player.x + DEBUG_PICKUP_OFFSET,
    world.player.y,
  );
  if (slot < 0) return null;
  debugPickupNext = (defIdx + 1) % PICKUPS.length;
  return PICKUPS[defIdx]?.id ?? null;
}
