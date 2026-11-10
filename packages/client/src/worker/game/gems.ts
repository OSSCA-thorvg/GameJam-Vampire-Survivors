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
import type { ViewRect } from './camera';
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
 * Paints prewarmed per gem pool, in `GEM_ASSETS` order. Every tier covers `GEM_CAP`, and red one more for the merge
 * gem: past the cap the overflow keeps recycling old (mostly blue) gems into new green and red drops (#151), so no gem
 * pool ever grows mid-run (ADR 0003, #22).
 */
export const GEM_POOL_PREWARM = [GEM_CAP, GEM_CAP, GEM_CAP + 1] as const;

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
 * The slot of the idle normal gem (never the merge gem) farthest from (px, py), or -1 when every normal gem is flying.
 * A linear scan without allocation; `dropGem` runs it only past `GEM_CAP` (#151).
 */
export function farthestIdleGem(world: GemState, px: number, py: number): number {
  const { gems, mergeGemUid } = world;
  const { x, y, state } = gems.cols;
  let best = -1;
  let bestD2 = -1;
  for (let i = 0; i < gems.count; i++) {
    if (state[i] !== GEM_IDLE || gems.uid[i] === mergeGemUid) continue;
    const dx = (x[i] ?? 0) - px;
    const dy = (y[i] ?? 0) - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

/**
 * Gems farther than this beyond the view's edge are off screen for the overflow sweep (#151): a drop past `GEM_CAP`
 * folds all of them into the merge gem in one pass, so the next drops fit without another scan.
 */
export const GEM_SWEEP_MARGIN = 256;

/**
 * Folds the normal gem in `slot` into the merge gem: without one, the gem becomes the merge gem in place (tier red, its
 * paint rebound to the red pool); otherwise its value is added to the merge gem and the slot is swap-removed (the merge
 * gem may move, `mergeGemUid` keeps tracking it). Never creates a paint beyond the red pool's prewarm.
 */
function foldIntoMerge(world: GemState, slot: number): void {
  const { gems } = world;
  const merge = gems.indexOf(world.mergeGemUid);
  if (merge < 0) {
    gems.cols.tier[slot] = RED;
    world.gemBinding?.unbind(slot);
    world.gemBinding?.bind(slot, RED);
    world.mergeGemUid = gems.uid[slot] ?? NO_GEM;
    return;
  }
  gems.cols.value[merge] = (gems.cols.value[merge] ?? 0) + (gems.cols.value[slot] ?? 0);
  world.gemBinding?.unbind(slot);
  gems.remove(slot);
}

/**
 * Folds every idle normal gem outside `keep` into the merge gem in one backward pass (swap-remove only moves gems
 * already visited) and returns how many normal gems it freed. No allocation.
 */
export function sweepOffscreenGems(world: GemState, keep: ViewRect): number {
  const { gems } = world;
  const { x, y, state } = gems.cols;
  let freed = 0;
  for (let i = gems.count - 1; i >= 0; i--) {
    if (state[i] !== GEM_IDLE || gems.uid[i] === world.mergeGemUid) continue;
    const gx = x[i] ?? 0;
    const gy = y[i] ?? 0;
    if (gx >= keep.left && gx <= keep.right && gy >= keep.top && gy <= keep.bottom) continue;
    foldIntoMerge(world, i);
    freed++;
  }
  return freed;
}

/**
 * Drops a gem worth `value` XP at (x, y), the player standing at (px, py) with `keep` the on-screen area
 * (`camera.viewRect(GEM_SWEEP_MARGIN)`). Below `GEM_CAP` normal gems it is a new gem of its tier. Beyond, room is made
 * so the new gem still lands at (x, y) (#151): one pass folds every idle gem outside `keep` into the merge gem (always
 * red; the first such gem becomes it in place when none exists), which leaves room for many later drops; only when that
 * pass frees nothing is the single idle gem farthest from the player folded in. When every gem is flying, the value is
 * added to the merge gem, created here at this drop's position when none exists. No value is ever lost, and no paint
 * is created beyond the pools' prewarm.
 */
export function dropGem(
  world: GemState,
  x: number,
  y: number,
  value: number,
  px: number,
  py: number,
  keep: ViewRect,
): void {
  if (value <= 0) return;
  const { gems } = world;
  const merge = gems.indexOf(world.mergeGemUid);
  const normal = gems.count - (merge >= 0 ? 1 : 0);
  const tier = TIER_INDEX[gemTier(value)];
  if (normal < GEM_CAP) {
    addGem(world, x, y, value, tier);
    return;
  }
  if (sweepOffscreenGems(world, keep) === 0) {
    const far = farthestIdleGem(world, px, py);
    if (far < 0) {
      if (merge >= 0) {
        gems.cols.value[merge] = (gems.cols.value[merge] ?? 0) + value;
        return;
      }
      const slot = addGem(world, x, y, value, RED);
      world.mergeGemUid = slot >= 0 ? (gems.uid[slot] ?? NO_GEM) : NO_GEM;
      return;
    }
    foldIntoMerge(world, far);
  }
  addGem(world, x, y, value, tier);
}

/**
 * Inserted right after `cleanupSystem`: one gem per `enemyKilled` event of this step, worth the enemy's `xp`. The
 * overflow sweep keeps gems within `GEM_SWEEP_MARGIN` of the view.
 */
export function gemDropSystem(world: World): void {
  const { items, count } = world.events;
  const keep = world.camera.viewRect(GEM_SWEEP_MARGIN);
  for (let i = 0; i < count; i++) {
    const event = items[i];
    if (event?.kind === 'enemyKilled')
      dropGem(world, event.x, event.y, event.xp, world.player.x, world.player.y, keep);
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
