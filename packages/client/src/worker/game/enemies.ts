import type { Scene } from '@thorvg/webcanvas';
import { ENEMIES, ENEMY_CAP, ENEMY_LIST, type EnemyId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createSpatialGrid, type SpatialGrid } from '../ecs/spatial-grid';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';

/**
 * Enemy columns (#8). #10 writes the knockback and flash columns and `shownOpacity`; `flags` bit 0 marks a boss (#15),
 * bit 1 a dead enemy waiting for `cleanupSystem` (#10), bit 2 an elite (#15). `scale` multiplies the drawn size and
 * the collision radius (`enemyRadius`): 1, or `ELITE.scale` for an elite.
 */
export const ENEMY_SCHEMA = {
  x: 'f32',
  y: 'f32',
  vx: 'f32',
  vy: 'f32',
  hp: 'f32',
  /** Index into `ENEMY_LIST`. */
  type: 'u8',
  kbX: 'f32',
  kbY: 'f32',
  kbTime: 'f32',
  flash: 'f32',
  flags: 'u8',
  scale: 'f32',
  flip: 'u8',
  /** The opacity last written to the paint (#10's hit flash); 0 until the first render, so a reused paint is reset. */
  shownOpacity: 'u8',
  /**
   * `world.time` at which the weapon in slot k (0..5, `MAX_WEAPON_SLOTS`) last hit this enemy, for persistent hitboxes
   * (#13's King Bible); `NEVER_HIT` on spawn. Store columns, so they move with the enemy on swap-remove.
   */
  hitT0: 'f32',
  hitT1: 'f32',
  hitT2: 'f32',
  hitT3: 'f32',
  hitT4: 'f32',
  hitT5: 'f32',
  ...RenderBinding.columns,
} as const;

export type EnemyStore = Store<typeof ENEMY_SCHEMA>;

/** `flags` bit 0: a boss, never relocated (#15 tethers it). */
export const ENEMY_FLAG_BOSS = 1;
/** `flags` bit 1: HP reached 0 this step; `cleanupSystem` removes the enemy at the end of the step (#10). */
export const ENEMY_FLAG_DEAD = 2;

/** `flags` bit 2: an elite (#15), with `ELITE.hp` × HP, `ELITE.damage` × contact damage and `ELITE.scale` × size. */
export const ENEMY_FLAG_ELITE = 4;

/** Paints prewarmed per enemy asset (initial value; #22 retunes); bosses get `BOSS_POOL_PREWARM`. */
export const ENEMY_POOL_PREWARM = 200;
export const BOSS_POOL_PREWARM = 2;

/** Per-type speed and radius, indexed like `type`, so per-enemy loops read numbers instead of objects. */
export const ENEMY_SPEED = Float32Array.from(ENEMY_LIST, (id) => ENEMIES[id].speed);
export const ENEMY_RADIUS = Float32Array.from(ENEMY_LIST, (id) => ENEMIES[id].radius);
export const ENEMY_CONTACT_DAMAGE = Float32Array.from(
  ENEMY_LIST,
  (id) => ENEMIES[id].contactDamage,
);

/** 1 for a type whose contact damage ignores the player's armor (Death, #17). */
export const ENEMY_IGNORES_ARMOR = Uint8Array.from(ENEMY_LIST, (id) =>
  ENEMIES[id].ignoresArmor ? 1 : 0,
);

export const ENEMY_KNOCKBACK_RESIST = Float32Array.from(
  ENEMY_LIST,
  (id) => ENEMIES[id].knockbackResist,
);

/** True for a type that takes no damage from any source (Death, #174), indexed like `type`. */
export const ENEMY_INVULNERABLE: readonly boolean[] = ENEMY_LIST.map(
  (id) => ENEMIES[id].invulnerable === true,
);

/** The collision radius of the enemy in `slot`: its type's radius times its `scale` (1.5 for an elite, #15). */
export function enemyRadius(cols: EnemyStore['cols'], slot: number): number {
  return (ENEMY_RADIUS[cols.type[slot] ?? 0] ?? 0) * (cols.scale[slot] ?? 1);
}

/** The hit time of an enemy no weapon has hit yet: far enough back that every hit cooldown has passed. */
export const NEVER_HIT = -1e9;

export interface EnemyState {
  enemies: EnemyStore;
  /** `[hitT0, …, hitT5]`, built once with the store: index k is the weapon in slot k (#13). */
  enemyHitTimes: readonly Float32Array[];
  /** Rebuilt from enemy positions once per step by the movement system. */
  enemyGrid: SpatialGrid;
  /** `null` when the world only simulates (unit tests). Pool `i` draws `ENEMY_LIST[i]`. */
  enemyBinding: RenderBinding<typeof ENEMY_SCHEMA> | null;
}

/** One prewarmed pool per enemy type, indexed like `ENEMY_LIST`. Created once per worker and reused by every run (#9). */
export function createEnemyPools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return ENEMY_LIST.map(
    (id) =>
      new PaintPool(
        library,
        ENEMIES[id].assetId,
        layer,
        ENEMIES[id].boss ? BOSS_POOL_PREWARM : ENEMY_POOL_PREWARM,
      ),
  );
}

/**
 * A run's enemy store and grid; with `pools` (from `createEnemyPools`), a binding that draws through them. `capacity`
 * is `ENEMY_CAP` except in #22's stress scenarios, which size the store past the cap to measure it.
 */
export function createEnemyState(
  pools?: readonly PaintPool[],
  capacity: number = ENEMY_CAP,
): EnemyState {
  const enemies = createStore(ENEMY_SCHEMA, capacity);
  const { hitT0, hitT1, hitT2, hitT3, hitT4, hitT5 } = enemies.cols;
  return {
    enemies,
    enemyHitTimes: [hitT0, hitT1, hitT2, hitT3, hitT4, hitT5],
    // Cells of 64 units cover the largest separation query (2 × radius 16) in at most 4 cells.
    enemyGrid: createSpatialGrid({ cellSize: 64, buckets: 1024, maxItems: capacity }),
    enemyBinding: pools ? new RenderBinding(enemies, pools) : null,
  };
}

/** Spawns `enemyId` at (x, y) with full HP and binds its paint. Returns the slot, or -1 at `ENEMY_CAP`. */
export function spawnEnemy(world: EnemyState, enemyId: EnemyId, x: number, y: number): number {
  const slot = world.enemies.add();
  if (slot < 0) return -1;
  const type = ENEMY_LIST.indexOf(enemyId);
  const { cols } = world.enemies;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.hp[slot] = ENEMIES[enemyId].maxHp;
  cols.type[slot] = type;
  cols.scale[slot] = 1;
  for (const hitT of world.enemyHitTimes) hitT[slot] = NEVER_HIT;
  world.enemyBinding?.bind(slot, type);
  return slot;
}
