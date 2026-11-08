import type { ProjectileOptions } from '../../projectiles';
import type { WeaponPatternModule } from './types';

/** Knife hit radius before `area`. */
export const KNIFE_RADIUS = 6;
/** Sideways spacing of a burst's knives, in world units. */
export const KNIFE_SPREAD = 6;

/** Reused for every shot; `spawnProjectile` copies it. */
const opts: ProjectileOptions = { damage: 0, knockback: 0, radius: 0, pierce: 1, ttl: 0, scale: 1 };

/**
 * Knife (#13): each shot flies at `speed` along the player's last movement direction. Shot `k` of a burst starts
 * `KNIFE_SPREAD × ceil(k / 2)` units to the side of the player, odd shots on one side and even shots on the other, so
 * a burst fans into parallel lines.
 */
export const knife: WeaponPatternModule = {
  fire(ctx, _w, lv, shot) {
    const { x, y, lastDirX: dirX, lastDirY: dirY } = ctx.player;
    const offset = KNIFE_SPREAD * Math.ceil(shot / 2) * (shot % 2 === 1 ? 1 : -1);
    opts.damage = lv.damage;
    opts.knockback = lv.knockback;
    opts.radius = KNIFE_RADIUS * lv.area;
    opts.scale = lv.area;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
    ctx.spawnProjectile(
      'weapon.knife',
      x - dirY * offset,
      y + dirX * offset,
      dirX * lv.speed,
      dirY * lv.speed,
      opts,
    );
  },
};
