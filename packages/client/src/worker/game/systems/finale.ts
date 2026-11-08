import { STAGE } from '@vs/shared';
import { ENEMY_FLAG_BOSS } from '../enemies';
import type { World } from '../world';
import { spawnBoss } from './bosses';

/** `time` this close below the limit counts as reached, so float drift never delays the finale by a step. */
const EPSILON = 1e-6;

/**
 * The time limit (#17), before the spawner: the first step at `STAGE.durationSec` sets `world.cleared` (which stops
 * the spawner and the stage events) and removes every enemy without the boss flag, with no gem, no chest and no kill.
 * With `finale: 'death'` it then spawns `STAGE.deathEnemyId` and the run goes on until the player dies; with
 * `finale: 'end'` (versus, ADR 0005) it sets `world.state` to `'ended'`, so `world.step` stops and reports the game
 * over with `cleared: true`.
 */
export function finaleSystem(world: World): void {
  if (world.cleared || world.time < STAGE.durationSec - EPSILON) return;
  world.cleared = true;
  world.spawnQueue = 0;
  const { enemies, enemyBinding } = world;
  const { flags } = enemies.cols;
  for (let i = enemies.count - 1; i >= 0; i--) {
    if (((flags[i] ?? 0) & ENEMY_FLAG_BOSS) !== 0) continue;
    enemyBinding?.unbind(i);
    enemies.remove(i);
  }
  if (world.finale === 'end') {
    world.state = 'ended';
    return;
  }
  spawnBoss(world, STAGE.deathEnemyId);
}
