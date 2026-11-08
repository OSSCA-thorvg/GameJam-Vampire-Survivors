import { MAX_ENEMY_RADIUS } from '@vs/shared';
import { ENEMY_RADIUS } from '../../enemies';
import type { WeaponPatternModule } from './types';

/** The strike box at area 1, in world units: it starts at the player and extends this far to one side. */
export const WHIP_WIDTH = 160;
export const WHIP_HEIGHT = 40;

/** Enemies read per strike. */
const found = new Int32Array(256);

/**
 * Whip (#10): an axis-aligned strike box of `WHIP_WIDTH × WHIP_HEIGHT` scaled by `area`, from the player toward the
 * side the burst started facing; the second shot of a burst (`amount >= 2`) strikes the opposite side. Every enemy
 * whose circle overlaps the box (closest-point test) is hit once per strike, pushed away from the player. Shows
 * `weapon.whip` over the box for `durationSec`, flipped on the left side.
 */
export const whip: WeaponPatternModule = {
  fire(ctx, w, lv, shot) {
    const side = shot % 2 === 0 ? w.burstFacingX : -w.burstFacingX;
    const { x: px, y: py } = ctx.player;
    const width = WHIP_WIDTH * lv.area;
    const halfHeight = (WHIP_HEIGHT * lv.area) / 2;
    const left = side > 0 ? px : px - width;
    const right = left + width;
    const top = py - halfHeight;
    const bottom = py + halfHeight;
    const cx = (left + right) / 2;
    const { x, y, type } = ctx.enemies.cols;
    const n = ctx.query(cx, py, Math.hypot(width / 2, halfHeight) + MAX_ENEMY_RADIUS, found);
    for (let k = 0; k < n; k++) {
      const e = found[k] ?? 0;
      const ex = x[e] ?? 0;
      const ey = y[e] ?? 0;
      const r = ENEMY_RADIUS[type[e] ?? 0] ?? 0;
      const qx = Math.min(Math.max(ex, left), right);
      const qy = Math.min(Math.max(ey, top), bottom);
      if ((ex - qx) ** 2 + (ey - qy) ** 2 > r * r) continue;
      const dx = ex - px;
      const dy = ey - py;
      const d = Math.hypot(dx, dy);
      ctx.damageEnemy(e, lv.damage, d > 0 ? dx / d : side, d > 0 ? dy / d : 0, lv.knockback);
    }
    ctx.spawnFx('weapon.whip', cx, py, 0, side < 0, lv.durationSec, lv.area);
  },
};
