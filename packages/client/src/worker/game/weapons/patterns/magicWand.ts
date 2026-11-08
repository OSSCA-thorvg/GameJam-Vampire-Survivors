import type { ProjectileOptions } from '../../projectiles';
import type { WeaponPatternModule } from './types';

/** Targets are looked for within this distance of the player (initial value, tune against footage). */
export const WAND_RANGE = 900;
export const WAND_BOLT_RADIUS = 6;

/** Reused for every shot; `spawnProjectile` copies it. */
const opts: ProjectileOptions = {
  damage: 0,
  knockback: 0,
  radius: WAND_BOLT_RADIUS,
  pierce: 1,
  ttl: 0,
};

/**
 * Magic Wand (#10): each shot flies at `speed` toward the nearest enemy within `WAND_RANGE`, or along the player's
 * last movement direction when there is none, hitting up to `pierce` enemies within `durationSec`.
 */
export const magicWand: WeaponPatternModule = {
  fire(ctx, _w, lv) {
    const { x, y, lastDirX, lastDirY } = ctx.player;
    let dirX = lastDirX;
    let dirY = lastDirY;
    const target = ctx.nearest(x, y, WAND_RANGE);
    if (target >= 0) {
      const dx = (ctx.enemies.cols.x[target] ?? 0) - x;
      const dy = (ctx.enemies.cols.y[target] ?? 0) - y;
      const d = Math.hypot(dx, dy);
      if (d > 0) {
        dirX = dx / d;
        dirY = dy / d;
      }
    }
    opts.damage = lv.damage;
    opts.knockback = lv.knockback;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
    ctx.spawnProjectile('weapon.magicWand', x, y, dirX * lv.speed, dirY * lv.speed, opts);
  },
};
