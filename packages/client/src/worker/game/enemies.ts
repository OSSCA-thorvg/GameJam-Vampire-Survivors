import type { Scene } from '@thorvg/webcanvas';
import { ENEMIES, ENEMY_CAP, ENEMY_LIST, type EnemyId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createSpatialGrid, type SpatialGrid } from '../ecs/spatial-grid';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';

/** Enemy columns (#8). #10 writes the knockback and flash columns; `flags` bit 0 marks a boss (#15). */
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
  flip: 'u8',
  ...RenderBinding.columns,
} as const;

export type EnemyStore = Store<typeof ENEMY_SCHEMA>;

/** `flags` bit 0: a boss, never relocated (#15 tethers it). Bit 1 is reserved for #10's dead mark. */
export const ENEMY_FLAG_BOSS = 1;

/** Paints prewarmed per enemy asset (initial value; #22 retunes). */
export const ENEMY_POOL_PREWARM = 200;

/** Per-type speed and radius, indexed like `type`, so per-enemy loops read numbers instead of objects. */
export const ENEMY_SPEED = Float32Array.from(ENEMY_LIST, (id) => ENEMIES[id].speed);
export const ENEMY_RADIUS = Float32Array.from(ENEMY_LIST, (id) => ENEMIES[id].radius);

export interface EnemyState {
  enemies: EnemyStore;
  /** Rebuilt from enemy positions once per step by the movement system. */
  enemyGrid: SpatialGrid;
  /** `null` when the world only simulates (unit tests). Pool `i` draws `ENEMY_LIST[i]`. */
  enemyBinding: RenderBinding<typeof ENEMY_SCHEMA> | null;
}

export function createEnemyState(view?: {
  library: Pick<AssetLibrary, 'create'>;
  layer: Pick<Scene, 'add'>;
}): EnemyState {
  const enemies = createStore(ENEMY_SCHEMA, ENEMY_CAP);
  const pools = view
    ? ENEMY_LIST.map(
        (id) => new PaintPool(view.library, ENEMIES[id].assetId, view.layer, ENEMY_POOL_PREWARM),
      )
    : null;
  return {
    enemies,
    // Cells of 64 units cover the largest separation query (2 × radius 16) in at most 4 cells.
    enemyGrid: createSpatialGrid({ cellSize: 64, buckets: 1024, maxItems: ENEMY_CAP }),
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
  world.enemyBinding?.bind(slot, type);
  return slot;
}
