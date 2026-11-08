import { ELITE, ENEMIES, type EnemyId } from '@vs/shared';
import { ENEMY_FLAG_ELITE, spawnEnemy } from '../enemies';
import type { World } from '../world';
import { ringPoint } from './spawner';

const point = { x: 0, y: 0 };

/**
 * Spawns an elite `enemyId` (#15): `ELITE.hp` × its HP, `ELITE.scale` × its size and collision radius, flag bit 2
 * (contact damage applies `ELITE.damage`, and its death drops a chest). `'player'` places it on the spawn ring
 * (`world.spawnRng`); a point is used as given. Returns the slot, or -1 at `ENEMY_CAP` or for a boss, which is never
 * an elite. Used by #17's schedule and #21's Elite Call.
 */
export function spawnElite(
  world: World,
  enemyId: EnemyId,
  near: 'player' | { x: number; y: number },
): number {
  const def = ENEMIES[enemyId];
  if (def.boss) return -1;
  if (near === 'player') ringPoint(world.camera, world.spawnRng, point);
  else {
    point.x = near.x;
    point.y = near.y;
  }
  const slot = spawnEnemy(world, enemyId, point.x, point.y);
  if (slot < 0) return -1;
  const { cols } = world.enemies;
  cols.hp[slot] = def.maxHp * ELITE.hp;
  cols.scale[slot] = ELITE.scale;
  cols.flags[slot] = (cols.flags[slot] ?? 0) | ENEMY_FLAG_ELITE;
  return slot;
}
