import { ENEMIES, ENEMY_LIST } from '@vs/shared';
import { ENEMY_FLAG_DEAD, ENEMY_KNOCKBACK_RESIST } from './enemies';
import { spawnFx } from './fx';
import type { World } from './world';

/** Seconds an enemy flashes after a hit (`flash`), and how long the `fx.hit` effect shows. */
export const HIT_FLASH_SEC = 0.1;
/** Seconds an enemy follows its knockback velocity instead of chasing (`kbTime`). */
export const KNOCKBACK_SEC = 0.12;
/** Seconds the `fx.enemyDeath` puff shows. */
export const DEATH_FX_SEC = 0.3;

/** Flash time below this counts as none, so float drift never adds a step to the flash. */
const EPSILON = 1e-6;

const ENEMY_XP = Float32Array.from(ENEMY_LIST, (id) => ENEMIES[id].xp);

export function isDead(world: Pick<World, 'enemies'>, slot: number): boolean {
  return ((world.enemies.cols.flags[slot] ?? 0) & ENEMY_FLAG_DEAD) !== 0;
}

/**
 * Damages the live enemy in `slot` (#10): HP down by `amount`, a hit flash and `fx.hit`, and, with `knockback > 0`, a
 * push along the unit direction (`dirX`, `dirY`) scaled by `1 - knockbackResist` for `KNOCKBACK_SEC`. At 0 HP it only
 * marks the enemy dead (flag bit 1); `cleanupSystem` removes it at the end of the step, so slots never shift while
 * systems iterate, and further hits on a dead enemy in the same step do nothing. Counts the hit in `world.damageDealt`
 * (#12). `source` is the weapon slot that dealt it, or -1 for other damage (Rosary, #16); a weapon's damage, up to the
 * enemy's remaining HP, is added to `world.runStats.damageBySlot` (#17).
 */
export function damageEnemy(
  world: World,
  slot: number,
  amount: number,
  dirX: number,
  dirY: number,
  knockback: number,
  source: number,
): void {
  if (isDead(world, slot)) return;
  world.damageDealt.hits++;
  world.damageDealt.total += amount;
  const { cols } = world.enemies;
  const before = cols.hp[slot] ?? 0;
  if (source >= 0) {
    const { damageBySlot } = world.runStats;
    damageBySlot[source] = (damageBySlot[source] ?? 0) + Math.max(0, Math.min(amount, before));
  }
  const hp = before - amount;
  cols.hp[slot] = hp;
  cols.flash[slot] = HIT_FLASH_SEC;
  if (knockback > 0) {
    const impulse = knockback * (1 - (ENEMY_KNOCKBACK_RESIST[cols.type[slot] ?? 0] ?? 0));
    cols.kbX[slot] = dirX * impulse;
    cols.kbY[slot] = dirY * impulse;
    cols.kbTime[slot] = KNOCKBACK_SEC;
  }
  spawnFx(world, 'fx.hit', cols.x[slot] ?? 0, cols.y[slot] ?? 0, 0, false, HIT_FLASH_SEC);
  if (hp <= 0) cols.flags[slot] = (cols.flags[slot] ?? 0) | ENEMY_FLAG_DEAD;
}

/**
 * The last combat system of a step (#10): counts every hit flash down, and removes each dead enemy, iterating
 * backwards: one `enemyKilled` event (`x`, `y`, `enemyId`, `xp`, and `flags` for the chest drop, #15), one kill in `world.stats`, an `fx.enemyDeath` puff,
 * then its paint is unbound. Systems that consume `enemyKilled` (gem drops, #11) run after it.
 */
export function cleanupSystem(world: World, dt: number): void {
  const { enemies, enemyBinding } = world;
  const { x, y, type, flash, flags } = enemies.cols;
  for (let i = enemies.count - 1; i >= 0; i--) {
    if ((flash[i] ?? 0) > 0) {
      const left = (flash[i] ?? 0) - dt;
      flash[i] = left > EPSILON ? left : 0;
    }
    if (((flags[i] ?? 0) & ENEMY_FLAG_DEAD) === 0) continue;
    const t = type[i] ?? 0;
    const event = world.events.push('enemyKilled');
    event.x = x[i] ?? 0;
    event.y = y[i] ?? 0;
    event.enemyId = ENEMY_LIST[t] ?? null;
    event.xp = ENEMY_XP[t] ?? 0;
    event.flags = flags[i] ?? 0;
    world.stats.kills++;
    spawnFx(world, 'fx.enemyDeath', event.x, event.y, 0, false, DEATH_FX_SEC);
    enemyBinding?.unbind(i);
    enemies.remove(i);
  }
}
