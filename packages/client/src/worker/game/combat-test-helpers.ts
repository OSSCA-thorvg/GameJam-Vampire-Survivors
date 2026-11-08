import type { EnemyId } from '@vs/shared';
import { spawnEnemy } from './enemies';
import { createWorld, type World } from './world';

/** A world with no weapons, no spawns and no enemies, for driving combat systems one at a time. */
export function quietWorld(seed = 1): World {
  const world = createWorld({ seed });
  world.weapons.length = 0;
  world.spawnTimer = 1e9;
  return world;
}

/** Spawns a stationary target with `hp` and returns its slot; call `indexEnemies` before querying. */
export function target(world: World, id: EnemyId, x: number, y: number, hp = 1000): number {
  const slot = spawnEnemy(world, id, x, y);
  world.enemies.cols.hp[slot] = hp;
  return slot;
}

/** Rebuilds the enemy grid from the current positions, as the movement system does each step. */
export function indexEnemies(world: World): void {
  const { x, y } = world.enemies.cols;
  world.enemyGrid.rebuild(x, y, world.enemies.count);
}

/** HP per enemy UID, so checks survive swap-removal. */
export function hpByUid(world: World): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < world.enemies.count; i++)
    out.set(world.enemies.uid[i] ?? -1, world.enemies.cols.hp[i] ?? NaN);
  return out;
}
