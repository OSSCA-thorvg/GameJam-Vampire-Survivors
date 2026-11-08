import type { Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import type { AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { createGround } from '../render/ground';
import { createHud } from '../render/hud';
import { PaintPool } from '../render/pool';
import { setTransform } from '../render/transform';
import { snapToPixel } from './camera';
import { createEnemyPools } from './enemies';
import type { World } from './world';

/** Damage feedback: while invulnerable, the player sprite alternates between these opacities every `BLINK_SEC`. */
const BLINK_SEC = 0.08;
const BLINK_DIM = 100;
const OPAQUE = 255;

export interface GameViewOptions {
  TVG: Pick<ThorVGNamespace, 'Shape' | 'Text'>;
  library: Pick<AssetLibrary, 'create'>;
  layers: {
    world: Pick<Scene, 'translate'>;
    ground: Pick<Scene, 'add'>;
    enemies: Pick<Scene, 'add'>;
    player: Pick<Scene, 'add'>;
    hud: Pick<Scene, 'add'>;
  };
  /** Device pixels per logical unit (#2's `init`/`resize` scale), read every frame. */
  scale: () => number;
}

/**
 * Everything a run draws with, created once per worker and reused by every run (#9, ADR 0003): the ground, the player
 * sprite, the enemy pools and the HUD. Between runs it is cleared with `releaseAll()` and creates or disposes nothing.
 */
export interface GameView {
  /** Pool `i` draws `ENEMY_LIST[i]`; a run's `RenderBinding` borrows them (`createWorld({ enemyPools })`). */
  readonly enemyPools: readonly PaintPool[];
  /** Every pool the view owns, for the `paintsCreated` count. */
  readonly pools: readonly PaintPool[];
  /** `created` summed over every pool. */
  countPaints(): number;
  /** Releases every pooled paint and hides the HUD: the empty frame between runs. */
  clear(): void;
  /** Shows the ground, the player and the HUD for a new run, from the existing paints. */
  begin(): void;
  /** Syncs the camera, ground, enemies, player and HUD from `world`. No `canvas.update()`/`render()`. */
  render(world: World): void;
}

export function createGameView({ TVG, library, layers, scale }: GameViewOptions): GameView {
  const ground = createGround(library, layers.ground);
  const enemyPools = createEnemyPools(library, layers.enemies);
  const playerPool = new PaintPool(library, 'player.warden', layers.player, 1);
  // Created after the player pool, so the HP bar draws above the sprite in the same layer.
  const hud = createHud(TVG, library, layers);
  const pools: readonly PaintPool[] = [ground.pool, ...enemyPools, playerPool, ...hud.pools];
  let player = playerPool.get(0);
  let opacity = OPAQUE;

  const view: GameView = {
    enemyPools,
    pools,
    countPaints() {
      let total = 0;
      for (const pool of pools) total += pool.created;
      return total;
    },
    clear() {
      for (const pool of pools) pool.releaseAll();
      hud.setVisible(false);
    },
    begin() {
      view.clear();
      ground.acquire();
      player = playerPool.get(playerPool.acquire());
      player.paint.opacity(OPAQUE);
      opacity = OPAQUE;
      hud.setVisible(true);
    },
    render(world) {
      const s = scale();
      const { camera, player: p, enemies } = world;
      layers.world.translate(
        snapToPixel(VIEW_WIDTH / 2 - camera.x, s),
        snapToPixel(VIEW_HEIGHT / 2 - camera.y, s),
      );
      ground.sync(camera.x, camera.y);
      world.enemyBinding?.sync(
        enemies,
        enemies.cols.x,
        enemies.cols.y,
        undefined,
        enemies.cols.flip,
      );
      setTransform(player, p.x, p.y, 0, 1, p.facingX < 0);
      const blink =
        p.invulnTime > 0 && Math.floor(p.invulnTime / BLINK_SEC) % 2 === 0 ? BLINK_DIM : OPAQUE;
      if (blink !== opacity) {
        opacity = blink;
        player.paint.opacity(blink);
      }
      hud.sync({
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        timeSec: world.time,
        kills: world.stats.kills,
      });
    },
  };
  view.clear();
  return view;
}
