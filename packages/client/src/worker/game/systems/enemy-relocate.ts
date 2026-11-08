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
 * Writes a spawn-ring point into `out` (`world.relocateRng`), on the half the player is moving toward when it moves:
 * up to `AHEAD_TRIES` draws, then the last one. Shared by the relocation and #15's boss tether.
 */
export function relocatePoint(
  world: Pick<World, 'player' | 'camera' | 'relocateRng'>,
  out: { x: number; y: number },
): void {
  const { player, camera, relocateRng } = world;
  const moving = player.dirX !== 0 || player.dirY !== 0;
  for (let attempt = 0; attempt < AHEAD_TRIES; attempt++) {
    ringPoint(camera, relocateRng, out);
    if (!moving) return;
    if ((out.x - player.x) * player.dirX + (out.y - player.y) * player.dirY > 0) return;
  }
}

/**
 * Every `RELOCATE_INTERVAL_SEC`, moves non-boss enemies left far behind to the spawn ring, ahead of the player when it
 * is moving (bosses are tethered by `bossTetherSystem`, #15). HP and type are unchanged. Draws only from `world.relocateRng`, so the spawn stream never shifts.
 */
export function enemyRelocateSystem(world: World, dt: number): void {
  world.relocateTimer -= dt;
  if (world.relocateTimer > 0) return;
  world.relocateTimer += RELOCATE_INTERVAL_SEC;
  const { enemies, player } = world;
  const { x, y, flags } = enemies.cols;
  const limit2 = RELOCATE_DISTANCE * RELOCATE_DISTANCE;
  for (let i = 0; i < enemies.count; i++) {
    if (((flags[i] ?? 0) & ENEMY_FLAG_BOSS) !== 0) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy <= limit2) continue;
    relocatePoint(world, point);
    x[i] = point.x;
    y[i] = point.y;
  }
}
