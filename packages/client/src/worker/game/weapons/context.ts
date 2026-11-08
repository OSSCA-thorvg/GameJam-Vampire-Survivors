import type { Rng, WeaponLevel } from '@vs/shared';
import type { Camera } from '../camera';
import { damageEnemy, isDead } from '../combat';
import type { EnemyStore } from '../enemies';
import { hitLightsInBox, hitLightsInCircle } from '../light-sources';
import { spawnFx, type FxAssetId } from '../fx';
import type { PlayerState } from '../player';
import { spawnProjectile, type ProjectileAssetId, type ProjectileOptions } from '../projectiles';
import type { World } from '../world';
import type { OwnedWeapon } from './owned';
import type { WeaponVisuals } from './visuals';

/** What a weapon pattern may read and do, bound to one world (#10). Built once per world, never per step. */
export interface WeaponContext {
  /** Position, `facingX` and `lastDirX`/`lastDirY`. */
  readonly player: PlayerState;
  readonly enemies: EnemyStore;
  /** `world.enemyHitTimes`: per weapon slot, the `time` each enemy was last hit (#13). */
  readonly enemyHitTimes: readonly Float32Array[];
  /** `camera.viewRect` for on-screen targeting and removal (#13). */
  readonly camera: Camera;
  /** `world.time`, simulated seconds. */
  readonly time: number;
  /** What the persistent weapons show this step (books, garlic aura); the game view draws it (#13). */
  readonly visuals: WeaponVisuals;
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
  /**
   * Hits the intact light sources overlapping a circle or a box (#16); with `cooldown`, only lights not hit by such a
   * weapon for that many seconds. Lights are not enemies: no kill, no pierce used. Returns the number hit.
   */
  hitLightsInCircle(x: number, y: number, r: number, damage: number, cooldown?: number): number;
  hitLightsInBox(left: number, top: number, right: number, bottom: number, damage: number): number;
  /**
   * A direct hit of weapon `w` (#15): `damageEnemy` with `lv.damage`, times `critMultiplier` when a `critChance` roll
   * (`rng`) succeeds, and with `healEveryHits`, 1 HP healed (capped at `maxHp`) on every Nth hit that lands on a live
   * enemy.
   */
  weaponHit(w: OwnedWeapon, lv: WeaponLevel, slot: number, dirX: number, dirY: number): void;
}

/** `amount` times `critMultiplier` when a `critChance` roll on `rng` succeeds; `amount` without a crit chance. */
export function rollCrit(
  rng: Rng,
  amount: number,
  critChance: number,
  critMultiplier: number,
): number {
  return critChance > 0 && rng.next() < critChance ? amount * critMultiplier : amount;
}

export function createWeaponContext(world: World): WeaponContext {
  return {
    get player() {
      return world.player;
    },
    get enemies() {
      return world.enemies;
    },
    get enemyHitTimes() {
      return world.enemyHitTimes;
    },
    get camera() {
      return world.camera;
    },
    get time() {
      return world.time;
    },
    get visuals() {
      return world.weaponVisuals;
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
    hitLightsInCircle: (x, y, r, damage, cooldown) =>
      hitLightsInCircle(world, x, y, r, damage, cooldown),
    hitLightsInBox: (left, top, right, bottom, damage) =>
      hitLightsInBox(world, left, top, right, bottom, damage),
    weaponHit: (w, lv, slot, dirX, dirY) => {
      if (isDead(world, slot)) return;
      const amount = rollCrit(
        world.weaponRng,
        lv.damage,
        lv.critChance ?? 0,
        lv.critMultiplier ?? 1,
      );
      damageEnemy(world, slot, amount, dirX, dirY, lv.knockback);
      const every = lv.healEveryHits ?? 0;
      if (every <= 0) return;
      w.hits++;
      if (w.hits % every !== 0) return;
      const { player } = world;
      player.hp = Math.min(player.maxHp, player.hp + 1);
    },
  };
}
