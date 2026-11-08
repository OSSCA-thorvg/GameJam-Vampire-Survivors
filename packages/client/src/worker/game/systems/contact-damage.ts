import { HIT_INVULN_SEC, MAX_ENEMY_RADIUS, PLAYER_RADIUS } from '@vs/shared';
import { ENEMY_CONTACT_DAMAGE, ENEMY_RADIUS } from '../enemies';
import type { World } from '../world';
import { isFrozen } from './freeze';

/** Enemies read per contact check; a crowd larger than this around the player still lands its one hit. */
const touching = new Int32Array(64);
/** Remaining invulnerability below this counts as none, so float drift does not add a step to the window. */
const EPSILON = 1e-6;

/**
 * Contact damage (#9): while not invulnerable, the strongest enemy touching the player (centre distance below
 * `PLAYER_RADIUS + radius`) deals `max(1, contactDamage - armor)`, then the player is invulnerable for
 * `HIT_INVULN_SEC`, so a crowd lands one hit per window. Pushes a `playerHit` event. At 0 HP it sets `world.state` to
 * `'dead'`; `world.step` then stops and reports the game over once. Deals nothing while frozen (#16). Reads `world.enemyGrid`, rebuilt this step by the movement system.
 */
export function contactDamageSystem(world: World, dt: number): void {
  const { player } = world;
  if (player.invulnTime > 0) {
    player.invulnTime -= dt;
    if (player.invulnTime > EPSILON) return;
    player.invulnTime = 0;
  }
  // A frozen enemy deals no contact damage (#16, Orologion).
  if (isFrozen(world)) return;
  const { x, y, type } = world.enemies.cols;
  const found = world.enemyGrid.query(
    player.x,
    player.y,
    PLAYER_RADIUS + MAX_ENEMY_RADIUS,
    touching,
  );
  let damage = 0;
  for (let n = 0; n < found; n++) {
    const i = touching[n] ?? 0;
    const t = type[i] ?? 0;
    const reach = PLAYER_RADIUS + (ENEMY_RADIUS[t] ?? 0);
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy >= reach * reach) continue;
    damage = Math.max(damage, ENEMY_CONTACT_DAMAGE[t] ?? 0);
  }
  if (damage <= 0) return;
  const amount = Math.max(1, damage - player.armor);
  player.hp = Math.max(0, player.hp - amount);
  player.invulnTime = HIT_INVULN_SEC;
  const event = world.events.push('playerHit');
  event.x = player.x;
  event.y = player.y;
  event.amount = amount;
  if (player.hp <= 0) world.state = 'dead';
}
