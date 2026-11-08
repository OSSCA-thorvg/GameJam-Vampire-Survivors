import type { Matrix, Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import { CHARACTERS, type CharacterId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { createGround } from '../render/ground';
import { createHud } from '../render/hud';
import { PaintPool } from '../render/pool';
import { setTransform } from '../render/transform';
import { snapToPixel } from './camera';
import { createEnemyPools } from './enemies';
import { createFxPools } from './fx';
import { createGemPools } from './gems';
import { createLightPools } from './light-sources';
import { createPickupPools } from './pickups';
import { isFrozen } from './systems/freeze';
import { createProjectilePools } from './projectiles';
import { MAX_BOOKS } from './weapons/visuals';
import type { World } from './world';

/** Damage feedback: while invulnerable, the player sprite alternates between these opacities every `BLINK_SEC`. */
const BLINK_SEC = 0.08;
const BLINK_DIM = 100;
const OPAQUE = 255;
/** An enemy's opacity while its hit flash lasts (#10). */
const HIT_FLASH_OPACITY = 140;
/** The `fx.freeze` overlay (64×64) stretched over the 1280×720 view at this opacity while Orologion lasts (#16). */
const FREEZE_ART = 64;
const FREEZE_OPACITY = 80;

export interface GameViewOptions {
  TVG: Pick<ThorVGNamespace, 'Shape' | 'Text'>;
  library: Pick<AssetLibrary, 'create'>;
  layers: {
    world: Pick<Scene, 'translate'>;
    ground: Pick<Scene, 'add'>;
    pickups: Pick<Scene, 'add'>;
    enemies: Pick<Scene, 'add'>;
    projectiles: Pick<Scene, 'add'>;
    player: Pick<Scene, 'add'>;
    fx: Pick<Scene, 'add'>;
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
  /** Pool `i` draws `PROJECTILE_ASSETS[i]` and `FX_ASSETS[i]` (#10); borrowed the same way. */
  readonly projectilePools: readonly PaintPool[];
  readonly fxPools: readonly PaintPool[];
  /** Pool `i` draws `GEM_ASSETS[i]` (#11), in the `pickups` layer; borrowed the same way. */
  readonly gemPools: readonly PaintPool[];
  /** Pool `i` draws `LIGHT_ASSETS[i]` and `PICKUPS[i].assetId` (#16), in the `pickups` layer; borrowed the same way. */
  readonly lightPools: readonly PaintPool[];
  readonly pickupPools: readonly PaintPool[];
  /** Every pool the view owns, for the `paintsCreated` count. */
  readonly pools: readonly PaintPool[];
  /** `created` summed over every pool. */
  countPaints(): number;
  /** Releases every pooled paint and hides the HUD: the empty frame between runs. */
  clear(): void;
  /** Shows the ground, `characterId`'s player sprite (#14) and the HUD for a new run, from the existing paints. */
  begin(characterId: CharacterId): void;
  /** Syncs the camera, ground, garlic aura, lights, gems, pickups, enemies (with their hit flash), projectiles, books, player, effects, the frost overlay and HUD from `world`. No `canvas.update()`/`render()`. */
  render(world: World): void;
}

export function createGameView({ TVG, library, layers, scale }: GameViewOptions): GameView {
  const ground = createGround(library, layers.ground);
  // The garlic aura (#13) is created before the gems, so it draws under them in the same layer, and under the enemies.
  const garlicPool = new PaintPool(library, 'weapon.garlic', layers.pickups, 1);
  // Light sources under the gems, pickups above them (#16).
  const lightPools = createLightPools(library, layers.pickups);
  const gemPools = createGemPools(library, layers.pickups);
  const pickupPools = createPickupPools(library, layers.pickups);
  const enemyPools = createEnemyPools(library, layers.enemies);
  const projectilePools = createProjectilePools(library, layers.projectiles);
  const bookPool = new PaintPool(library, 'weapon.kingBible', layers.projectiles, MAX_BOOKS);
  const fxPools = createFxPools(library, layers.fx);
  // One sprite per character (#14), all created at boot; a run acquires only its character's.
  const playerPools = new Map(
    CHARACTERS.map((c) => [c.id, new PaintPool(library, c.spriteId, layers.player, 1)] as const),
  );
  // Created before the HUD, so the frost overlay draws under the HUD texts (#16).
  const freezePool = new PaintPool(library, 'fx.freeze', layers.hud, 1);
  // Created after the player pool, so the HP bar draws above the sprite in the same layer.
  const hud = createHud(TVG, library, layers);
  const pools: readonly PaintPool[] = [
    ground.pool,
    garlicPool,
    ...lightPools,
    ...gemPools,
    ...pickupPools,
    ...enemyPools,
    ...projectilePools,
    bookPool,
    ...playerPools.values(),
    ...fxPools,
    freezePool,
    ...hud.pools,
  ];
  const defaultPool = playerPools.get(CHARACTERS[0]?.id ?? 'warden');
  if (!defaultPool) throw new Error('CHARACTERS is empty');
  let player = defaultPool.get(0);
  let opacity = OPAQUE;
  /** Book handles acquired, `shownBooks` of them; acquired or released only when the shown count changes. */
  const bookHandles = new Int32Array(MAX_BOOKS);
  let shownBooks = 0;
  let garlicHandle = -1;
  let freezeHandle = -1;
  /** The frost overlay stretched over the view; its translation is set from the instance's anchor when shown. */
  const freezeMatrix: Matrix = {
    e11: VIEW_WIDTH / FREEZE_ART,
    e12: 0,
    e13: 0,
    e21: 0,
    e22: VIEW_HEIGHT / FREEZE_ART,
    e23: 0,
    e31: 0,
    e32: 0,
    e33: 1,
  };

  const view: GameView = {
    enemyPools,
    projectilePools,
    fxPools,
    gemPools,
    lightPools,
    pickupPools,
    pools,
    countPaints() {
      let total = 0;
      for (const pool of pools) total += pool.created;
      return total;
    },
    clear() {
      for (const pool of pools) pool.releaseAll();
      shownBooks = 0;
      garlicHandle = -1;
      freezeHandle = -1;
      hud.setVisible(false);
    },
    begin(characterId) {
      view.clear();
      ground.acquire();
      const pool = playerPools.get(characterId) ?? defaultPool;
      player = pool.get(pool.acquire());
      player.paint.opacity(OPAQUE);
      opacity = OPAQUE;
      hud.setVisible(true);
    },
    render(world) {
      const s = scale();
      const { camera, player: p, enemies, projectiles, fx, gems } = world;
      layers.world.translate(
        snapToPixel(VIEW_WIDTH / 2 - camera.x, s),
        snapToPixel(VIEW_HEIGHT / 2 - camera.y, s),
      );
      ground.sync(camera.x, camera.y);
      world.lightBinding?.sync(world.lights, world.lights.cols.x, world.lights.cols.y);
      world.gemBinding?.sync(gems, gems.cols.x, gems.cols.y);
      world.pickupBinding?.sync(world.pickups, world.pickups.cols.x, world.pickups.cols.y);
      world.enemyBinding?.sync(
        enemies,
        enemies.cols.x,
        enemies.cols.y,
        undefined,
        enemies.cols.flip,
      );
      if (world.enemyBinding) syncHitFlash(world);
      world.projectileBinding?.sync(
        projectiles,
        projectiles.cols.x,
        projectiles.cols.y,
        projectiles.cols.rot,
        undefined,
        projectiles.cols.scale,
      );
      world.fxBinding?.sync(fx, fx.cols.x, fx.cols.y, fx.cols.rot, fx.cols.flip, fx.cols.scale);
      syncWeaponVisuals(world);
      syncFreeze(world);
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
        xp: p.xp,
        level: p.level,
      });
    },
  };
  /** Shows the King Bible books and the garlic aura (#13) from `world.weaponVisuals`, on the pooled paints. */
  function syncWeaponVisuals(world: World): void {
    const { books, garlic } = world.weaponVisuals;
    const wanted = Math.min(books.count, MAX_BOOKS);
    while (shownBooks < wanted) bookHandles[shownBooks++] = bookPool.acquire();
    while (shownBooks > wanted) bookPool.release(bookHandles[--shownBooks] ?? 0);
    for (let i = 0; i < shownBooks; i++)
      setTransform(
        bookPool.get(bookHandles[i] ?? 0),
        books.x[i] ?? 0,
        books.y[i] ?? 0,
        0,
        books.scale,
      );
    if (garlic.shown && garlicHandle < 0) garlicHandle = garlicPool.acquire();
    if (!garlic.shown && garlicHandle >= 0) {
      garlicPool.release(garlicHandle);
      garlicHandle = -1;
    }
    if (garlicHandle >= 0)
      setTransform(garlicPool.get(garlicHandle), world.player.x, world.player.y, 0, garlic.scale);
  }
  /** Shows the `fx.freeze` overlay over the whole view while frozen, acquiring or releasing it only when that changes. */
  function syncFreeze(world: World): void {
    const frozen = isFrozen(world);
    if (frozen === freezeHandle >= 0) return;
    if (!frozen) {
      freezePool.release(freezeHandle);
      freezeHandle = -1;
      return;
    }
    freezeHandle = freezePool.acquire();
    const overlay = freezePool.get(freezeHandle);
    freezeMatrix.e13 = VIEW_WIDTH / 2 + freezeMatrix.e11 * overlay.offsetX;
    freezeMatrix.e23 = VIEW_HEIGHT / 2 + freezeMatrix.e22 * overlay.offsetY;
    overlay.paint.transform(freezeMatrix);
    overlay.paint.opacity(FREEZE_OPACITY);
  }
  /** Dims each flashing enemy, writing opacity only when it changes; a fresh slot's `shownOpacity` 0 forces a write. */
  function syncHitFlash(world: World): void {
    const { count, cols } = world.enemies;
    const { flash, shownOpacity, poolId, paintHandle } = cols;
    for (let i = 0; i < count; i++) {
      const target = (flash[i] ?? 0) > 0 ? HIT_FLASH_OPACITY : OPAQUE;
      if (shownOpacity[i] === target) continue;
      shownOpacity[i] = target;
      enemyPools[poolId[i] ?? 0]?.get(paintHandle[i] ?? 0).paint.opacity(target);
    }
  }

  view.clear();
  return view;
}
