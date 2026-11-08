import { ENEMIES, ENEMY_CAP, type EnemyId } from '@vs/shared';
import { ENEMY_FLAG_BOSS, ENEMY_FLAG_DEAD, spawnEnemy } from '../enemies';
import type { World } from '../world';
import { RELOCATE_DISTANCE, RELOCATE_INTERVAL_SEC, relocatePoint } from './enemy-relocate';
import { ringPoint } from './spawner';

const point = { x: 0, y: 0 };

/**
 * At `ENEMY_CAP`, removes the live normal enemy farthest from the player (#17), with no gem, no chest and no kill, so a
 * boss or a scheduled elite always gets a slot. Bosses and enemies already marked dead (a kill waiting for
 * `cleanupSystem`) are never removed. Does nothing below the cap.
 */
export function makeRoomForEnemy(world: World): void {
  const { enemies, player } = world;
  if (enemies.count < ENEMY_CAP) return;
  const { x, y, flags } = enemies.cols;
  let farthest = -1;
  let best = -1;
  for (let i = 0; i < enemies.count; i++) {
    if (((flags[i] ?? 0) & (ENEMY_FLAG_BOSS | ENEMY_FLAG_DEAD)) !== 0) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > best) {
      best = d2;
      farthest = i;
    }
  }
  if (farthest < 0) return;
  world.enemyBinding?.unbind(farthest);
  enemies.remove(farthest);
}

/**
 * Spawns the boss `enemyId` on the spawn ring (`world.spawnRng`) with flag bit 0 (#15): never relocated or despawned,
 * tethered by `bossTetherSystem`, and its death drops a chest. At `ENEMY_CAP` it takes the farthest normal enemy's slot
 * (`makeRoomForEnemy`, #17). Returns the slot, or -1 for an enemy that is not a boss or a field full of bosses.
 */
export function spawnBoss(world: World, enemyId: EnemyId): number {
  if (!ENEMIES[enemyId].boss) return -1;
  makeRoomForEnemy(world);
  ringPoint(world.camera, world.spawnRng, point);
  const slot = spawnEnemy(world, enemyId, point.x, point.y);
  if (slot < 0) return -1;
  world.enemies.cols.flags[slot] = (world.enemies.cols.flags[slot] ?? 0) | ENEMY_FLAG_BOSS;
  return slot;
}

/**
 * The boss tether (#15): every `RELOCATE_INTERVAL_SEC`, a boss farther than `RELOCATE_DISTANCE` from the player is
 * moved to a spawn-ring point, ahead of the player when it is moving (`relocatePoint`, the relocation's own helper).
 * HP and everything else are kept; bosses are never despawned.
 */
export function bossTetherSystem(world: World, dt: number): void {
  world.tetherTimer -= dt;
  if (world.tetherTimer > 0) return;
  world.tetherTimer += RELOCATE_INTERVAL_SEC;
  const { enemies, player } = world;
  const { x, y, flags } = enemies.cols;
  const limit2 = RELOCATE_DISTANCE * RELOCATE_DISTANCE;
  for (let i = 0; i < enemies.count; i++) {
    if (((flags[i] ?? 0) & ENEMY_FLAG_BOSS) === 0) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy <= limit2) continue;
    relocatePoint(world, point);
    x[i] = point.x;
    y[i] = point.y;
  }
}
