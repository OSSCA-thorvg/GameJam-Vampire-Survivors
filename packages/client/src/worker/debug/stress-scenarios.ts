// The named stress scenarios of #22 (`?stress=<name>`, `STRESS_SCENARIOS` in ./stress.ts). Imported only inside the
// `import.meta.env.DEV || import.meta.env.MODE === 'perf'` guard, so the normal production bundle has none of it.
import type { Scene } from '@thorvg/webcanvas';
import {
  createRng,
  ENEMIES,
  ENEMY_CAP,
  ENEMY_LIST,
  GEM_CAP,
  PROJECTILE_CAP,
  type WeaponId,
} from '@vs/shared';
import type { WorkerToMain } from '../../protocol/worker-messages';
import type { AssetInstance, AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { spawnEnemy } from '../game/enemies';
import { addGem } from '../game/gems';
import { grantNextPassive } from '../game/passives';
import type { Session } from '../game/session';
import { recomputeStats } from '../game/stats';
import {
  MOTION_STRAIGHT,
  PROJECTILE_ASSETS,
  spawnProjectile,
  type ProjectileOptions,
} from '../game/projectiles';
import { addWeapon, levelUpWeapon } from '../game/weapons/owned';
import type { World } from '../game/world';
import type { PerfMeter } from '../perf/overlay';
import { createFrameTimings } from '../perf/stats';
import { setTransform } from '../render/transform';
import { STRESS_MEASURE_MS, STRESS_WARMUP_MS, type StressScenario } from './stress';

type WorldScenario = Extract<StressScenario, { kind: 'world' }>;

/** Samples one measured window can hold: 60 s at up to 240 Hz, and 60 steps per second. */
const SAMPLES = 16_384;
/** `projectiles-max` sizes the projectile store to this, so the measurement is not clipped at `PROJECTILE_CAP`. */
const PROJECTILE_STRESS_CAPACITY = 2400;
/** Every slot: the five projectile weapons and King Bible (`MAX_WEAPON_SLOTS` is 6, so not all 8 fit). */
const MAX_WEAPONS: readonly WeaponId[] = [
  'magicWand',
  'knife',
  'axe',
  'cross',
  'fireWand',
  'kingBible',
];
/** Enemies and gems appear in this ring around the player, most of it on screen. */
const RING_MIN = 150;
const RING_MAX = 620;
/** Wall-clock interval of the `stressProgress` messages (#119). */
export const STRESS_PROGRESS_MS = 10_000;
/** The emitter's shots (#119): units per second, and one options object reused for every shot (it is copied). */
const EMIT_SPEED = 240;
const EMIT_OPTIONS: ProjectileOptions = {
  damage: 1,
  knockback: 0,
  radius: 8,
  pierce: Number.POSITIVE_INFINITY,
  ttl: 2.5,
  weaponSlot: 0,
  motion: MOTION_STRAIGHT,
};
/** The emitter cycles through the five projectile weapons' art (`weapon.magicWand` … `weapon.fireWand`). */
const EMIT_ASSETS = PROJECTILE_ASSETS.slice(0, 5);

export interface ScenarioRecorder {
  /** Call once per rendered frame, after `canvas.render()`. */
  afterFrame(now: number): void;
}

/** Where the recorder listens for uncaught worker errors; the worker's global scope by default. */
type ErrorTarget = Pick<EventTarget, 'addEventListener'>;

/** An error event's or a rejection reason's stack, or its string form when it has none. */
function describeError(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? String(reason);
  if (typeof reason === 'object' && reason !== null && 'stack' in reason) {
    const { stack } = reason;
    if (typeof stack === 'string' && stack !== '') return stack;
  }
  return String(reason);
}

/**
 * Warms up for `STRESS_WARMUP_MS`, then records every frame's timings for `STRESS_MEASURE_MS` through `meter` and posts
 * one `stressResult` with the medians and the largest `counts` seen. Logs `[stress]` lines at each phase.
 * #119: from the first frame, posts a `stressProgress` every `STRESS_PROGRESS_MS` of wall time with the frames and
 * steps so far and the simulated time, and one with `error` set for every uncaught worker error or unhandled rejection
 * while the scenario runs, so a stall or a crash reaches the main-thread console.
 */
export function createScenarioRecorder(opts: {
  scenario: string;
  meter: PerfMeter;
  post: (message: WorkerToMain) => void;
  counts: Readonly<Record<string, () => number>>;
  start: number;
  /** Simulated seconds so far (the world's `time`, or the steps since boot / 60). */
  simTime: () => number;
  /** Simulation steps since boot. */
  steps: () => number;
  /** Defaults to the worker's global scope. */
  errors?: ErrorTarget;
}): ScenarioRecorder {
  const { scenario, meter, post, counts } = opts;
  const timings = createFrameTimings(SAMPLES);
  const names = Object.keys(counts);
  const readers = names.map((name) => counts[name] ?? (() => 0));
  const peaks = new Float64Array(names.length);
  let phase: 'warmup' | 'measuring' | 'done' = 'warmup';
  let measureStart = 0;
  let frames = 0;
  let lastNow = opts.start;
  let nextProgress = Number.NaN;
  const progress = (error: string | null): void => {
    post({
      type: 'stressProgress',
      scenario,
      phase: phase === 'warmup' ? 'warmup' : 'measuring',
      elapsedS: Math.round(lastNow - opts.start) / 1000,
      steps: opts.steps(),
      frames,
      simS: Math.round(opts.simTime() * 1000) / 1000,
      error,
    });
  };
  const target: ErrorTarget = opts.errors ?? globalThis;
  target.addEventListener('error', (event) => {
    if (phase === 'done') return;
    const e = event as ErrorEvent;
    const where = e.filename ? ` at ${e.filename}:${String(e.lineno)}:${String(e.colno)}` : '';
    progress(
      e.error === undefined || e.error === null ? `${e.message}${where}` : describeError(e.error),
    );
  });
  target.addEventListener('unhandledrejection', (event) => {
    if (phase === 'done') return;
    progress(describeError((event as PromiseRejectionEvent).reason));
  });
  console.warn(`[stress] ${scenario}: warming up for ${String(STRESS_WARMUP_MS / 1000)} s`);
  return {
    afterFrame(now) {
      if (phase === 'done') return;
      frames++;
      lastNow = now;
      if (Number.isNaN(nextProgress)) nextProgress = now + STRESS_PROGRESS_MS;
      else if (now >= nextProgress) {
        nextProgress += STRESS_PROGRESS_MS;
        progress(null);
      }
      if (phase === 'warmup') {
        if (now - opts.start < STRESS_WARMUP_MS) return;
        phase = 'measuring';
        measureStart = now;
        meter.record(timings);
        console.warn(`[stress] ${scenario}: measuring for ${String(STRESS_MEASURE_MS / 1000)} s`);
        return;
      }
      for (let i = 0; i < readers.length; i++) {
        const value = readers[i]?.() ?? 0;
        if (value > (peaks[i] ?? 0)) peaks[i] = value;
      }
      if (now - measureStart < STRESS_MEASURE_MS) return;
      phase = 'done';
      meter.record(null);
      const round = (value: number): number => Math.round(value * 1000) / 1000;
      post({
        type: 'stressResult',
        result: {
          scenario,
          medianMs: round(timings.frame.median()),
          p95Ms: round(timings.frame.p95()),
          maxMs: round(timings.frame.max),
          simMs: round(timings.sim.median()),
          transformMs: round(timings.transform.median()),
          updateMs: round(timings.update.median()),
          renderMs: round(timings.render.median()),
          meanMs: {
            sim: round(timings.sim.mean()),
            transform: round(timings.transform.mean()),
            update: round(timings.update.mean()),
            render: round(timings.render.mean()),
          },
          frames: timings.frame.count,
          steps: timings.sim.count,
          durationS: round((now - measureStart) / 1000),
          maxCounts: Object.fromEntries(names.map((name, i) => [name, peaks[i] ?? 0])),
        },
      });
    },
  };
}

export interface WorldScenarioRun {
  /** Call after every `world.step`: dismisses level-ups and chests, and tops the enemies back up. */
  afterStep(world: World): void;
}

/**
 * Starts a run on the real game view for a `world` scenario: stores sized past the caps, the player invulnerable,
 * and the scenario's weapons and gems. Level-up choices and chests are dismissed after each step (their rewards are
 * already applied), because no screen answers them in a stress boot.
 */
export function startWorldScenario(session: Session, scenario: WorldScenario): WorldScenarioRun {
  const world = session.start(1, 'warden', 'death', 'single', {
    enemies: Math.max(ENEMY_CAP, scenario.enemies),
    projectiles: scenario.maxWeapons ? PROJECTILE_STRESS_CAPACITY : PROJECTILE_CAP,
    gems: Math.max(GEM_CAP, scenario.gems ?? 0),
  });
  world.debugInvulnerable = true;
  if (scenario.frozen) world.freezeUntil = Number.POSITIVE_INFINITY;
  const ringMin = scenario.ring?.min ?? RING_MIN;
  const ringMax = scenario.ring?.max ?? RING_MAX;
  const keepProjectiles = scenario.projectiles ?? 0;
  let emitted = 0;
  const rng = createRng(22);
  const point = { x: 0, y: 0 };
  const ring = (): void => {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(ringMin, ringMax);
    point.x = world.player.x + Math.cos(angle) * distance;
    point.y = world.player.y + Math.sin(angle) * distance;
  };
  if (scenario.maxWeapons) {
    world.weapons.length = 0;
    for (const id of MAX_WEAPONS) {
      addWeapon(world, id);
      while (levelUpWeapon(world, id));
    }
    while (grantNextPassive(world));
    recomputeStats(world);
  }
  for (let i = 0; i < (scenario.gems ?? 0); i++) {
    ring();
    addGem(world, point.x, point.y, 1, 0);
  }
  const normal = ENEMY_LIST.filter((id) => !ENEMIES[id].boss);
  return {
    afterStep(current) {
      current.pendingLevelUps = 0;
      current.chestRewards = null;
      while (current.enemies.count < scenario.enemies) {
        ring();
        if (spawnEnemy(current, rng.pick(normal), point.x, point.y) < 0) break;
      }
      // #119: shots in every direction from the player, piercing, so the store holds `projectiles` at least.
      while (current.projectiles.count < keepProjectiles) {
        const angle = rng.range(0, Math.PI * 2);
        const asset = EMIT_ASSETS[emitted % EMIT_ASSETS.length] ?? 'weapon.magicWand';
        const slot = spawnProjectile(
          current,
          asset,
          current.player.x,
          current.player.y,
          Math.cos(angle) * EMIT_SPEED,
          Math.sin(angle) * EMIT_SPEED,
          EMIT_OPTIONS,
        );
        if (slot < 0) break;
        emitted++;
      }
    },
  };
}

export interface SharedLottieScene {
  step(dt: number): void;
  render(): void;
  readonly entities: number;
}

/**
 * `lottie-enemy-shared`: one `enemy.lottieTest` animation, advanced by `library.tick`, whose Picture is duplicated for
 * every enemy each frame (the previous frame's copies are removed and disposed). This deliberately breaks ADR 0003's
 * no-Paint-per-frame rule, to measure whether sharing one animation is cheaper than one `LottieAnimation` per enemy.
 */
export function createSharedLottieScene(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add' | 'remove'>,
  count: number,
): SharedLottieScene {
  const shared = library.create('enemy.lottieTest');
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const rng = createRng(1);
  for (let i = 0; i < count; i++) {
    x[i] = rng.range(16, VIEW_WIDTH - 16);
    y[i] = rng.range(16, VIEW_HEIGHT - 16);
    vx[i] = rng.range(-35, 35);
    vy[i] = rng.range(-35, 35);
  }
  const copies: AssetInstance[] = Array.from({ length: count }, () => ({
    paint: shared.paint,
    offsetX: shared.offsetX,
    offsetY: shared.offsetY,
  }));
  let drawn = false;
  return {
    step(dt) {
      for (let i = 0; i < count; i++) {
        x[i] = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
        y[i] = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
        if ((x[i] ?? 0) < 16 || (x[i] ?? 0) > VIEW_WIDTH - 16) vx[i] = -(vx[i] ?? 0);
        if ((y[i] ?? 0) < 16 || (y[i] ?? 0) > VIEW_HEIGHT - 16) vy[i] = -(vy[i] ?? 0);
      }
    },
    render() {
      for (let i = 0; i < count; i++) {
        const copy = copies[i];
        if (!copy) continue;
        if (drawn) {
          layer.remove(copy.paint);
          copy.paint.dispose();
        }
        copy.paint = shared.paint.duplicate();
        setTransform(copy, x[i] ?? 0, y[i] ?? 0);
        layer.add(copy.paint);
      }
      drawn = true;
    },
    entities: count,
  };
}
