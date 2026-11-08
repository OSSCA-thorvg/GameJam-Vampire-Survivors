import { MOTION_FALL, type ProjectileOptions } from '../../projectiles';
import type { WeaponPatternModule } from './types';

/** Axe hit radius before `area`. */
export const AXE_RADIUS = 14;
/** Launch velocity: sideways drawn from `[-AXE_SPREAD_X, AXE_SPREAD_X)`, upward `AXE_LAUNCH_VY` (initial values). */
export const AXE_SPREAD_X = 120;
export const AXE_LAUNCH_VY = -600;

const opts: ProjectileOptions = {
  damage: 0,
  knockback: 0,
  radius: 0,
  pierce: 1,
  ttl: 0,
  scale: 1,
  motion: MOTION_FALL,
  gravity: 0,
};

/**
 * Axe (#13): each shot is thrown upward from the player with a random sideways velocity (`ctx.rng`) and falls under
 * `gravity` (`MOTION_FALL`), spinning, until its pierce or duration is used up or it drops below the view.
 */
export const axe: WeaponPatternModule = {
  fire(ctx, _w, lv) {
    const { x, y } = ctx.player;
    opts.damage = lv.damage;
    opts.knockback = lv.knockback;
    opts.radius = AXE_RADIUS * lv.area;
    opts.scale = lv.area;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
    opts.gravity = lv.gravity ?? 0;
    const vx = ctx.rng.range(-AXE_SPREAD_X, AXE_SPREAD_X);
    ctx.spawnProjectile('weapon.axe', x, y, vx, AXE_LAUNCH_VY, opts);
  },
};
