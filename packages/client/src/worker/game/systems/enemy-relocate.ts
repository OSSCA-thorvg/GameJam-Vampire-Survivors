import { VIEW_HEIGHT, VIEW_WIDTH } from '../../constants';
import { ENEMY_FLAG_BOSS } from '../enemies';
import type { World } from '../world';
import { ringPoint } from './spawner';

/** Enemies farther than this from the player are relocated (#8). */
export const RELOCATE_DISTANCE = Math.max(VIEW_WIDTH, VIEW_HEIGHT) * 0.75 + 400;
/** Simulated seconds between relocation passes. */
export const RELOCATE_INTERVAL_SEC = 0.5;
/** Ring draws per enemy looking for a point ahead of the player before taking the last one. */
const AHEAD_TRIES = 8;

const point = { x: 0, y: 0 };

/**
 * Every `RELOCATE_INTERVAL_SEC`, moves non-boss enemies left far behind to the spawn ring, ahead of the player when it
 * is moving. HP and type are unchanged. Draws only from `world.relocateRng`, so the spawn stream never shifts.
 */
export function enemyRelocateSystem(world: World, dt: number): void {
  world.relocateTimer -= dt;
  if (world.relocateTimer > 0) return;
  world.relocateTimer += RELOCATE_INTERVAL_SEC;
  const { enemies, player, camera, relocateRng } = world;
  const { x, y, flags } = enemies.cols;
  const limit2 = RELOCATE_DISTANCE * RELOCATE_DISTANCE;
  const moving = player.dirX !== 0 || player.dirY !== 0;
  for (let i = 0; i < enemies.count; i++) {
    if (((flags[i] ?? 0) & ENEMY_FLAG_BOSS) !== 0) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy <= limit2) continue;
    for (let attempt = 0; attempt < AHEAD_TRIES; attempt++) {
      ringPoint(camera, relocateRng, point);
      if (!moving) break;
      if ((point.x - player.x) * player.dirX + (point.y - player.y) * player.dirY > 0) break;
    }
    x[i] = point.x;
    y[i] = point.y;
  }
}
