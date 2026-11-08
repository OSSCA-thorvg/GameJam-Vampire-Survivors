import { LIGHT_SOURCE } from '@vs/shared';
import { VIEW_WIDTH } from '../../constants';
import { addLight, removeLight, type LightWorld } from '../light-sources';

const DESPAWN = LIGHT_SOURCE.despawnDistance * VIEW_WIDTH;
const RING_MIN = LIGHT_SOURCE.spawnRingMin * VIEW_WIDTH;
const RING_MAX = LIGHT_SOURCE.spawnRingMax * VIEW_WIDTH;

/**
 * Light sources (#16), after the camera: every `respawnCheckIntervalS` (and on the first step), lights farther than
 * `despawnDistance` view widths from the player are recycled, then intact lights are placed at uniform random points
 * (by area) of the ring between `spawnRingMin` and `spawnRingMax` view widths, drawn from `world.lightRng`, until
 * `targetCount` are intact. When the store is full of broken lights, the farthest broken one makes room.
 */
export function lightSourceSystem(world: LightWorld, dt: number): void {
  world.lightTimer -= dt;
  if (world.lightTimer > 0) return;
  world.lightTimer += LIGHT_SOURCE.respawnCheckIntervalS;
  const { lights, player, lightRng } = world;
  const { x, y, broken } = lights.cols;
  let intact = 0;
  for (let i = lights.count - 1; i >= 0; i--) {
    if (Math.hypot((x[i] ?? 0) - player.x, (y[i] ?? 0) - player.y) > DESPAWN) removeLight(world, i);
    else if (broken[i] === 0) intact++;
  }
  for (; intact < LIGHT_SOURCE.targetCount; intact++) {
    if (lights.count === lights.capacity && !dropFarthestBroken(world)) return;
    const angle = lightRng.next() * Math.PI * 2;
    const r = Math.sqrt(lightRng.range(RING_MIN * RING_MIN, RING_MAX * RING_MAX));
    addLight(world, player.x + Math.cos(angle) * r, player.y + Math.sin(angle) * r);
  }
}

/** Removes the broken light farthest from the player; false when every light is intact. */
function dropFarthestBroken(world: LightWorld): boolean {
  const { lights, player } = world;
  const { x, y, broken } = lights.cols;
  let far = -1;
  let farD = -1;
  for (let i = 0; i < lights.count; i++) {
    if (broken[i] !== 1) continue;
    const d = Math.hypot((x[i] ?? 0) - player.x, (y[i] ?? 0) - player.y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  if (far < 0) return false;
  removeLight(world, far);
  return true;
}
