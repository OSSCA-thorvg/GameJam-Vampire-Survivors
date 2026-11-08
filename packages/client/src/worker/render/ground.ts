import type { Scene } from '@thorvg/webcanvas';
import { ASSET_SIZES } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { PaintPool } from './pool';
import { setTransform } from './transform';

/** Tile size of `stage.ground` (128); `assets-catalog.test.ts` checks it equals the manifest's size. */
export const GROUND_TILE = ASSET_SIZES['stage.ground'][0];
/** One more tile than the view needs on each axis, so a partly scrolled view is still covered. */
export const GROUND_COLS = Math.ceil(VIEW_WIDTH / GROUND_TILE) + 2;
export const GROUND_ROWS = Math.ceil(VIEW_HEIGHT / GROUND_TILE) + 2;
/**
 * Tiles overlap by 1 world unit: placed edge to edge, anti-aliased tile edges at fractional view scales show
 * hairline seams (found in #5; `assets/README.md`).
 */
const OVERLAP_SCALE = (GROUND_TILE + 1) / GROUND_TILE;

export interface Ground {
  /** Moves the fixed tile grid under the view centred on `(cameraX, cameraY)`; writes transforms only on change. */
  sync(cameraX: number, cameraY: number): void;
  /** Hides every tile (`releaseAll`), for the screens between runs (#9). */
  release(): void;
  /** Shows the grid again from the pool's existing tiles (releasing first), creating none; the next `sync` places every tile. */
  acquire(): void;
  readonly pool: PaintPool;
}

/**
 * The endless ground (ADR 0003): a fixed grid of `GROUND_COLS × GROUND_ROWS` pooled `stage.ground` instances,
 * acquired once. Each frame the grid snaps to the tile containing the view's top-left corner. The manifest anchors
 * the tile at `[0, 0]` (checked by `packages/shared/src/assets.test.ts`).
 */
export function createGround(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): Ground {
  const count = GROUND_COLS * GROUND_ROWS;
  const pool = new PaintPool(library, 'stage.ground', layer, count);
  const handles = new Int32Array(count);
  let lastX0 = Number.NaN;
  let lastY0 = Number.NaN;
  const acquire = (): void => {
    pool.releaseAll();
    for (let i = 0; i < count; i++) handles[i] = pool.acquire();
    lastX0 = Number.NaN;
    lastY0 = Number.NaN;
  };
  acquire();
  return {
    pool,
    release() {
      pool.releaseAll();
    },
    acquire,
    sync(cameraX, cameraY) {
      const x0 = Math.floor((cameraX - VIEW_WIDTH / 2) / GROUND_TILE) * GROUND_TILE;
      const y0 = Math.floor((cameraY - VIEW_HEIGHT / 2) / GROUND_TILE) * GROUND_TILE;
      if (x0 === lastX0 && y0 === lastY0) return;
      lastX0 = x0;
      lastY0 = y0;
      for (let j = 0; j < GROUND_ROWS; j++)
        for (let i = 0; i < GROUND_COLS; i++) {
          const instance = pool.get(handles[j * GROUND_COLS + i] ?? 0);
          setTransform(instance, x0 + i * GROUND_TILE, y0 + j * GROUND_TILE, 0, OVERLAP_SCALE);
        }
    },
  };
}
