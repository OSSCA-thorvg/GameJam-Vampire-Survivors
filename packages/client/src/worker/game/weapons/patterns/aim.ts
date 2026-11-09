import type { WeaponContext } from '../context';

/** The direction `aimAt` wrote last; shared and overwritten by the next call, so aiming allocates nothing. */
const aim = { x: 1, y: 0 };

/**
 * The unit direction from the player's torso to the enemy in `target`, or the player's last movement direction when `target`
 * is -1 or sits at the attack origin. Returns a shared object, valid until the next call.
 */
export function aimAt(
  ctx: WeaponContext,
  target: number,
): { readonly x: number; readonly y: number } {
  const {
    player: { x, lastDirX, lastDirY },
    attackY: y,
  } = ctx;
  aim.x = lastDirX;
  aim.y = lastDirY;
  if (target < 0) return aim;
  const dx = (ctx.enemies.cols.x[target] ?? 0) - x;
  const dy = (ctx.enemies.cols.y[target] ?? 0) - y;
  const d = Math.hypot(dx, dy);
  if (d > 0) {
    aim.x = dx / d;
    aim.y = dy / d;
  }
  return aim;
}
