// The opponent pane's world (#115, ADR 0018): the other player's relayed views, drawn only, never simulated. Every
// paint is created once at boot in pools of its own; per frame only transforms and visibility change (ADR 0003).
import type { Scene, Shape, ThorVGNamespace } from '@thorvg/webcanvas';
import {
  CHARACTERS,
  ELITE,
  ENEMIES,
  ENEMY_LIST,
  INTERFERENCE,
  PICKUPS,
  VIEW_ENEMY_MAX,
  VIEW_GEM_MAX,
  VIEW_PICKUP_MAX,
  VIEW_QUANT,
  type DrawableAssetId,
} from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { createGround } from '../render/ground';
import { PaintPool } from '../render/pool';
import { setTransform } from '../render/transform';
import { snapToPixel } from './camera';
import { BOSS_POOL_PREWARM } from './enemies';
import { GEM_ASSETS } from './gems';
import type { FeedEntry, OpponentFeed } from './opponent-feed';

/** How far behind the newest view the pane draws, so two views bracket the render time (views come every ~110 ms). */
export const OPPONENT_RENDER_DELAY_MS = 200;
/** Paints per normal enemy type: the whole view's cap, so one type alone can fill it. */
export const OPPONENT_ENEMY_PREWARM = VIEW_ENEMY_MAX;

/** HP bar like the own HUD's (`render/hud.ts`): `ui.hpBar` 40×6 with a fill inset by 1, 6 units under the feet. */
const BAR_W = 40;
const BAR_H = 6;
const FILL_W = BAR_W - 2;
const FILL_H = BAR_H - 2;
const BAR_GAP = 6;

export interface OpponentViewOptions {
  TVG: Pick<ThorVGNamespace, 'Shape'>;
  library: Pick<AssetLibrary, 'create'>;
  layers: {
    world: Pick<Scene, 'translate'>;
    ground: Pick<Scene, 'add'>;
    pickups: Pick<Scene, 'add'>;
    enemies: Pick<Scene, 'add'>;
    player: Pick<Scene, 'add'>;
  };
  /** Device pixels per logical unit, read every frame (for snapping the camera). */
  scale: () => number;
}

export interface OpponentView {
  /** Draws the feed as of `nowMs - OPPONENT_RENDER_DELAY_MS`; only the ground at (0, 0) before the first view. */
  render(feed: OpponentFeed, nowMs: number): void;
  /** Hides every entity and the player (a new run, or back to the title); the ground stays. */
  clear(): void;
  /** `created` summed over every pool: constant after boot. */
  countPaints(): number;
  /** The `opponentPane` snapshot numbers of the last render. */
  readonly cameraX: number;
  readonly cameraY: number;
  readonly enemiesShown: number;
  readonly gemsShown: number;
  readonly pickupsShown: number;
}

/** A pool that never grows: `shown` handles are acquired, at most its prewarm. */
interface CappedPool {
  pool: PaintPool;
  cap: number;
  handles: Int32Array;
  shown: number;
  used: number;
}

function capped(
  library: Pick<AssetLibrary, 'create'>,
  id: DrawableAssetId,
  layer: Pick<Scene, 'add'>,
  cap: number,
): CappedPool {
  return {
    pool: new PaintPool(library, id, layer, cap),
    cap,
    handles: new Int32Array(cap),
    shown: 0,
    used: 0,
  };
}

/** Places the next paint of `p` at (x, y), acquiring only below its cap; false when the pool is full. */
function place(p: CappedPool, x: number, y: number, scale: number, flip: boolean): boolean {
  if (p.used >= p.cap) return false;
  if (p.used >= p.shown) {
    p.handles[p.used] = p.pool.acquire();
    p.shown = p.used + 1;
  }
  setTransform(p.pool.get(p.handles[p.used] ?? 0), x, y, 0, scale, flip);
  p.used++;
  return true;
}

/** Releases what was shown last frame beyond this frame's count, then starts the next frame's count. */
function settle(p: CappedPool): void {
  while (p.shown > p.used) p.pool.release(p.handles[--p.shown] ?? 0);
  p.used = 0;
}

export function createOpponentView({
  TVG,
  library,
  layers,
  scale,
}: OpponentViewOptions): OpponentView {
  const ground = createGround(library, layers.ground);
  const gemPools = GEM_ASSETS.map((id) => capped(library, id, layers.pickups, VIEW_GEM_MAX));
  const pickupPools = [
    ...PICKUPS.map((def) => capped(library, def.assetId, layers.pickups, VIEW_PICKUP_MAX)),
    ...INTERFERENCE.map((def) => capped(library, def.assetId, layers.pickups, VIEW_PICKUP_MAX)),
  ];
  const enemyPools = ENEMY_LIST.map((id) =>
    capped(
      library,
      ENEMIES[id].assetId,
      layers.enemies,
      ENEMIES[id].boss ? BOSS_POOL_PREWARM : OPPONENT_ENEMY_PREWARM,
    ),
  );
  const playerPools = CHARACTERS.map((c) => capped(library, c.spriteId, layers.player, 1));
  // After the player pools, so the HP bar draws above the sprite in the same layer.
  const barPool = capped(library, 'ui.hpBar', layers.player, 1);
  const fill: Shape = new TVG.Shape();
  fill.appendRect(0, 0, FILL_W, FILL_H).fill(0xc0, 0x39, 0x2b, 255);
  fill.visible(false);
  layers.player.add(fill);
  const all: readonly CappedPool[] = [
    ...gemPools,
    ...pickupPools,
    ...enemyPools,
    ...playerPools,
    barPool,
  ];
  const fillMatrix = { e11: 1, e12: 0, e13: 0, e21: 0, e22: 1, e23: 0, e31: 0, e32: 0, e33: 1 };
  const state = { cameraX: 0, cameraY: 0, enemiesShown: 0, gemsShown: 0, pickupsShown: 0 };

  const placeCamera = (x: number, y: number): void => {
    const s = scale();
    state.cameraX = x;
    state.cameraY = y;
    layers.world.translate(snapToPixel(VIEW_WIDTH / 2 - x, s), snapToPixel(VIEW_HEIGHT / 2 - y, s));
    ground.sync(x, y);
  };

  const clear = (): void => {
    for (const p of all) {
      p.used = 0;
      settle(p);
    }
    fill.visible(false);
    state.enemiesShown = 0;
    state.gemsShown = 0;
    state.pickupsShown = 0;
  };

  /** The entry whose entities are drawn and the interpolated player position, for render time `rt`. */
  let drawn: FeedEntry | null = null;
  const pick = (entries: readonly FeedEntry[], rt: number): void => {
    const first = entries[0];
    const last = entries[entries.length - 1];
    if (!first || !last) return;
    if (rt >= last.atMs) {
      drawn = last;
      state.cameraX = last.view.x;
      state.cameraY = last.view.y;
      return;
    }
    if (rt <= first.atMs) {
      drawn = first;
      state.cameraX = first.view.x;
      state.cameraY = first.view.y;
      return;
    }
    for (let i = 0; i + 1 < entries.length; i++) {
      const a = entries[i];
      const b = entries[i + 1];
      if (!a || !b || rt > b.atMs) continue;
      const span = b.atMs - a.atMs;
      const u = span > 0 ? (rt - a.atMs) / span : 1;
      drawn = b;
      state.cameraX = a.view.x + (b.view.x - a.view.x) * u;
      state.cameraY = a.view.y + (b.view.y - a.view.y) * u;
      return;
    }
  };

  return {
    render(feed, nowMs) {
      if (!feed.latest()) {
        if (drawn) clear();
        drawn = null;
        placeCamera(0, 0);
        return;
      }
      pick(feed.entries(), nowMs - OPPONENT_RENDER_DELAY_MS);
      const entry = drawn;
      if (!entry) return;
      const { view } = entry;
      placeCamera(state.cameraX, state.cameraY);

      let enemies = 0;
      const { e, g, p } = view;
      for (let i = 0; i + 2 < e.length && enemies < VIEW_ENEMY_MAX; i += 3) {
        const kind = e[i] ?? 0;
        const pool = enemyPools[kind >> 1];
        if (!pool) continue;
        const dx = e[i + 1] ?? 0;
        if (
          place(
            pool,
            view.x + dx * VIEW_QUANT,
            view.y + (e[i + 2] ?? 0) * VIEW_QUANT,
            (kind & 1) === 1 ? ELITE.scale : 1,
            dx > 0,
          )
        )
          enemies++;
      }
      let gems = 0;
      for (let i = 0; i + 2 < g.length && gems < VIEW_GEM_MAX; i += 3) {
        const pool = gemPools[g[i] ?? 0];
        if (
          pool &&
          place(
            pool,
            view.x + (g[i + 1] ?? 0) * VIEW_QUANT,
            view.y + (g[i + 2] ?? 0) * VIEW_QUANT,
            1,
            false,
          )
        )
          gems++;
      }
      let pickups = 0;
      for (let i = 0; i + 2 < p.length && pickups < VIEW_PICKUP_MAX; i += 3) {
        const pool = pickupPools[p[i] ?? 0];
        if (
          pool &&
          place(
            pool,
            view.x + (p[i + 1] ?? 0) * VIEW_QUANT,
            view.y + (p[i + 2] ?? 0) * VIEW_QUANT,
            1,
            false,
          )
        )
          pickups++;
      }
      const px = state.cameraX;
      const py = state.cameraY;
      const sprite = playerPools[view.c] ?? playerPools[0];
      if (sprite) place(sprite, px, py, 1, view.f === 1);
      const top = py + BAR_GAP;
      place(barPool, px, top + BAR_H / 2, 1, false);
      fillMatrix.e11 = Math.max(0, Math.min(1, view.h / 1000));
      fillMatrix.e13 = px - FILL_W / 2;
      fillMatrix.e23 = top + 1;
      fill.transform(fillMatrix);
      fill.visible(true);
      for (const pool of all) settle(pool);
      state.enemiesShown = enemies;
      state.gemsShown = gems;
      state.pickupsShown = pickups;
    },
    clear() {
      clear();
      drawn = null;
    },
    countPaints() {
      let total = ground.pool.created + 1; // the HP fill shape
      for (const p of all) total += p.pool.created;
      return total;
    },
    get cameraX() {
      return state.cameraX;
    },
    get cameraY() {
      return state.cameraY;
    },
    get enemiesShown() {
      return state.enemiesShown;
    },
    get gemsShown() {
      return state.gemsShown;
    },
    get pickupsShown() {
      return state.pickupsShown;
    },
  };
}
