import {
  effAmount,
  effArea,
  effCooldown,
  effDamage,
  effDuration,
  effSpeed,
  type StatBlock,
  type WeaponLevel,
} from '@vs/shared';
import type { World } from '../world';
import { PATTERNS } from './patterns/registry';

/** Seconds between the shots of one burst (`amount` shots per cooldown) when the level has no `burstIntervalSec`. */
export const BURST_GAP_SEC = 0.1;
/** Timers below this count as expired, so float drift never adds a step to a cooldown. */
const EPSILON = 1e-6;

/** The effective level handed to the patterns; reused for every weapon, so valid only during the call. */
const effective: WeaponLevel = {
  damage: 0,
  cooldownSec: 0,
  area: 0,
  speed: 0,
  amount: 0,
  durationSec: 0,
  pierce: 0,
  knockback: 0,
};

/**
 * Writes `lv` after the player's stats (#12) into `out`: damage by `might`, area, cooldown, amount, projectile speed
 * and duration (also the projectile lifetime) by their helpers; pierce, knockback and the pattern fields unchanged. With `BASE_STATS`
 * every value equals `lv`'s.
 */
export function applyStats(lv: WeaponLevel, s: Readonly<StatBlock>, out: WeaponLevel): WeaponLevel {
  out.damage = effDamage(lv.damage, s);
  out.cooldownSec = effCooldown(lv.cooldownSec, s);
  out.area = effArea(lv.area, s);
  out.speed = effSpeed(lv.speed, s);
  out.amount = effAmount(lv.amount, s);
  out.durationSec = effDuration(lv.durationSec, s);
  out.pierce = lv.pierce;
  out.knockback = lv.knockback;
  // The pattern-specific fields (#13) are not stats; `area` scales the King Bible's orbit in its pattern.
  out.hitCooldown = lv.hitCooldown;
  out.gravity = lv.gravity;
  out.returnAfter = lv.returnAfter;
  out.orbitRadius = lv.orbitRadius;
  out.burstIntervalSec = lv.burstIntervalSec;
  return out;
}

/**
 * Fires every owned weapon on its own cooldown (#10): when `cooldownLeft` runs out it resets to the level's
 * `cooldownSec` and starts a burst of `amount` shots `burstIntervalSec` (default `BURST_GAP_SEC`) apart, the first in
 * the same step. Each shot calls the weapon's pattern module; its optional `update` runs every step, and while
 * `activeLeft > 0` (a persistent effect is out, #13) the cooldown holds. Patterns get the level after `player.stats`
 * (`applyStats`, #12).
 */
export function weaponSystem(world: World, dt: number): void {
  const ctx = world.weaponContext;
  for (const w of world.weapons) {
    const base = w.def.levels[w.level - 1];
    const pattern = PATTERNS[w.def.pattern];
    if (!base || !pattern) continue;
    const lv = applyStats(base, world.player.stats, effective);
    pattern.update?.(ctx, w, lv, dt);
    if (w.burstLeft > 0) w.burstTimer -= dt;
    if (w.activeLeft <= 0) w.cooldownLeft -= dt;
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
      w.burstTimer += lv.burstIntervalSec ?? BURST_GAP_SEC;
    }
  }
}
