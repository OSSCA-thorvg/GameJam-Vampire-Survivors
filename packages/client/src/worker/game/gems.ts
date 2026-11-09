import type { Scene } from '@thorvg/webcanvas';
import {
  BASE_PICKUP_RANGE,
  GEM_CAP,
  GEM_COLLECT_RADIUS,
  GEM_FLY_ACCEL,
  GEM_FLY_START_SPEED,
  gemTier,
  type DrawableAssetId,
} from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createSpatialGrid, type SpatialGrid } from '../ecs/spatial-grid';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';
import type { PlayerState } from './player';
import { cueSfx, type SfxState } from './sfx';
import type { World } from './world';

/** Experience gem columns (#11). `state` 0 is idle on the ground, 1 is flying to the player; `tier` indexes `GEM_ASSETS`. */
export const GEM_SCHEMA = {
  x: 'f32',
  y: 'f32',
  vx: 'f32',
  vy: 'f32',
  value: 'f32',
  state: 'u8',
  tier: 'u8',
  ...RenderBinding.columns,
} as const;

export type GemStore = Store<typeof GEM_SCHEMA>;

export const GEM_IDLE = 0;
export const GEM_FLYING = 1;

/** The gem art by tier (`gemTier`): pool `i` draws `GEM_ASSETS[i]`. */
export const GEM_ASSETS = [
  'gem.blue',
  'gem.green',
  'gem.red',
] as const satisfies readonly DrawableAssetId[];
const TIER_INDEX = { blue: 0, green: 1, red: 2 } as const;
const RED = TIER_INDEX.red;

/**
 * Paints prewarmed per gem pool, in `GEM_ASSETS` order. Blue covers `GEM_CAP` (#22: a screen full of the commonest gem
 * never grows the pool mid-run); green and red stay rare.
 */
export const GEM_POOL_PREWARM = [GEM_CAP, 50, 50] as const;

/** Store slots: `GEM_CAP` normal gems plus the one reserved for the merge gem. */
export const GEM_STORE_CAPACITY = GEM_CAP + 1;

/** No merge gem: store UIDs are unsigned, so this never matches one. */
export const NO_GEM = -1;

export interface GemState {
  gems: GemStore;
  /** Rebuilt from gem positions every step by `gemSystem`. */
  gemGrid: SpatialGrid;
  /** `null` when the world only simulates (unit tests). */
  gemBinding: RenderBinding<typeof GEM_SCHEMA> | null;
  /** UID of the red gem that absorbs drops beyond `GEM_CAP`, or `NO_GEM`. */
  mergeGemUid: number;
}

/** One pool per gem tier in the `pickups` layer. Created once per worker by the game view and reused by every run (#9). */
export function createGemPools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return GEM_ASSETS.map((id, i) => new PaintPool(library, id, layer, GEM_POOL_PREWARM[i] ?? 0));
}

/**
 * `capacity` normal gems plus the merge gem's slot. `capacity` is `GEM_CAP` except in #22's `gems-flood` stress
 * scenario, which floods the store past the cap with `addGem`; `dropGem` still merges beyond `GEM_CAP`.
 */
export function createGemState(pools?: readonly PaintPool[], capacity: number = GEM_CAP): GemState {
  const gems = createStore(GEM_SCHEMA, capacity + 1);
  return {
    gems,
    // Cells of 64 units cover the 60-unit magnet query in at most 9 cells.
    gemGrid: createSpatialGrid({ cellSize: 64, buckets: 1024, maxItems: capacity + 1 }),
    gemBinding: pools ? new RenderBinding(gems, pools) : null,
    mergeGemUid: NO_GEM,
  };
}

/** Adds a gem of `tier` (an index into `GEM_ASSETS`) without the merge rule; `dropGem` and #22's `gems-flood` use it. */
export function addGem(world: GemState, x: number, y: number, value: number, tier: number): number {
  const slot = world.gems.add();
  if (slot < 0) return -1;
  const { cols } = world.gems;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.value[slot] = value;
  cols.tier[slot] = tier;
  world.gemBinding?.bind(slot, tier);
  return slot;
}

/**
 * Drops a gem worth `value` XP at (x, y). Below `GEM_CAP` normal gems it is a new gem of its tier; beyond, the value is
 * added to the merge gem (always red), which is created here at this drop's position when none exists. No value is
 * ever lost.
 */
export function dropGem(world: GemState, x: number, y: number, value: number): void {
  if (value <= 0) return;
  const { gems } = world;
  const merge = gems.indexOf(world.mergeGemUid);
  const normal = gems.count - (merge >= 0 ? 1 : 0);
  if (normal < GEM_CAP) {
    addGem(world, x, y, value, TIER_INDEX[gemTier(value)]);
    return;
  }
  if (merge >= 0) {
    gems.cols.value[merge] = (gems.cols.value[merge] ?? 0) + value;
    return;
  }
  const slot = addGem(world, x, y, value, RED);
  world.mergeGemUid = slot >= 0 ? (gems.uid[slot] ?? NO_GEM) : NO_GEM;
}

/** Inserted right after `cleanupSystem`: one gem per `enemyKilled` event of this step, worth the enemy's `xp`. */
export function gemDropSystem(world: World): void {
  const { items, count } = world.events;
  for (let i = 0; i < count; i++) {
    const event = items[i];
    if (event?.kind === 'enemyKilled') dropGem(world, event.x, event.y, event.xp);
  }
}

/** Gems read per magnet query; every gem fits. */
const nearby = new Int32Array(GEM_STORE_CAPACITY);

/**
 * The magnet and collection (#11), after `gemDropSystem`: gems within `BASE_PICKUP_RANGE * stats.magnet` start flying
 * at `GEM_FLY_START_SPEED` and accelerate by `GEM_FLY_ACCEL` toward the player's current position; one that reaches
 * `GEM_COLLECT_RADIUS` adds `value * stats.growth` to `player.xp` and is removed. Idle gems never despawn.
 */
export function gemSystem(world: GemState & SfxState & { player: PlayerState }, dt: number): void {
  const { gems, gemGrid, gemBinding, player } = world;
  const { x, y, vx, vy, value, state } = gems.cols;
  gemGrid.rebuild(x, y, gems.count);
  const found = gemGrid.query(player.x, player.y, BASE_PICKUP_RANGE * player.stats.magnet, nearby);
  for (let n = 0; n < found; n++) {
    const g = nearby[n] ?? 0;
    if (state[g] !== GEM_IDLE) continue;
    state[g] = GEM_FLYING;
    const dx = player.x - (x[g] ?? 0);
    const dy = player.y - (y[g] ?? 0);
    const d = Math.hypot(dx, dy) || 1;
    vx[g] = (dx / d) * GEM_FLY_START_SPEED;
    vy[g] = (dy / d) * GEM_FLY_START_SPEED;
  }
  for (let i = gems.count - 1; i >= 0; i--) {
    if (state[i] !== GEM_FLYING) continue;
    const dx = player.x - (x[i] ?? 0);
    const dy = player.y - (y[i] ?? 0);
    const d = Math.hypot(dx, dy);
    const speed = Math.hypot(vx[i] ?? 0, vy[i] ?? 0) + GEM_FLY_ACCEL * dt;
    const move = speed * dt;
    if (d - move > GEM_COLLECT_RADIUS) {
      vx[i] = (dx / d) * speed;
      vy[i] = (dy / d) * speed;
      x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
      y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
      continue;
    }
    player.xp += (value[i] ?? 0) * player.stats.growth;
    cueSfx(world, 'sfx.gemPickup');
    if (gems.uid[i] === world.mergeGemUid) world.mergeGemUid = NO_GEM;
    gemBinding?.unbind(i);
    gems.remove(i);
  }
}
