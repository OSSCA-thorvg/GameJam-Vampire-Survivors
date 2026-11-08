import { ENEMY_FLAG_DEAD } from '../../enemies';
import type { ProjectileAssetId, ProjectileOptions } from '../../projectiles';
import { aimAt } from './aim';
import type { WeaponPatternModule } from './types';

/** Fireball hit radius before `area`. */
export const FIREBALL_RADIUS = 10;

const opts: ProjectileOptions = {
  damage: 0,
  weaponSlot: 0,
  knockback: 0,
  radius: 0,
  pierce: 1,
  ttl: 0,
  scale: 1,
};

/**
 * Fire Wand (#13): each shot flies at `speed` toward a random live enemy inside the view (one pass over the enemy
 * store, reservoir sampling with `ctx.rng`), or along the last movement direction when none is on screen.
 */
export const fireWand: WeaponPatternModule = {
  fire(ctx, w, lv) {
    const { x, y } = ctx.player;
    const { left, top, right, bottom } = ctx.camera.viewRect(0);
    const { x: ex, y: ey, flags } = ctx.enemies.cols;
    let target = -1;
    let seen = 0;
    for (let e = 0; e < ctx.enemies.count; e++) {
      if (((flags[e] ?? 0) & ENEMY_FLAG_DEAD) !== 0) continue;
      const tx = ex[e] ?? 0;
      const ty = ey[e] ?? 0;
      if (tx < left || tx > right || ty < top || ty > bottom) continue;
      seen++;
      if (ctx.rng.int(seen) === 0) target = e;
    }
    const dir = aimAt(ctx, target);
    opts.damage = lv.damage;
    opts.weaponSlot = w.slot;
    opts.knockback = lv.knockback;
    opts.radius = FIREBALL_RADIUS * lv.area;
    opts.scale = lv.area;
    opts.pierce = lv.pierce;
    opts.ttl = lv.durationSec;
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
