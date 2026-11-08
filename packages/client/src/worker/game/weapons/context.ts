import type { Rng } from '@vs/shared';
import { damageEnemy } from '../combat';
import type { EnemyStore } from '../enemies';
import { spawnFx, type FxAssetId } from '../fx';
import type { PlayerState } from '../player';
import { spawnProjectile, type ProjectileAssetId, type ProjectileOptions } from '../projectiles';
import type { World } from '../world';

/** What a weapon pattern may read and do, bound to one world (#10). Built once per world, never per step. */
export interface WeaponContext {
  /** Position, `facingX` and `lastDirX`/`lastDirY`. */
  readonly player: PlayerState;
  readonly enemies: EnemyStore;
  /** `world.weaponRng`, the weapons' own stream (`world.rng.fork('weapons')`). */
  readonly rng: Rng;
  /** `world.enemyGrid.query`: enemy slots within `radius` of (x, y), written into `out`. */
  query(x: number, y: number, radius: number, out: Int32Array): number;
  /** `world.enemyGrid.nearest`: the closest enemy slot within `maxRadius`, or -1. */
  nearest(x: number, y: number, maxRadius: number): number;
  spawnProjectile(
    assetId: ProjectileAssetId,
    x: number,
    y: number,
    vx: number,
    vy: number,
    opts: ProjectileOptions,
  ): number;
  spawnFx(
    assetId: FxAssetId,
    x: number,
    y: number,
    rotationDeg: number,
    flipX: boolean,
    ttl: number,
    scale?: number,
  ): number;
  damageEnemy(slot: number, amount: number, dirX: number, dirY: number, knockback: number): void;
}

export function createWeaponContext(world: World): WeaponContext {
  return {
    get player() {
      return world.player;
    },
    get enemies() {
      return world.enemies;
    },
    get rng() {
      return world.weaponRng;
    },
    query: (x, y, radius, out) => world.enemyGrid.query(x, y, radius, out),
    nearest: (x, y, maxRadius) => world.enemyGrid.nearest(x, y, maxRadius),
    spawnProjectile: (assetId, x, y, vx, vy, opts) =>
      spawnProjectile(world, assetId, x, y, vx, vy, opts),
    spawnFx: (assetId, x, y, rotationDeg, flipX, ttl, scale) =>
      spawnFx(world, assetId, x, y, rotationDeg, flipX, ttl, scale),
    damageEnemy: (slot, amount, dirX, dirY, knockback) => {
      damageEnemy(world, slot, amount, dirX, dirY, knockback);
    },
  };
}
