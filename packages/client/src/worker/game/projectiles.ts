import type { Scene } from '@thorvg/webcanvas';
import { MAX_ENEMY_RADIUS, PROJECTILE_CAP, type DrawableAssetId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';
import { damageEnemy, isDead } from './combat';
import { ENEMY_RADIUS } from './enemies';
import type { World } from './world';

/**
 * Projectile columns (#10). `hit0`..`hit3` are a ring of the last enemy UIDs hit, so a piercing projectile never hits
 * the same enemy twice; only the first `hitCount` entries are filled (UID 0 is a valid enemy), and `hitCursor` is the
 * next entry to overwrite once all four are.
 */
export const PROJECTILE_SCHEMA = {
  x: 'f32',
  y: 'f32',
  vx: 'f32',
  vy: 'f32',
  /** Degrees, from the velocity each step. */
  rot: 'f32',
  ttl: 'f32',
  damage: 'f32',
  knockback: 'f32',
  radius: 'f32',
  pierceLeft: 'i32',
  hit0: 'u32',
  hit1: 'u32',
  hit2: 'u32',
  hit3: 'u32',
  hitCount: 'u8',
  hitCursor: 'u8',
  ...RenderBinding.columns,
} as const;

export type ProjectileStore = Store<typeof PROJECTILE_SCHEMA>;

/** The projectile art, in pool order: `poolId` indexes this list. #13 appends its weapons. */
export const PROJECTILE_ASSETS = ['weapon.magicWand'] as const satisfies readonly DrawableAssetId[];
export type ProjectileAssetId = (typeof PROJECTILE_ASSETS)[number];

/** Paints prewarmed per projectile asset (initial value; #22 retunes). */
export const PROJECTILE_POOL_PREWARM = 300;

export interface ProjectileState {
  projectiles: ProjectileStore;
  /** `null` when the world only simulates (unit tests). Pool `i` draws `PROJECTILE_ASSETS[i]`. */
  projectileBinding: RenderBinding<typeof PROJECTILE_SCHEMA> | null;
  /** `[hit0, hit1, hit2, hit3]`, built once with the store, so the step reads the ring without allocating. */
  projectileHitRing: readonly Uint32Array[];
}

/** What a shot carries besides its position and velocity. Callers reuse one object; it is copied into the store. */
export interface ProjectileOptions {
  damage: number;
  knockback: number;
  radius: number;
  pierce: number;
  ttl: number;
}

/** One prewarmed pool per projectile asset, created once per worker and reused by every run (#9). */
export function createProjectilePools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return PROJECTILE_ASSETS.map((id) => new PaintPool(library, id, layer, PROJECTILE_POOL_PREWARM));
}

export function createProjectileState(pools?: readonly PaintPool[]): ProjectileState {
  const projectiles = createStore(PROJECTILE_SCHEMA, PROJECTILE_CAP);
  const { hit0, hit1, hit2, hit3 } = projectiles.cols;
  return {
    projectiles,
    projectileBinding: pools ? new RenderBinding(projectiles, pools) : null,
    projectileHitRing: [hit0, hit1, hit2, hit3],
  };
}

const DEG = 180 / Math.PI;

/** Spawns a projectile and binds its paint. Returns the slot, or -1 at `PROJECTILE_CAP` (the shot is skipped). */
export function spawnProjectile(
  world: ProjectileState,
  assetId: ProjectileAssetId,
  x: number,
  y: number,
  vx: number,
  vy: number,
  opts: ProjectileOptions,
): number {
  const slot = world.projectiles.add();
  if (slot < 0) return -1;
  const { cols } = world.projectiles;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.vx[slot] = vx;
  cols.vy[slot] = vy;
  cols.rot[slot] = Math.atan2(vy, vx) * DEG;
  cols.ttl[slot] = opts.ttl;
  cols.damage[slot] = opts.damage;
  cols.knockback[slot] = opts.knockback;
  cols.radius[slot] = opts.radius;
  // `Infinity` (never used up) saturates the i32 column.
  cols.pierceLeft[slot] = Math.min(opts.pierce, 0x7fffffff);
  world.projectileBinding?.bind(slot, PROJECTILE_ASSETS.indexOf(assetId));
  return slot;
}

/** Enemies read per projectile per step. */
const nearby = new Int32Array(64);

/**
 * Moves every projectile, counts its lifetime down and damages each overlapping enemy it has not hit yet, along its
 * direction of travel, until its pierce is used up (#10). Spent or expired projectiles are removed, iterating
 * backwards. Reads `world.enemyGrid`, rebuilt this step by the movement system.
 */
export function projectileSystem(world: World, dt: number): void {
  const { projectiles, projectileBinding, projectileHitRing: ring, enemies, enemyGrid } = world;
  const p = projectiles.cols;
  const ex = enemies.cols.x;
  const ey = enemies.cols.y;
  const etype = enemies.cols.type;
  for (let i = projectiles.count - 1; i >= 0; i--) {
    const vx = p.vx[i] ?? 0;
    const vy = p.vy[i] ?? 0;
    const x = (p.x[i] ?? 0) + vx * dt;
    const y = (p.y[i] ?? 0) + vy * dt;
    p.x[i] = x;
    p.y[i] = y;
    if (vx !== 0 || vy !== 0) p.rot[i] = Math.atan2(vy, vx) * DEG;
    p.ttl[i] = (p.ttl[i] ?? 0) - dt;
    const radius = p.radius[i] ?? 0;
    const speed = Math.hypot(vx, vy);
    const dirX = speed > 0 ? vx / speed : 0;
    const dirY = speed > 0 ? vy / speed : 0;
    const found = enemyGrid.query(x, y, radius + MAX_ENEMY_RADIUS, nearby);
    for (let n = 0; n < found && (p.pierceLeft[i] ?? 0) > 0; n++) {
      const e = nearby[n] ?? 0;
      if (isDead(world, e)) continue;
      const reach = radius + (ENEMY_RADIUS[etype[e] ?? 0] ?? 0);
      const dx = (ex[e] ?? 0) - x;
      const dy = (ey[e] ?? 0) - y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const uid = enemies.uid[e] ?? 0;
      const filled = p.hitCount[i] ?? 0;
      let seen = false;
      for (let k = 0; k < filled; k++) if (ring[k]?.[i] === uid) seen = true;
      if (seen) continue;
      const cursor = p.hitCursor[i] ?? 0;
      const column = ring[cursor];
      if (column) column[i] = uid;
      p.hitCursor[i] = (cursor + 1) % ring.length;
      if (filled < ring.length) p.hitCount[i] = filled + 1;
      p.pierceLeft[i] = (p.pierceLeft[i] ?? 0) - 1;
      damageEnemy(world, e, p.damage[i] ?? 0, dirX, dirY, p.knockback[i] ?? 0);
    }
    if ((p.pierceLeft[i] ?? 0) > 0 && (p.ttl[i] ?? 0) > 0) continue;
    projectileBinding?.unbind(i);
    projectiles.remove(i);
  }
  if (import.meta.env.DEV && projectiles.count > PROJECTILE_CAP)
    throw new Error(
      `Live projectiles ${String(projectiles.count)} exceed PROJECTILE_CAP ${String(PROJECTILE_CAP)}`,
    );
}
