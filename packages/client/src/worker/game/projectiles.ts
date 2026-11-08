import type { Scene } from '@thorvg/webcanvas';
import { MAX_ENEMY_RADIUS, PROJECTILE_CAP, type DrawableAssetId } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';
import { damageEnemy, isDead } from './combat';
import { enemyRadius } from './enemies';
import { hitLightsInCircle } from './light-sources';
import { rollCrit } from './weapons/context';
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
  /** Drawn scale, the weapon's `area` (#13). */
  scale: 'f32',
  /** `MOTION_*`: how the step changes the velocity (#13). */
  motion: 'u8',
  /** Seconds since the spawn. */
  age: 'f32',
  /** `MOTION_FALL`: downward acceleration in units/s². */
  gravity: 'f32',
  /** `MOTION_RETURN`: the launch speed, the unit aim direction, the seconds until it turns, and 1 once it turned. */
  speed: 'f32',
  aimX: 'f32',
  aimY: 'f32',
  returnAfter: 'f32',
  turned: 'u8',
  /** Chance per hit of a critical hit, and its damage multiplier (Heaven Sword, #15); rolled on `world.weaponRng`. */
  critChance: 'f32',
  critMultiplier: 'f32',
  /** The weapon slot that fired it (#17), the `source` of its hits. */
  weaponSlot: 'u8',
  ...RenderBinding.columns,
} as const;

export type ProjectileStore = Store<typeof PROJECTILE_SCHEMA>;

/** The projectile art, in pool order: `poolId` indexes this list. Append only. */
export const PROJECTILE_ASSETS = [
  'weapon.magicWand',
  'weapon.knife',
  'weapon.axe',
  'weapon.cross',
  'weapon.fireWand',
  // The evolutions (#15), drawn by the same patterns from `WeaponDef.assetId`.
  'weapon.holyWand',
  'weapon.thousandEdge',
  'weapon.deathSpiral',
  'weapon.heavenSword',
  'weapon.hellfire',
] as const satisfies readonly DrawableAssetId[];
export type ProjectileAssetId = (typeof PROJECTILE_ASSETS)[number];

/** Paints prewarmed per projectile asset (initial values; #22 retunes). */
export const PROJECTILE_POOL_PREWARM: Readonly<Record<ProjectileAssetId, number>> = {
  'weapon.magicWand': 300,
  'weapon.knife': 100,
  'weapon.axe': 30,
  'weapon.cross': 30,
  'weapon.fireWand': 60,
  'weapon.holyWand': 100,
  'weapon.thousandEdge': 30,
  'weapon.deathSpiral': 30,
  'weapon.heavenSword': 10,
  'weapon.hellfire': 10,
};

/** Flies in a straight line at its launch velocity. */
export const MOTION_STRAIGHT = 0;
/**
 * Axe (#13): `vy += gravity * dt` every step; removed once it falls below the view's bottom edge plus
 * `FALL_REMOVE_MARGIN`.
 */
export const MOTION_FALL = 1;
/**
 * Cross (#13): its speed along the aim is `speed * (1 - age / returnAfter)`, clamped at `-2 * speed`, so it slows,
 * turns and comes back; its hit ring is cleared when it turns, and once turned it is removed when it leaves the view
 * expanded by `RETURN_REMOVE_MARGIN`.
 */
export const MOTION_RETURN = 2;
export type ProjectileMotion = typeof MOTION_STRAIGHT | typeof MOTION_FALL | typeof MOTION_RETURN;
export const FALL_REMOVE_MARGIN = 100;
export const RETURN_REMOVE_MARGIN = 64;
/** Degrees per second a falling or returning projectile spins (initial value, tune against footage). */
export const SPIN_DEG_PER_SEC = 720;

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
  /** The firing weapon's slot (`OwnedWeapon.slot`), credited with the damage (#17). */
  weaponSlot: number;
  /** Drawn scale; 1 when absent. */
  scale?: number;
  /** `MOTION_*`; `MOTION_STRAIGHT` when absent. */
  motion?: ProjectileMotion;
  /** For `MOTION_FALL`. */
  gravity?: number;
  /** For `MOTION_RETURN`. */
  returnAfter?: number;
  /** Critical hits (#15); none when absent. */
  critChance?: number;
  critMultiplier?: number;
}

/** One prewarmed pool per projectile asset, created once per worker and reused by every run (#9). */
export function createProjectilePools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return PROJECTILE_ASSETS.map(
    (id) => new PaintPool(library, id, layer, PROJECTILE_POOL_PREWARM[id]),
  );
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
  cols.scale[slot] = opts.scale ?? 1;
  const motion = opts.motion ?? MOTION_STRAIGHT;
  cols.motion[slot] = motion;
  cols.gravity[slot] = opts.gravity ?? 0;
  cols.critChance[slot] = opts.critChance ?? 0;
  cols.critMultiplier[slot] = opts.critMultiplier ?? 1;
  cols.weaponSlot[slot] = opts.weaponSlot;
  if (motion === MOTION_RETURN) {
    const speed = Math.hypot(vx, vy);
    cols.speed[slot] = speed;
    cols.aimX[slot] = speed > 0 ? vx / speed : 1;
    cols.aimY[slot] = speed > 0 ? vy / speed : 0;
    cols.returnAfter[slot] = opts.returnAfter ?? 0;
  }
  world.projectileBinding?.bind(slot, PROJECTILE_ASSETS.indexOf(assetId));
  return slot;
}

/** Enemies read per projectile per step. */
const nearby = new Int32Array(64);

/**
 * Applies the projectile's `motion` to its velocity (#13). Returns true when the projectile left the area it lives in
 * (a fallen axe, a returned cross off screen), so the caller removes it.
 */
function steer(world: World, i: number, dt: number): boolean {
  const p = world.projectiles.cols;
  const motion = p.motion[i] ?? MOTION_STRAIGHT;
  if (motion === MOTION_STRAIGHT) return false;
  p.rot[i] = (p.rot[i] ?? 0) + SPIN_DEG_PER_SEC * dt;
  if (motion === MOTION_FALL) {
    p.vy[i] = (p.vy[i] ?? 0) + (p.gravity[i] ?? 0) * dt;
    return (p.y[i] ?? 0) > world.camera.viewRect(0).bottom + FALL_REMOVE_MARGIN;
  }
  const age = p.age[i] ?? 0;
  const speed = p.speed[i] ?? 0;
  const returnAfter = p.returnAfter[i] ?? 0;
  const along = Math.max(-2 * speed, speed * (1 - (returnAfter > 0 ? age / returnAfter : 1)));
  p.vx[i] = (p.aimX[i] ?? 0) * along;
  p.vy[i] = (p.aimY[i] ?? 0) * along;
  if (p.turned[i] === 0) {
    if (age < returnAfter) return false;
    // Coming back, it may hit the enemies of the way out once more.
    p.turned[i] = 1;
    p.hitCount[i] = 0;
    p.hitCursor[i] = 0;
    return false;
  }
  const view = world.camera.viewRect(RETURN_REMOVE_MARGIN);
  const x = p.x[i] ?? 0;
  const y = p.y[i] ?? 0;
  return x < view.left || x > view.right || y < view.top || y > view.bottom;
}

/**
 * Moves every projectile after its `motion` (#13), counts its lifetime down and damages each overlapping enemy it has
 * not hit yet, along its direction of travel, until its pierce is used up (#10). Spent, expired or departed
 * projectiles are removed, iterating backwards. Reads `world.enemyGrid`, rebuilt this step by the movement system.
 */
export function projectileSystem(world: World, dt: number): void {
  const { projectiles, projectileBinding, projectileHitRing: ring, enemies, enemyGrid } = world;
  const p = projectiles.cols;
  const ex = enemies.cols.x;
  const ey = enemies.cols.y;
  for (let i = projectiles.count - 1; i >= 0; i--) {
    if (steer(world, i, dt)) {
      projectileBinding?.unbind(i);
      projectiles.remove(i);
      continue;
    }
    const vx = p.vx[i] ?? 0;
    const vy = p.vy[i] ?? 0;
    const x = (p.x[i] ?? 0) + vx * dt;
    const y = (p.y[i] ?? 0) + vy * dt;
    p.x[i] = x;
    p.y[i] = y;
    if ((vx !== 0 || vy !== 0) && p.motion[i] === MOTION_STRAIGHT)
      p.rot[i] = Math.atan2(vy, vx) * DEG;
    p.age[i] = (p.age[i] ?? 0) + dt;
    p.ttl[i] = (p.ttl[i] ?? 0) - dt;
    const radius = p.radius[i] ?? 0;
    const speed = Math.hypot(vx, vy);
    const dirX = speed > 0 ? vx / speed : 0;
    const dirY = speed > 0 ? vy / speed : 0;
    const found = enemyGrid.query(x, y, radius + MAX_ENEMY_RADIUS, nearby);
    for (let n = 0; n < found && (p.pierceLeft[i] ?? 0) > 0; n++) {
      const e = nearby[n] ?? 0;
      if (isDead(world, e)) continue;
      const reach = radius + enemyRadius(enemies.cols, e);
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
      const damage = rollCrit(
        world.weaponRng,
        p.damage[i] ?? 0,
        p.critChance[i] ?? 0,
        p.critMultiplier[i] ?? 1,
      );
      damageEnemy(world, e, damage, dirX, dirY, p.knockback[i] ?? 0, p.weaponSlot[i] ?? 0);
    }
    // Light sources (#16): hit after the enemy query, without using pierce.
    hitLightsInCircle(world, x, y, radius, p.damage[i] ?? 0);
    if ((p.pierceLeft[i] ?? 0) > 0 && (p.ttl[i] ?? 0) > 0) continue;
    projectileBinding?.unbind(i);
    projectiles.remove(i);
  }
  if (import.meta.env.DEV && projectiles.count > PROJECTILE_CAP)
    throw new Error(
      `Live projectiles ${String(projectiles.count)} exceed PROJECTILE_CAP ${String(PROJECTILE_CAP)}`,
    );
}
