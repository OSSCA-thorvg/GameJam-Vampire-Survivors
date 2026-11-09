// Headless balance probe (#148): plays a real run with a scripted, deterministic policy and reports how long it
// survives, so the stage's difficulty is checked by numbers. Test-only: imported by `balance-probe.test.ts`, never by
// the worker's entry, so it never reaches a build.
import type { Axis } from '../../protocol/worker-messages';
import { GEM_IDLE } from './gems';
import { createLevelUpFlow } from './level';
import { createChestFlow } from './systems/chest-open';
import { createWorld, type World } from './world';

export type ProbePolicy = 'idle' | 'player';

export interface ProbeOptions {
  seed: number;
  characterId: string;
  policy: ProbePolicy;
  /** Simulated seconds before the run counts as a timeout; 900 (the stage) when omitted. */
  maxSec?: number;
}

export interface ProbeResult {
  survivedSec: number;
  level: number;
  kills: number;
  cause: 'dead' | 'timeout';
}

const DT = 1 / 60;
/** Enemies within this distance make the player flee. */
const FLEE_RANGE = 110;
/** The closest distance a flee weight is computed for, so one touching enemy does not swamp the rest. */
const FLEE_MIN_DISTANCE = 16;
/** Idle gems within this distance are collected when nothing is close. */
const GEM_RANGE = 400;
/** The player closes in on the nearest enemy until it is this far, so facing weapons point at it. */
const ENGAGE_DISTANCE = 180;
/** With no enemy within this distance, the player walks the circle. */
const SEEK_RANGE = 600;
/** An axis whose share of the direction is below this fraction of its length is not pressed. */
const DEAD_ZONE = 0.25;
/** With nothing near, the player walks a circle of this radius around the start. */
const CIRCLE_RADIUS = 600;
/** How far ahead on the circle (radians) the walking target sits. */
const CIRCLE_LEAD = 0.3;

export interface ProbeInput {
  dx: Axis;
  dy: Axis;
}

const axis = (v: number, len: number): Axis => {
  if (Math.abs(v) < DEAD_ZONE * len) return 0;
  return v > 0 ? 1 : -1;
};

const toInput = (sx: number, sy: number): ProbeInput => {
  const len = Math.hypot(sx, sy);
  if (len === 0) return { dx: 0, dy: 0 };
  return { dx: axis(sx, len), dy: axis(sy, len) };
};

/**
 * `'player'` (#148), a deterministic stand-in for a person: with any enemy within `FLEE_RANGE`, flee along the sum of
 * unit vectors away from those enemies weighted by `1 / max(distance, FLEE_MIN_DISTANCE)`; otherwise walk to the
 * nearest idle gem within `GEM_RANGE`; otherwise close in on the nearest enemy until it is `ENGAGE_DISTANCE` away (and
 * stand there, facing it); with no enemy within `SEEK_RANGE`, walk a `CIRCLE_RADIUS` circle around (`startX`,
 * `startY`). 8-direction input with a dead zone of `DEAD_ZONE` of the vector's length. Never uses debug commands.
 */
export function playerInput(world: World, startX: number, startY: number): ProbeInput {
  const { player } = world;
  const { x, y } = world.enemies.cols;
  let fx = 0;
  let fy = 0;
  let fleeing = false;
  let nearest = Infinity;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < world.enemies.count; i++) {
    const ex = player.x - (x[i] ?? 0);
    const ey = player.y - (y[i] ?? 0);
    const d = Math.hypot(ex, ey);
    if (d < nearest) {
      nearest = d;
      nx = -ex;
      ny = -ey;
    }
    if (d > FLEE_RANGE) continue;
    fleeing = true;
    if (d === 0) continue;
    const w = 1 / Math.max(d, FLEE_MIN_DISTANCE);
    fx += (ex / d) * w;
    fy += (ey / d) * w;
  }
  if (fleeing) return toInput(fx, fy);
  const gems = world.gems.cols;
  let gemBest = GEM_RANGE;
  let gx = 0;
  let gy = 0;
  for (let i = 0; i < world.gems.count; i++) {
    if (gems.state[i] !== GEM_IDLE) continue;
    const dx = (gems.x[i] ?? 0) - player.x;
    const dy = (gems.y[i] ?? 0) - player.y;
    const d = Math.hypot(dx, dy);
    if (d < gemBest) {
      gemBest = d;
      gx = dx;
      gy = dy;
    }
  }
  if (gemBest < GEM_RANGE) return toInput(gx, gy);
  if (nearest <= SEEK_RANGE) return nearest > ENGAGE_DISTANCE ? toInput(nx, ny) : { dx: 0, dy: 0 };
  const angle = Math.atan2(player.y - startY, player.x - startX) + CIRCLE_LEAD;
  return toInput(
    startX + Math.cos(angle) * CIRCLE_RADIUS - player.x,
    startY + Math.sin(angle) * CIRCLE_RADIUS - player.y,
  );
}

/**
 * Plays one single-player run of `characterId` (a full `createWorld`, character applied) at 1/60 s steps until death
 * or `maxSec`, answering every level-up with option 0 and closing every chest, as the worker's flows do.
 */
export function runProbe({ seed, characterId, policy, maxSec = 900 }: ProbeOptions): ProbeResult {
  const world = createWorld({ seed, characterId });
  const idle = { pause: () => undefined, resume: () => undefined };
  const levels = createLevelUpFlow({ post: () => undefined, ...idle });
  const chests = createChestFlow({ post: () => undefined, ...idle });
  const startX = world.player.x;
  const startY = world.player.y;
  while (world.state === 'running' && world.time < maxSec) {
    world.input = policy === 'player' ? playerInput(world, startX, startY) : { dx: 0, dy: 0 };
    world.step(DT);
    levels.afterStep(world);
    while (levels.open) levels.choose(world, 0);
    chests.afterStep(world);
    chests.close(world);
  }
  return {
    survivedSec: Math.round(world.time * 10) / 10,
    level: world.player.level,
    kills: world.stats.kills,
    cause: world.state === 'dead' ? 'dead' : 'timeout',
  };
}
