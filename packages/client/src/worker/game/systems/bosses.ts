import { ENEMIES, type EnemyId } from '@vs/shared';
import { ENEMY_FLAG_BOSS, spawnEnemy } from '../enemies';
import type { World } from '../world';
import { RELOCATE_DISTANCE, RELOCATE_INTERVAL_SEC, relocatePoint } from './enemy-relocate';
import { ringPoint } from './spawner';

const point = { x: 0, y: 0 };

/**
 * Spawns the boss `enemyId` on the spawn ring (`world.spawnRng`) with flag bit 0 (#15): never relocated or despawned,
 * tethered by `bossTetherSystem`, and its death drops a chest. Returns the slot, or -1 at `ENEMY_CAP` or for an enemy
 * that is not a boss.
 */
export function spawnBoss(world: World, enemyId: EnemyId): number {
  if (!ENEMIES[enemyId].boss) return -1;
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
