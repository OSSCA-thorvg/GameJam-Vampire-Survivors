import type { Scene } from '@thorvg/webcanvas';
import type { DrawableAssetId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';

/** Short-lived visuals (#10): whip strikes, hit flashes and death puffs. */
export const FX_SCHEMA = {
  x: 'f32',
  y: 'f32',
  /** Degrees. */
  rot: 'f32',
  scale: 'f32',
  ttl: 'f32',
  flip: 'u8',
  ...RenderBinding.columns,
} as const;

export type FxStore = Store<typeof FX_SCHEMA>;

/** Live effects at most (initial value); a spawn beyond it is skipped. */
export const FX_CAP = 64;

/** The effect art, in pool order: `poolId` indexes this list. Append only. */
export const FX_ASSETS = [
  'weapon.whip',
  'fx.hit',
  'fx.enemyDeath',
  'fx.levelUp',
  // #15: the evolved whip arc and the chest-opening burst.
  'weapon.bloodyTear',
  'fx.chestOpen',
] as const satisfies readonly DrawableAssetId[];
export type FxAssetId = (typeof FX_ASSETS)[number];

export interface FxState {
  fx: FxStore;
  /** `null` when the world only simulates (unit tests). Pool `i` draws `FX_ASSETS[i]`. */
  fxBinding: RenderBinding<typeof FX_SCHEMA> | null;
}

/**
 * Paints prewarmed for `fx.levelUp` (#11): a Lottie instance, ticked every step, shown about once per level, so it
 * gets a small pool instead of `FX_CAP`; 4 covers back-to-back level-ups from one big gem (#22).
 */
export const LEVEL_UP_FX_PREWARM = 4;
/** The same for the effects of #15: the Bloody Tear arc (two strikes at most live) and the `fx.chestOpen` Lottie. */
export const BLOODY_TEAR_FX_PREWARM = 4;
export const CHEST_OPEN_FX_PREWARM = 2;

const FX_PREWARM: Readonly<Partial<Record<FxAssetId, number>>> = {
  'fx.levelUp': LEVEL_UP_FX_PREWARM,
  'weapon.bloodyTear': BLOODY_TEAR_FX_PREWARM,
  'fx.chestOpen': CHEST_OPEN_FX_PREWARM,
};

/**
 * One pool per effect asset, each prewarmed to `FX_CAP` (the rare ones to their `*_FX_PREWARM`), so no ordinary spawn
 * grows a pool during a run. Created once per worker by the game view and reused by every run (#9).
 */
export function createFxPools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return FX_ASSETS.map((id) => new PaintPool(library, id, layer, FX_PREWARM[id] ?? FX_CAP));
}

export function createFxState(pools?: readonly PaintPool[]): FxState {
  const fx = createStore(FX_SCHEMA, FX_CAP);
  return { fx, fxBinding: pools ? new RenderBinding(fx, pools) : null };
}

/** Shows `assetId` at (x, y) for `ttl` seconds. Returns the slot, or -1 when `FX_CAP` effects are live (skipped). */
export function spawnFx(
  world: FxState,
  assetId: FxAssetId,
  x: number,
  y: number,
  rotationDeg: number,
  flipX: boolean,
  ttl: number,
  scale = 1,
): number {
  const slot = world.fx.add();
  if (slot < 0) return -1;
  const { cols } = world.fx;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.rot[slot] = rotationDeg;
  cols.scale[slot] = scale;
  cols.ttl[slot] = ttl;
  cols.flip[slot] = flipX ? 1 : 0;
  world.fxBinding?.bind(slot, FX_ASSETS.indexOf(assetId), ttl);
  return slot;
}

/** Counts every effect down and removes the expired ones, iterating backwards. */
export function fxSystem(world: FxState, dt: number): void {
  const { fx, fxBinding } = world;
  const { ttl } = fx.cols;
  for (let i = fx.count - 1; i >= 0; i--) {
    const left = (ttl[i] ?? 0) - dt;
    ttl[i] = left;
    if (left > 0) continue;
    fxBinding?.unbind(i);
    fx.remove(i);
  }
}
