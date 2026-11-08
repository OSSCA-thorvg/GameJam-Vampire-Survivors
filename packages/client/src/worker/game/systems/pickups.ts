import {
  GEM_FLY_START_SPEED,
  PICKUP_COLLECT_RADIUS,
  PICKUPS,
  PLAYER_RADIUS,
  type PickupEffect,
} from '@vs/shared';
import { assertNever } from '../../../protocol/assert-never';
import { damageEnemy } from '../combat';
import { ENEMY_FLAG_BOSS } from '../enemies';
import { GEM_FLYING } from '../gems';
import { PICKUP_FAMILY_LIGHT } from '../pickups';
import { recomputeStats } from '../stats';
import type { World } from '../world';
import { freezeEnemies } from './freeze';

const REACH = PICKUP_COLLECT_RADIUS + PLAYER_RADIUS;

/**
 * Collection (#16), after the projectiles and before `cleanupSystem`, so Rosary's kills are removed, counted and drop
 * their gems in the same step, and Vacuum's gems start flying in this step's `gemSystem`: each light-source pickup within `PICKUP_COLLECT_RADIUS + PLAYER_RADIUS` of
 * the player is removed and its effect applied at once. Pickups are not pulled by the gem magnet. Family 1 (#21) is
 * left alone.
 */
export function pickupSystem(world: World): void {
  const { pickups, pickupBinding, player } = world;
  const { x, y, defIdx, family } = pickups.cols;
  for (let i = pickups.count - 1; i >= 0; i--) {
    if (family[i] !== PICKUP_FAMILY_LIGHT) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy > REACH * REACH) continue;
    const def = PICKUPS[defIdx[i] ?? 0];
    pickupBinding?.unbind(i);
    pickups.remove(i);
    if (def) applyPickupEffect(world, def.effect);
  }
}

/** Applies one pickup's effect to `world` (#16). No effect involves gold (ADR 0008). */
export function applyPickupEffect(world: World, effect: PickupEffect): void {
  const { player } = world;
  switch (effect.kind) {
    case 'heal':
      player.hp = Math.min(player.maxHp, player.hp + effect.amount);
      break;
    case 'clearScreen':
      clearScreen(world);
      break;
    case 'freeze':
      freezeEnemies(world, effect.seconds);
      break;
    case 'vacuum':
      vacuumGems(world);
      break;
    case 'stat':
      player.runModifiers.push({ stat: effect.stat, add: effect.add });
      recomputeStats(world);
      break;
    default:
      assertNever(effect);
  }
}

/**
 * Rosary: every non-boss enemy inside `camera.viewRect(0)` takes its remaining HP through `damageEnemy`, so
 * `cleanupSystem` still emits `enemyKilled`, drops its gem and counts the kill. Bosses and off-screen enemies are
 * untouched.
 */
function clearScreen(world: World): void {
  const { left, top, right, bottom } = world.camera.viewRect(0);
  const { x, y, hp, flags } = world.enemies.cols;
  for (let i = 0; i < world.enemies.count; i++) {
    if (((flags[i] ?? 0) & ENEMY_FLAG_BOSS) !== 0) continue;
    const ex = x[i] ?? 0;
    const ey = y[i] ?? 0;
    if (ex < left || ex > right || ey < top || ey > bottom) continue;
    damageEnemy(world, i, Math.max(hp[i] ?? 0, 1), 0, 0, 0);
  }
}

/**
 * Vacuum: every gem on the map at this moment starts flying toward the player at `GEM_FLY_START_SPEED`, as the gem
 * magnet does; `gemSystem` then pulls them in. Gems dropped later are not affected.
 */
function vacuumGems(world: World): void {
  const { gems, player } = world;
  const { x, y, vx, vy, state } = gems.cols;
  for (let i = 0; i < gems.count; i++) {
    if (state[i] === GEM_FLYING) continue;
    state[i] = GEM_FLYING;
    const dx = player.x - (x[i] ?? 0);
    const dy = player.y - (y[i] ?? 0);
    const d = Math.hypot(dx, dy) || 1;
    vx[i] = (dx / d) * GEM_FLY_START_SPEED;
    vy[i] = (dy / d) * GEM_FLY_START_SPEED;
  }
}
