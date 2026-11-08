import type { WorkerStatus } from '../../protocol/worker-messages';
import type { World } from './world';

/** Simulated seconds between two `status` messages of a versus run (#20): 4 per second, `STATUS_MIN_INTERVAL_MS`. */
export const STATUS_INTERVAL_SEC = 0.25;
/** Float drift of summed 1/60 s steps must not delay a status by one step. */
const EPSILON = 1e-9;

/** The `status` message for `world`'s current state: HP clamped to `0..maxHp`, whole kills and level, elapsed ms. */
export function readStatus(world: World): WorkerStatus {
  const { hp, maxHp, level } = world.player;
  const max = Math.max(0, maxHp);
  return {
    type: 'status',
    hp: Math.min(max, Math.max(0, hp)),
    maxHp: max,
    level: Math.max(0, Math.floor(level)),
    kills: Math.max(0, Math.floor(world.stats.kills)),
    alive: world.state !== 'dead',
    elapsedMs: Math.max(0, Math.round(world.time * 1000)),
  };
}

/**
 * Posts a versus run's status (#20, ADR 0006): `afterStep` once per `STATUS_INTERVAL_SEC` of simulated time, from the
 * worker's fixed step, and `final` once in the step the player dies. Single-player runs never post one.
 */
export interface StatusEmitter {
  afterStep(world: World, dt: number): void;
  /** The run just ended: a versus death posts one last status (`alive: false`). */
  final(world: World): void;
  /** A new run starts its interval from zero. */
  reset(): void;
}

export function createStatusEmitter(post: (message: WorkerStatus) => void): StatusEmitter {
  let acc = 0;
  return {
    afterStep(world, dt) {
      if (world.mode !== 'versus' || world.state !== 'running') return;
      acc += dt;
      if (acc + EPSILON < STATUS_INTERVAL_SEC) return;
      acc -= STATUS_INTERVAL_SEC;
      post(readStatus(world));
    },
    final(world) {
      if (world.mode === 'versus' && world.state === 'dead') post(readStatus(world));
    },
    reset() {
      acc = 0;
    },
  };
}
