import { PROJECTILE_CAP } from '@vs/shared';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorkerToMain } from '../../protocol/worker-messages';
import { createSession } from '../game/session';
import { isFrozen } from '../game/systems/freeze';
import { createGameView } from '../game/view';
import { fakeGameView } from '../game/view-test-helpers';
import type { PerfMeter } from '../perf/overlay';
import { STRESS_MEASURE_MS, STRESS_SCENARIOS, STRESS_WARMUP_MS } from './stress';
import { createScenarioRecorder, startWorldScenario, STRESS_PROGRESS_MS } from './stress-scenarios';

afterEach(() => {
  vi.restoreAllMocks();
});

const fakeMeter = (): PerfMeter => ({
  enabled: false,
  stepDone: () => undefined,
  frameDone: () => undefined,
  record: () => undefined,
});

function recorderHarness() {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const posted: WorkerToMain[] = [];
  const errors = new EventTarget();
  let steps = 0;
  const recorder = createScenarioRecorder({
    scenario: 'projectiles-max',
    meter: fakeMeter(),
    post: (message) => posted.push(message),
    counts: { projectiles: () => 7 },
    start: 0,
    simTime: () => steps / 60,
    steps: () => steps,
    errors,
  });
  /** One frame every 1/60 s of fake wall time, one step each, until `untilMs`. */
  let now = 0;
  const runUntil = (untilMs: number): void => {
    while (now < untilMs) {
      now += 1000 / 60;
      steps++;
      recorder.afterFrame(now);
    }
  };
  return { posted, errors, runUntil };
}

it('posts stressProgress every 10 s with rising steps, then one stressResult after the measured window', () => {
  const { posted, runUntil } = recorderHarness();
  runUntil(STRESS_WARMUP_MS + STRESS_MEASURE_MS + 100);
  const progress = posted.filter((m) => m.type === 'stressProgress');
  const results = posted.filter((m) => m.type === 'stressResult');
  expect(progress.length).toBeGreaterThanOrEqual(6);
  const [first, second] = progress;
  expect(first).toMatchObject({ scenario: 'projectiles-max', phase: 'measuring', error: null });
  expect(first?.elapsedS).toBeCloseTo(STRESS_PROGRESS_MS / 1000, 1);
  expect(second?.elapsedS).toBeCloseTo((2 * STRESS_PROGRESS_MS) / 1000, 1);
  expect(second?.steps ?? 0).toBeGreaterThan(first?.steps ?? 0);
  expect(second?.frames ?? 0).toBeGreaterThan(first?.frames ?? 0);
  expect(second?.simS ?? 0).toBeGreaterThan(first?.simS ?? 0);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ result: { maxCounts: { projectiles: 7 } } });
  // Nothing more once the result is out.
  const before = posted.length;
  runUntil(STRESS_WARMUP_MS + STRESS_MEASURE_MS + 30_000);
  expect(posted).toHaveLength(before);
});

it('reports uncaught worker errors and unhandled rejections with their stack', () => {
  const { posted, errors, runUntil } = recorderHarness();
  runUntil(1000);
  const boom = new Error('boom');
  errors.dispatchEvent(
    Object.assign(new Event('error'), {
      error: boom,
      message: 'boom',
      filename: '',
      lineno: 0,
      colno: 0,
    }),
  );
  errors.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'no stack' }));
  const reported = posted.filter((m) => m.type === 'stressProgress').map((m) => m.error);
  expect(reported).toHaveLength(2);
  expect(reported[0]).toContain('Error: boom');
  expect(reported[0]).toContain('stress-scenarios.test.ts');
  expect(reported[1]).toBe('no stack');
});

function startScenario(name: keyof typeof STRESS_SCENARIOS) {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const def = STRESS_SCENARIOS[name];
  if (def.kind !== 'world') throw new Error('not a world scenario');
  const view = createGameView(fakeGameView().options);
  const session = createSession(view, () => undefined);
  const run = startWorldScenario(session, def);
  const world = session.world;
  if (!world) throw new Error('no world');
  let peak = 0;
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      world.step(1 / 60);
      run.afterStep(world);
      session.render();
      if (world.projectiles.count > peak) peak = world.projectiles.count;
    }
  };
  return { world, view, step, peak: () => peak };
}

// Heavy simulation: explicit timeout as in #80; CI runners are several times slower.
// The pools grow while the weapons' own shots and the emitter's waves settle: measured, the last projectile Paint is
// created about 8 simulated seconds in (3 to 6 of them after the 5 s warm-up); none after 10 s.
it('keeps the projectile store filled in projectiles-max and projectiles-1800, and the pools settle', () => {
  for (const [name, keep] of [
    ['projectiles-max', PROJECTILE_CAP],
    ['projectiles-1800', 1800],
  ] as const) {
    const { world, view, step } = startScenario(name);
    step(60 * 10);
    const afterWarmup = view.countPaints();
    for (let s = 0; s < 4; s++) {
      step(60);
      expect(world.projectiles.count, name).toBeGreaterThanOrEqual(keep);
    }
    expect(view.countPaints(), name).toBe(afterWarmup);
  }
}, 30_000);

it('projectiles-frozen freezes the enemies for good and spawns them out to 1100 units', () => {
  const { world, step } = startScenario('projectiles-frozen');
  step(60 * 10);
  expect(isFrozen(world)).toBe(true);
  expect(world.enemies.count).toBeGreaterThanOrEqual(300);
  const { x, y } = world.enemies.cols;
  let farthest = 0;
  for (let i = 0; i < world.enemies.count; i++) {
    const d = Math.hypot((x[i] ?? 0) - world.player.x, (y[i] ?? 0) - world.player.y);
    if (d > farthest) farthest = d;
  }
  expect(farthest).toBeGreaterThan(620);
  expect(farthest).toBeLessThanOrEqual(1100 + 1);
}, 30_000);
