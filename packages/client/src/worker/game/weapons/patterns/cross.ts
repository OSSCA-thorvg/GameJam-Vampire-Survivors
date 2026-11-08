import { MOTION_RETURN, type ProjectileAssetId, type ProjectileOptions } from '../../projectiles';
import { aimAt } from './aim';
import type { WeaponPatternModule } from './types';

/** Cross hit radius before `area`. */
export const CROSS_RADIUS = 14;
/** Targets are looked for within this distance of the player (initial value, tune against footage). */
export const CROSS_RANGE = 900;

const opts: ProjectileOptions = {
  damage: 0,
  weaponSlot: 0,
  knockback: 0,
  radius: 0,
  pierce: 1,
  ttl: 0,
  scale: 1,
  motion: MOTION_RETURN,
  returnAfter: 0,
};

/**
 * Cross (#13): each shot is aimed at the nearest enemy within `CROSS_RANGE` (or along the last movement direction),
 * slows, turns after `returnAfter` seconds and flies back past the player (`MOTION_RETURN`), hitting each enemy at
 * most once each way.
 */
export const cross: WeaponPatternModule = {
  fire(ctx, w, lv) {
    const { x, y } = ctx.player;
    const dir = aimAt(ctx, ctx.nearest(x, y, CROSS_RANGE));
    opts.damage = lv.damage;
    opts.weaponSlot = w.slot;
    opts.knockback = lv.knockback;
    opts.radius = CROSS_RADIUS * lv.area;
    opts.scale = lv.area;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
    opts.returnAfter = lv.returnAfter ?? 0;
    opts.critChance = lv.critChance ?? 0;
    opts.critMultiplier = lv.critMultiplier ?? 1;
    ctx.spawnProjectile(
      w.def.assetId as ProjectileAssetId,
      x,
      y,
      dir.x * lv.speed,
      dir.y * lv.speed,
      opts,
    );
  },
};
