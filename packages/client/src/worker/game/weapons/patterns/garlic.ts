import { MAX_ENEMY_RADIUS } from '@vs/shared';
import { enemyRadius } from '../../enemies';
import type { WeaponPatternModule } from './types';

/** The aura's hit radius at area 1, in world units (half the 100×100 `weapon.garlic` art). */
export const GARLIC_RADIUS = 50;

/**
 * Where the visible ring edge of the `weapon.garlic` art sits, as a fraction of its 50-unit half-size (#91). Measured
 * on `assets/weapons/garlic.png` (400×400 pixels): the angle-averaged alpha profile around the centre last reaches 50%
 * of its peak at r = 156.25 of 200 pixels (0.781). The aura is drawn `1 / GARLIC_ART_RING_RATIO` larger, so the ring
 * edge lies on the hit radius.
 */
export const GARLIC_ART_RING_RATIO = 0.78;

/**
 * The same for the Soul Eater art (#15), measured the same way on `assets/weapons/soul-eater.png` (560×560 pixels, 140
 * units): 50% of the peak last at r = 224 of 280 pixels (0.80), so its visible ring is 56 units at scale 1.
 */
export const SOUL_EATER_ART_RING_RATIO = 0.8;
const SOUL_EATER_HALF_SIZE = 70;

/**
 * The drawn scale of the aura art for a given `area`, so that its visible ring edge is `GARLIC_RADIUS × area`: the
 * `weapon.garlic` art, or the larger `weapon.soulEater` art once evolved (#15).
 */
export function garlicDrawScale(area: number, evolved = false): number {
  return evolved
    ? (area * GARLIC_RADIUS) / (SOUL_EATER_HALF_SIZE * SOUL_EATER_ART_RING_RATIO)
    : area / GARLIC_ART_RING_RATIO;
}

/** Enemies read per tick. */
const found = new Int32Array(512);

/**
 * Garlic (#13): an aura always shown around the player, its drawn ring on the hit radius (`garlicDrawScale`, #91;
 * `ctx.visuals.garlic`). Each burst (its cooldown is the damage tick; `amount` adds nothing) damages every enemy
 * overlapping the circle of `GARLIC_RADIUS × area` and pushes it away from the player;
 * light sources in the circle are hit too (#16).
 */
export const garlic: WeaponPatternModule = {
  fire(ctx, w, lv, shot) {
    if (shot > 0) return;
    const {
      player: { x: px },
      attackY: py,
    } = ctx;
    const radius = GARLIC_RADIUS * lv.area;
    const { cols } = ctx.enemies;
    const { x: ex, y: ey } = cols;
    const count = ctx.query(px, py, radius + MAX_ENEMY_RADIUS, found);
    for (let k = 0; k < count; k++) {
      const e = found[k] ?? 0;
      const r = radius + enemyRadius(cols, e);
      const dx = (ex[e] ?? 0) - px;
      const dy = (ey[e] ?? 0) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2);
      ctx.weaponHit(w, lv, e, d > 0 ? dx / d : 1, d > 0 ? dy / d : 0);
    }
    ctx.hitLightsInCircle(px, py, radius, lv.damage);
  },
  update(ctx, w, lv) {
    const { garlic: aura } = ctx.visuals;
    aura.shown = true;
    aura.evolved = w.def.evolved === true;
    aura.scale = garlicDrawScale(lv.area, aura.evolved);
  },
};
