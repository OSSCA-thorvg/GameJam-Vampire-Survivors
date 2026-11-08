import { ELITE, HIT_INVULN_SEC, MAX_ENEMY_RADIUS, PLAYER_RADIUS } from '@vs/shared';
import {
  ENEMY_CONTACT_DAMAGE,
  ENEMY_FLAG_ELITE,
  ENEMY_IGNORES_ARMOR,
  enemyRadius,
} from '../enemies';
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
 * `'dead'`; `world.step` then stops and reports the game over once. Deals nothing while frozen (#16). An elite deals
 * `ELITE.damage` times its type's damage (#15); an `ignoresArmor` enemy (Death, #17) skips the armor subtraction.
 * Does nothing while the dev-only `world.debugInvulnerable` is set (`I` key, #15, #17). Reads `world.enemyGrid`,
 * rebuilt this step by the movement system.
 */
export function contactDamageSystem(world: World, dt: number): void {
  const { player } = world;
  if (world.debugInvulnerable) return;
  if (player.invulnTime > 0) {
    player.invulnTime -= dt;
    if (player.invulnTime > EPSILON) return;
    player.invulnTime = 0;
  }
  // A frozen enemy deals no contact damage (#16, Orologion).
  if (isFrozen(world)) return;
  const { cols } = world.enemies;
  const { x, y, type, flags } = cols;
  const found = world.enemyGrid.query(
    player.x,
    player.y,
    PLAYER_RADIUS + MAX_ENEMY_RADIUS,
    touching,
  );
  let damage = 0;
  let ignoresArmor = false;
  for (let n = 0; n < found; n++) {
    const i = touching[n] ?? 0;
    const t = type[i] ?? 0;
    const reach = PLAYER_RADIUS + enemyRadius(cols, i);
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy >= reach * reach) continue;
    const elite = ((flags[i] ?? 0) & ENEMY_FLAG_ELITE) !== 0;
    const hit = (ENEMY_CONTACT_DAMAGE[t] ?? 0) * (elite ? ELITE.damage : 1);
    if (hit <= damage) continue;
    damage = hit;
    ignoresArmor = ENEMY_IGNORES_ARMOR[t] === 1;
  }
  if (damage <= 0) return;
  const amount = ignoresArmor ? damage : Math.max(1, damage - player.armor);
  player.hp = Math.max(0, player.hp - amount);
  player.invulnTime = HIT_INVULN_SEC;
  const event = world.events.push('playerHit');
  event.x = player.x;
  event.y = player.y;
  event.amount = amount;
  if (player.hp <= 0) world.state = 'dead';
}
