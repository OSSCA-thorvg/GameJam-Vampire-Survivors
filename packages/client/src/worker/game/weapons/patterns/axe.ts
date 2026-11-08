import {
  MOTION_FALL,
  MOTION_STRAIGHT,
  type ProjectileAssetId,
  type ProjectileOptions,
} from '../../projectiles';
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

const DEG = Math.PI / 180;

/**
 * Axe (#13): each shot is thrown upward from the player with a random sideways velocity (`ctx.rng`) and falls under
 * `gravity` (`MOTION_FALL`), spinning, until its pierce or duration is used up or it drops below the view. With
 * `radial` (Death Spiral, #15), shot `k` of `amount` flies straight out at `360·k/amount` degrees and `speed`, with no
 * gravity.
 */
export const axe: WeaponPatternModule = {
  fire(ctx, w, lv, shot) {
    const { x, y } = ctx.player;
    opts.damage = lv.damage;
    opts.knockback = lv.knockback;
    opts.radius = AXE_RADIUS * lv.area;
    opts.scale = lv.area;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
    const art = w.def.assetId as ProjectileAssetId;
    if (lv.radial) {
      const angle = ((360 * shot) / Math.max(1, lv.amount)) * DEG;
      opts.motion = MOTION_STRAIGHT;
      opts.gravity = 0;
      ctx.spawnProjectile(art, x, y, Math.cos(angle) * lv.speed, Math.sin(angle) * lv.speed, opts);
      return;
    }
    opts.motion = MOTION_FALL;
    opts.gravity = lv.gravity ?? 0;
    const vx = ctx.rng.range(-AXE_SPREAD_X, AXE_SPREAD_X);
    ctx.spawnProjectile(art, x, y, vx, AXE_LAUNCH_VY, opts);
  },
};
