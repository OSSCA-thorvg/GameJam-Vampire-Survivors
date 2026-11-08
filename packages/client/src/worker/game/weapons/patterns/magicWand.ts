import type { ProjectileAssetId, ProjectileOptions } from '../../projectiles';
import { aimAt } from './aim';
import type { WeaponPatternModule } from './types';

/** Targets are looked for within this distance of the player (initial value, tune against footage). */
export const WAND_RANGE = 900;
export const WAND_BOLT_RADIUS = 6;

/** Reused for every shot; `spawnProjectile` copies it. */
const opts: ProjectileOptions = {
  damage: 0,
  weaponSlot: 0,
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
  fire(ctx, w, lv) {
    const { x, y } = ctx.player;
    const dir = aimAt(ctx, ctx.nearest(x, y, WAND_RANGE));
    opts.damage = lv.damage;
    opts.weaponSlot = w.slot;
    opts.knockback = lv.knockback;
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
