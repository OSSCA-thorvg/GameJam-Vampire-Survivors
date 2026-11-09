import type { Scene } from '@thorvg/webcanvas';
import { createRng, PROJECTILE_CAP, type DrawableAssetId } from '@vs/shared';
import type { AssetSource } from '../assets/library';
import { createStore } from '../ecs/store';
import { createSpatialGrid } from '../ecs/spatial-grid';
import { PaintPool, RenderBinding } from '../render/pool';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

export interface StressSnapshot {
  entities: number;
  paintsCreated: number;
  visiblePaints: number;
  churnCycles: number;
  stepMs: number;
}
export interface StressScene {
  step(dt: number): void;
  render(): void;
  snapshot(): StressSnapshot;
  readonly stepMs: number;
  readonly entities: number;
  readonly paintsCreated: number;
}

/**
 * The named `?stress=<name>` scenarios (#22), as data: each runs for `STRESS_MEASURE_MS` after `STRESS_WARMUP_MS` and
 * posts a `stressResult`. `world` scenarios run the real game world and view, with the player invulnerable and the
 * stores sized to `enemies`/`projectiles`/`gems` past the caps; `lottie` scenarios draw `count` `enemy.lottieTest`
 * instances, either one `LottieAnimation` each (`perEnemy`) or duplicated from one shared animation every frame.
 * `scripts/verify/check-prod-bundle.mjs` rejects every name in the normal production bundle.
 */
export const STRESS_SCENARIOS = {
  'enemies-400': { kind: 'world', enemies: 400 },
  'enemies-800': { kind: 'world', enemies: 800 },
  'enemies-1200': { kind: 'world', enemies: 1200 },
  'projectiles-max': { kind: 'world', enemies: 300, maxWeapons: true, projectiles: PROJECTILE_CAP },
  'projectiles-1800': { kind: 'world', enemies: 300, maxWeapons: true, projectiles: 1800 },
  'projectiles-frozen': {
    kind: 'world',
    enemies: 300,
    maxWeapons: true,
    frozen: true,
    ring: { min: 150, max: 1100 },
  },
  'gems-flood': { kind: 'world', enemies: 0, gems: 1000 },
  'lottie-enemy': { kind: 'lottie', count: 400, mode: 'perEnemy' },
  'lottie-enemy-shared': { kind: 'lottie', count: 400, mode: 'shared' },
} as const satisfies Record<string, StressScenario>;

export type StressScenario =
  | {
      kind: 'world';
      /** Live enemies kept by respawning, ignoring `ENEMY_CAP`; 0 leaves the normal spawner alone. */
      enemies: number;
      /** Fill every weapon slot with the projectile weapons and King Bible at max level, and max every passive. */
      maxWeapons?: boolean;
      /** Blue gems dropped at the start without merging; later drops merge as usual. */
      gems?: number;
      /** Live projectiles kept at least (#119): an emitter tops the store up after every step; weapon shots count. */
      projectiles?: number;
      /** The enemy (and gem) spawn ring around the player; `RING_MIN`/`RING_MAX` when absent (#119). */
      ring?: { min: number; max: number };
      /** An endless Orologion freeze from the start (#119): enemies stop, so shots fly past them. */
      frozen?: boolean;
    }
  | { kind: 'lottie'; count: number; mode: 'perEnemy' | 'shared' };
export type StressScenarioName = keyof typeof STRESS_SCENARIOS;
export const STRESS_SCENARIO_NAMES = Object.keys(STRESS_SCENARIOS) as StressScenarioName[];

/** Warm-up before measuring (pool growth, first Lottie loads), then the measured window. */
export const STRESS_WARMUP_MS = 5000;
export const STRESS_MEASURE_MS = 60_000;

const isScenarioName = (value: string): value is StressScenarioName =>
  Object.hasOwn(STRESS_SCENARIOS, value);

/** A named scenario, #6's numeric count, or `null` (normal boot; an unsupported value warns once). */
export function parseStress(
  value: string,
): { scenario: StressScenarioName } | { count: number } | null {
  if (isScenarioName(value)) return { scenario: value };
  const count = parseStressCount(value);
  return count === null ? null : { count };
}

/** Empty means normal boot. An unsupported value (not a number, not a scenario name) warns and returns `null`. */
export function parseStressCount(value: string): number | null {
  if (value === '') return null;
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isFinite(count)) {
    console.warn(`[stress] unsupported scenario: ${value}`);
    return null;
  }
  return Math.min(count, 4096);
}

/** All owned storage and Paints are created here. Steps and render only reuse them. */
export function createStressScene(
  library: AssetSource,
  layer: Pick<Scene, 'add'>,
  count: number,
  now: () => number = () => performance.now(),
  /** #22's `lottie-enemy` draws `enemy.lottieTest` without churn; #6's numeric scene churns `enemy.bat`. */
  { assetId = 'enemy.bat', churn = true }: { assetId?: DrawableAssetId; churn?: boolean } = {},
): StressScene {
  if (!Number.isInteger(count) || count < 0 || count > 4096)
    throw new RangeError('Stress count must be an integer from 0 to 4096');
  const store = createStore(
    { x: 'f32', y: 'f32', vx: 'f32', vy: 'f32', ...RenderBinding.columns },
    Math.max(1, count),
  );
  const { x, y, vx, vy } = store.cols;
  const pool = new PaintPool(library, assetId, layer, count);
  const binding = new RenderBinding(store, [pool]);
  const grid = createSpatialGrid({ cellSize: 64, buckets: 4096, maxItems: count });
  const neighbours = new Int32Array(count);
  const rng = createRng(1);
  let churnTime = 0;
  let churnCycles = 0;
  let stepMs = 0;
  const spawn = (): void => {
    const slot = store.add();
    if (slot === -1) throw new Error('Stress store exhausted its stable IDs');
    x[slot] = rng.range(16, VIEW_WIDTH - 16);
    y[slot] = rng.range(16, VIEW_HEIGHT - 16);
    vx[slot] = rng.range(-35, 35);
    vy[slot] = rng.range(-35, 35);
    binding.bind(slot, 0);
    library.setMotionState?.(pool.get(store.cols.paintHandle[slot] ?? 0), 'move');
  };
  for (let i = 0; i < count; i++) spawn();

  function move(dt: number): void {
    for (let i = 0; i < store.count; i++) {
      let px = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
      let py = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
      if (px < 16 || px > VIEW_WIDTH - 16) {
        vx[i] = -(vx[i] ?? 0);
        px = Math.max(16, Math.min(VIEW_WIDTH - 16, px));
      }
      if (py < 16 || py > VIEW_HEIGHT - 16) {
        vy[i] = -(vy[i] ?? 0);
        py = Math.max(16, Math.min(VIEW_HEIGHT - 16, py));
      }
      x[i] = px;
      y[i] = py;
    }
  }
  function separate(dt: number): void {
    grid.rebuild(x, y, store.count);
    for (let i = 0; i < store.count; i++) {
      const px = x[i] ?? 0;
      const py = y[i] ?? 0;
      const found = grid.query(px, py, 20, neighbours);
      let pushX = 0;
      let pushY = 0;
      for (let k = 0; k < found; k++) {
        const other = neighbours[k] ?? -1;
        if (other === i) continue;
        const dx = px - (x[other] ?? 0);
        const dy = py - (y[other] ?? 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0 && distance < 20) {
          const push = ((20 - distance) / distance) * dt;
          pushX += dx * push;
          pushY += dy * push;
        }
      }
      x[i] = Math.max(16, Math.min(VIEW_WIDTH - 16, px + pushX));
      y[i] = Math.max(16, Math.min(VIEW_HEIGHT - 16, py + pushY));
    }
  }
  return {
    step(dt) {
      const started = now();
      move(dt);
      separate(dt);
      if (churn) churnTime += dt;
      if (churnTime >= 2 - 1e-9) {
        churnTime -= 2;
        const removed = Math.min(1000, store.count);
        for (let i = 0; i < removed; i++) {
          const slot = rng.int(store.count);
          binding.unbind(slot);
          store.remove(slot);
        }
        for (let i = 0; i < removed; i++) spawn();
        churnCycles++;
      }
      stepMs = now() - started;
    },
    render() {
      binding.sync(store, x, y);
    },
    snapshot: () => ({
      entities: store.count,
      paintsCreated: pool.created,
      visiblePaints: pool.visibleCount,
      churnCycles,
      stepMs,
    }),
    get stepMs() {
      return stepMs;
    },
    get entities() {
      return store.count;
    },
    get paintsCreated() {
      return pool.created;
    },
  };
}
