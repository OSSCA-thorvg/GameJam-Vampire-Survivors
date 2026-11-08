import type { World } from '../world';
import { PATTERNS } from './patterns/registry';

/** Seconds between the shots of one burst (`amount` shots per cooldown). */
export const BURST_GAP_SEC = 0.1;
/** Timers below this count as expired, so float drift never adds a step to a cooldown. */
const EPSILON = 1e-6;

/**
 * Fires every owned weapon on its own cooldown (#10): when `cooldownLeft` runs out it resets to the level's
 * `cooldownSec` and starts a burst of `amount` shots `BURST_GAP_SEC` apart, the first in the same step. Each shot calls
 * the weapon's pattern module; its optional `update` runs every step.
 */
export function weaponSystem(world: World, dt: number): void {
  const ctx = world.weaponContext;
  for (const w of world.weapons) {
    const lv = w.def.levels[w.level - 1];
    const pattern = PATTERNS[w.def.pattern];
    if (!lv || !pattern) continue;
    pattern.update?.(ctx, w, lv, dt);
    if (w.burstLeft > 0) w.burstTimer -= dt;
    w.cooldownLeft -= dt;
    if (w.cooldownLeft <= EPSILON) {
      w.cooldownLeft = lv.cooldownSec;
      w.burstLeft = lv.amount;
      w.burstTimer = 0;
      w.shot = 0;
      w.burstFacingX = world.player.facingX;
    }
    while (w.burstLeft > 0 && w.burstTimer <= EPSILON) {
      pattern.fire(ctx, w, lv, w.shot);
      w.shot++;
      w.burstLeft--;
      w.burstTimer += BURST_GAP_SEC;
    }
  }
}
