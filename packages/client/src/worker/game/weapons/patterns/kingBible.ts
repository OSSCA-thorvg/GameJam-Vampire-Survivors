import { MAX_ENEMY_RADIUS } from '@vs/shared';
import { ENEMY_RADIUS } from '../../enemies';
import { MAX_BOOKS } from '../visuals';
import type { WeaponPatternModule } from './types';

/** Book hit radius before `area`. */
export const BOOK_RADIUS = 14;

/** Enemies read per book per step. */
const found = new Int32Array(64);
const RAD = Math.PI / 180;

/**
 * King Bible (#13): a persistent effect, not projectiles. Each burst sends the books out for `durationSec`
 * (`activeLeft`; the cooldown holds meanwhile, so the gap after it is visible). While out, `amount` books (at most
 * `MAX_BOOKS`) orbit the player at `orbitRadius × area`, `speed` degrees per second, evenly spaced; each enemy a book
 * overlaps is hit when this weapon has not hit it for `hitCooldown` seconds (`ctx.enemyHitTimes[slot]`), pushed
 * away from the player. Light sources a book overlaps are hit under the same cooldown (#16). Writes the books into `ctx.visuals.books`; none while inactive.
 */
export const kingBible: WeaponPatternModule = {
  fire(_ctx, w, lv, shot) {
    // One activation per burst: `amount` is the number of books, not of activations.
    if (shot === 0) w.activeLeft = lv.durationSec;
  },
  update(ctx, w, lv, dt) {
    const { books } = ctx.visuals;
    w.phase = (w.phase + lv.speed * dt) % 360;
    if (w.activeLeft <= 0) {
      books.count = 0;
      return;
    }
    w.activeLeft -= dt;
    const n = Math.min(MAX_BOOKS, Math.max(0, Math.floor(lv.amount)));
    const orbit = (lv.orbitRadius ?? 0) * lv.area;
    const reach = BOOK_RADIUS * lv.area;
    const cooldown = lv.hitCooldown ?? 0;
    const hitT = ctx.enemyHitTimes[w.slot];
    const { x: px, y: py } = ctx.player;
    const { x: ex, y: ey, type } = ctx.enemies.cols;
    const now = ctx.time;
    for (let i = 0; i < n; i++) {
      const angle = (w.phase + (360 * i) / n) * RAD;
      const bx = px + Math.cos(angle) * orbit;
      const by = py + Math.sin(angle) * orbit;
      books.x[i] = bx;
      books.y[i] = by;
      ctx.hitLightsInCircle(bx, by, reach, lv.damage, cooldown);
      if (!hitT) continue;
      const count = ctx.query(bx, by, reach + MAX_ENEMY_RADIUS, found);
      for (let k = 0; k < count; k++) {
        const e = found[k] ?? 0;
        const r = reach + (ENEMY_RADIUS[type[e] ?? 0] ?? 0);
        const dx = (ex[e] ?? 0) - bx;
        const dy = (ey[e] ?? 0) - by;
        if (dx * dx + dy * dy > r * r || now - (hitT[e] ?? 0) < cooldown) continue;
        hitT[e] = now;
        const ox = (ex[e] ?? 0) - px;
        const oy = (ey[e] ?? 0) - py;
        const d = Math.hypot(ox, oy);
        ctx.damageEnemy(e, lv.damage, d > 0 ? ox / d : 1, d > 0 ? oy / d : 0, lv.knockback);
      }
    }
    books.count = n;
    books.scale = lv.area;
  },
};
