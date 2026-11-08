import { ENEMY_SPEED, enemyRadius } from '../enemies';
import type { World } from '../world';
import { isFrozen } from './freeze';

/** Neighbours read per enemy for separation; extra ones in a dense pile are ignored. */
const neighbours = new Int32Array(32);
/**
 * Push strength per unit of overlap, and the cap on the summed push as a multiple of the enemy's speed. The plan's
 * 4 and 1× let the chase compress a crowd onto the player (50 bats collapsed within 2 units); 8 and 2× keep 50 bats
 * at least 1.5 radii apart after 2 s (`separation.test.ts`). Initial values, tune against footage.
 */
const SEPARATION_GAIN = 8;
const SEPARATION_CAP = 2;
/** Golden angle, for a deterministic push direction between enemies at exactly the same point. */
const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Chase and separation (#8): each enemy walks toward the player at its speed, pushed apart from overlapping
 * neighbours (capped at twice its speed), or follows its knockback while `kbTime > 0` (#10). Velocities are computed from
 * the positions at the start of the step, then integrated. While an Orologion freeze lasts (#16) enemies neither chase
 * nor separate, but knockback still moves them; a standing enemy keeps the facing it had.
 */
export function enemyMovementSystem(world: World, dt: number): void {
  const { enemies, enemyGrid, player } = world;
  const { x, y, vx, vy, type, kbX, kbY, kbTime, flip } = enemies.cols;
  const count = enemies.count;
  const frozen = isFrozen(world);
  enemyGrid.rebuild(x, y, count);
  for (let i = 0; i < count; i++) {
    if ((kbTime[i] ?? 0) > 0) {
      vx[i] = kbX[i] ?? 0;
      vy[i] = kbY[i] ?? 0;
      kbTime[i] = (kbTime[i] ?? 0) - dt;
      continue;
    }
    if (frozen) {
      vx[i] = 0;
      vy[i] = 0;
      continue;
    }
    const px = x[i] ?? 0;
    const py = y[i] ?? 0;
    const speed = ENEMY_SPEED[type[i] ?? 0] ?? 0;
    const radius = enemyRadius(enemies.cols, i);
    const toX = player.x - px;
    const toY = player.y - py;
    const toLen = Math.hypot(toX, toY);
    let cx = toLen > 0 ? (toX / toLen) * speed : 0;
    let cy = toLen > 0 ? (toY / toLen) * speed : 0;
    let sx = 0;
    let sy = 0;
    const found = enemyGrid.query(px, py, radius * 2, neighbours);
    for (let n = 0; n < found; n++) {
      const j = neighbours[n] ?? i;
      if (j === i) continue;
      const dx = px - (x[j] ?? 0);
      const dy = py - (y[j] ?? 0);
      const d = Math.hypot(dx, dy);
      const push = (2 * radius - d) * SEPARATION_GAIN;
      if (d > 0) {
        sx += (dx / d) * push;
        sy += (dy / d) * push;
      } else {
        // Same point: push along an angle fixed by the pair, opposite for the other enemy, so they split.
        const angle = GOLDEN_ANGLE * (Math.min(i, j) * 31 + Math.max(i, j));
        const sign = i < j ? 1 : -1;
        sx += Math.cos(angle) * push * sign;
        sy += Math.sin(angle) * push * sign;
      }
    }
    const sLen = Math.hypot(sx, sy);
    if (sLen > speed * SEPARATION_CAP) {
      sx = (sx / sLen) * speed * SEPARATION_CAP;
      sy = (sy / sLen) * speed * SEPARATION_CAP;
    }
    cx += sx;
    cy += sy;
    vx[i] = cx;
    vy[i] = cy;
  }
  for (let i = 0; i < count; i++) {
    x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
    y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
    if (!frozen || (vx[i] ?? 0) !== 0) flip[i] = (vx[i] ?? 0) < 0 ? 1 : 0;
  }
}
