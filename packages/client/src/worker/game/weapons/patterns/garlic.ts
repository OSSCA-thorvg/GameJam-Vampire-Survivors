import { MAX_ENEMY_RADIUS } from '@vs/shared';
import { ENEMY_RADIUS } from '../../enemies';
import type { WeaponPatternModule } from './types';

/** The aura's radius at area 1, in world units: the 100×100 `weapon.garlic` art at scale 1. */
export const GARLIC_RADIUS = 50;

/** Enemies read per tick. */
const found = new Int32Array(512);

/**
 * Garlic (#13): an aura always shown around the player, scaled by `area` (`ctx.visuals.garlic`). Each burst (its
 * cooldown is the damage tick; `amount` adds nothing) damages every enemy overlapping the circle of
 * `GARLIC_RADIUS × area` and pushes it away from the player.
 */
export const garlic: WeaponPatternModule = {
  fire(ctx, _w, lv, shot) {
    if (shot > 0) return;
    const { x: px, y: py } = ctx.player;
    const radius = GARLIC_RADIUS * lv.area;
    const { x: ex, y: ey, type } = ctx.enemies.cols;
    const count = ctx.query(px, py, radius + MAX_ENEMY_RADIUS, found);
    for (let k = 0; k < count; k++) {
      const e = found[k] ?? 0;
      const r = radius + (ENEMY_RADIUS[type[e] ?? 0] ?? 0);
      const dx = (ex[e] ?? 0) - px;
      const dy = (ey[e] ?? 0) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2);
      ctx.damageEnemy(e, lv.damage, d > 0 ? dx / d : 1, d > 0 ? dy / d : 0, lv.knockback);
    }
  },
  update(ctx, _w, lv) {
    const { garlic: aura } = ctx.visuals;
    aura.shown = true;
    aura.scale = lv.area;
  },
};
