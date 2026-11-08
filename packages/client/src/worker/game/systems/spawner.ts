import { ENEMY_CAP, STAGE, type Rng, type WaveDef } from '@vs/shared';
import type { Camera } from '../camera';
import { spawnEnemy } from '../enemies';
import type { World } from '../world';

/** Spawn-ring margin: enemies appear this far outside the view, so they never pop in on screen. */
export const SPAWN_MARGIN = 64;
/** Spawns per step at most, to spread the cost of a large top-up. */
export const MAX_SPAWNS_PER_STEP = 20;

/** The last wave with `fromMinute <= minute`. */
export function waveAt(minute: number, waves: readonly WaveDef[] = STAGE.waves): WaveDef {
  let current = waves[0];
  for (const wave of waves) if (wave.fromMinute <= minute) current = wave;
  if (!current) throw new Error('The stage has no waves');
  return current;
}

/**
 * Writes a uniform random point on the perimeter of `camera.viewRect(SPAWN_MARGIN)` into `out` (one draw from `rng`).
 */
export function ringPoint(camera: Camera, rng: Rng, out: { x: number; y: number }): void {
  const { left, top, right, bottom } = camera.viewRect(SPAWN_MARGIN);
  const w = right - left;
  const h = bottom - top;
  let t = rng.next() * 2 * (w + h);
  if (t < w) {
    out.x = left + t;
    out.y = top;
    return;
  }
  t -= w;
  if (t < h) {
    out.x = right;
    out.y = top + t;
    return;
  }
  t -= h;
  if (t < w) {
    out.x = right - t;
    out.y = bottom;
    return;
  }
  out.x = left;
  out.y = bottom - (t - w);
}

function pickEnemy(wave: WaveDef, rng: Rng): WaveDef['enemies'][number]['enemyId'] {
  let total = 0;
  for (const entry of wave.enemies) total += entry.weight;
  let roll = rng.next() * total;
  for (const entry of wave.enemies) {
    roll -= entry.weight;
    if (roll < 0) return entry.enemyId;
  }
  // Only reached through float rounding on the last entry.
  const last = wave.enemies[wave.enemies.length - 1];
  if (!last) throw new Error('A wave needs at least one enemy');
  return last.enemyId;
}

const point = { x: 0, y: 0 };

/**
 * Spawns from the current wave (#8): a batch every `spawnIntervalSec`, plus a top-up to `minAlive`, at most
 * `MAX_SPAWNS_PER_STEP` per step and never past `ENEMY_CAP`. Draws only from `world.spawnRng`. Stops once the stage
 * is cleared (#17).
 */
export function spawnerSystem(world: World, dt: number): void {
  if (world.cleared) return;
  const wave = waveAt(world.time / 60);
  world.spawnTimer -= dt;
  if (world.spawnTimer <= 0) {
    world.spawnQueue += wave.batchSize;
    world.spawnTimer += wave.spawnIntervalSec;
  }
  const { enemies } = world;
  if (enemies.count + world.spawnQueue < wave.minAlive)
    world.spawnQueue = wave.minAlive - enemies.count;
  let spawned = 0;
  while (world.spawnQueue > 0 && spawned < MAX_SPAWNS_PER_STEP && enemies.count < ENEMY_CAP) {
    const enemyId = pickEnemy(wave, world.spawnRng);
    ringPoint(world.camera, world.spawnRng, point);
    spawnEnemy(world, enemyId, point.x, point.y);
    world.spawnQueue--;
    spawned++;
  }
  // Excess beyond the cap is dropped, not kept for later.
  if (enemies.count >= ENEMY_CAP) world.spawnQueue = 0;
  if (import.meta.env.DEV && enemies.count > ENEMY_CAP)
    throw new Error(`Live enemies ${String(enemies.count)} exceed ENEMY_CAP ${String(ENEMY_CAP)}`);
}
