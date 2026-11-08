import { describe, expect, it } from 'vitest';
import { HIDDEN_TICK_MS, MAX_STEPS, MAX_STEPS_HIDDEN, STEP_MS } from './constants';
import { createLoop } from './loop';

/** A fake clock, rAF and timer queue, driven by hand. */
function harness() {
  let time = 1000;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { cb: () => void; at: number }>();
  const counts = { steps: 0, renders: 0, stepsPerFrame: [] as number[] };
  let stepsThisFrame = 0;

  const loop = createLoop({
    step: () => {
      counts.steps++;
      stepsThisFrame++;
    },
    render: () => {
      counts.renders++;
    },
    now: () => time,
    raf: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelRaf: (id) => {
      frames.delete(id);
    },
    setTimer: ((cb: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { cb, at: time + ms });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimer: ((id: number) => {
      timers.delete(id);
    }) as unknown as typeof clearTimeout,
  });

  /** Advances the clock by `ms`, then runs every pending animation frame (one browser frame). */
  const frame = (ms: number): void => {
    time += ms;
    const pending = [...frames.entries()];
    frames.clear();
    stepsThisFrame = 0;
    for (const [, cb] of pending) cb();
    if (pending.length > 0) counts.stepsPerFrame.push(stepsThisFrame);
  };

  /** Advances the clock by `ms` and fires the due timers once, like a throttled background timer. */
  const throttledTick = (ms: number): void => {
    time += ms;
    for (const [id, t] of [...timers.entries()]) {
      if (t.at <= time) {
        timers.delete(id);
        t.cb();
      }
    }
  };

  return { loop, frame, throttledTick, counts, frames, timers };
}

describe('createLoop', () => {
  it('runs 60 ± 1 steps for 1 s of 16.67 ms frames, rendering once per frame', () => {
    const h = harness();
    h.loop.start();
    for (let i = 0; i < 60; i++) h.frame(1000 / 60);
    expect(h.counts.steps).toBeGreaterThanOrEqual(59);
    expect(h.counts.steps).toBeLessThanOrEqual(61);
    expect(h.counts.renders).toBe(60);
  });

  it('runs at most MAX_STEPS steps on a 1000 ms hitch, then resets the accumulator', () => {
    const h = harness();
    h.loop.start();
    h.frame(1000);
    expect(h.counts.steps).toBe(MAX_STEPS);
    // The dropped remainder does not leak into the next frame.
    h.frame(STEP_MS);
    expect(h.counts.steps).toBe(MAX_STEPS + 1);
  });

  it('never runs more than MAX_STEPS steps in any visible frame', () => {
    const h = harness();
    h.loop.start();
    for (const ms of [5, 16.7, 33, 100, 250, 1000, 5000, 16.7, 0, 60, 84]) h.frame(ms);
    expect(Math.max(...h.counts.stepsPerFrame)).toBeLessThanOrEqual(MAX_STEPS);
  });

  it('yields no steps while paused, keeps rendering, and does not burst on resume', () => {
    const h = harness();
    h.loop.start();
    h.frame(STEP_MS);
    const before = h.counts.steps;
    h.loop.pause();
    for (let i = 0; i < 30; i++) h.frame(STEP_MS);
    expect(h.counts.steps).toBe(before);
    expect(h.counts.renders).toBe(31);
    h.loop.resume();
    h.frame(STEP_MS);
    // At most the one new step plus a carried sub-step remainder, never the 30 paused frames.
    expect(h.counts.steps - before).toBeGreaterThanOrEqual(1);
    expect(h.counts.steps - before).toBeLessThanOrEqual(2);
  });

  it("with policy 'simulate', steps 600 ± 1 times over 10 s of 1 Hz ticks while hidden, with no renders", () => {
    const h = harness();
    h.loop.setBackgroundPolicy('simulate');
    h.loop.start();
    h.frame(STEP_MS);
    const steps = h.counts.steps;
    const renders = h.counts.renders;
    h.loop.setVisibility(true);
    expect(h.frames.size).toBe(0);
    for (let i = 0; i < 10; i++) {
      h.throttledTick(1000);
      h.frame(0); // a stray rAF callback would render here; none must exist
    }
    expect(h.counts.steps - steps).toBeGreaterThanOrEqual(599);
    expect(h.counts.steps - steps).toBeLessThanOrEqual(601);
    expect(h.counts.renders).toBe(renders);
    // Visible again: the timer stops and rAF rendering resumes without a burst.
    h.loop.setVisibility(false);
    expect(h.timers.size).toBe(0);
    h.frame(STEP_MS);
    expect(h.counts.renders).toBe(renders + 1);
    expect(h.counts.steps - steps).toBeLessThanOrEqual(602);
  });

  it("caps a hidden tick at MAX_STEPS_HIDDEN steps with policy 'simulate'", () => {
    const h = harness();
    h.loop.setBackgroundPolicy('simulate');
    h.loop.start();
    h.loop.setVisibility(true);
    h.throttledTick(10_000);
    expect(h.counts.steps).toBe(MAX_STEPS_HIDDEN);
    h.throttledTick(HIDDEN_TICK_MS + 10);
    expect(h.counts.steps).toBe(MAX_STEPS_HIDDEN + 3);
  });

  it("with policy 'pause', hiding yields no steps and no renders; showing resumes without a burst", () => {
    const h = harness();
    h.loop.start();
    h.frame(STEP_MS);
    const steps = h.counts.steps;
    const renders = h.counts.renders;
    h.loop.setVisibility(true);
    for (let i = 0; i < 10; i++) {
      h.throttledTick(1000);
      h.frame(1000);
    }
    expect(h.counts.steps).toBe(steps);
    expect(h.counts.renders).toBe(renders);
    h.loop.setVisibility(false);
    h.frame(STEP_MS);
    expect(h.counts.steps - steps).toBeGreaterThanOrEqual(1);
    expect(h.counts.steps - steps).toBeLessThanOrEqual(2);
    expect(h.counts.renders).toBe(renders + 1);
  });

  it('switching to simulate while hidden starts the background loop', () => {
    const h = harness();
    h.loop.start();
    h.loop.setVisibility(true);
    h.loop.setBackgroundPolicy('simulate');
    h.throttledTick(1000);
    expect(h.counts.steps).toBe(60);
    expect(h.counts.renders).toBe(0);
  });

  it('fastForward(60) runs exactly 3600 steps without rendering', () => {
    const h = harness();
    h.loop.start();
    h.loop.fastForward(60);
    expect(h.counts.steps).toBe(3600);
    expect(h.counts.renders).toBe(0);
  });

  it('stop cancels every scheduled callback', () => {
    const h = harness();
    h.loop.setBackgroundPolicy('simulate');
    h.loop.start();
    h.loop.stop();
    expect(h.frames.size).toBe(0);
    h.loop.start();
    h.loop.setVisibility(true);
    h.loop.stop();
    expect(h.timers.size).toBe(0);
  });
});

it('stops stepping within the frame once a step pauses the loop, and resumes with no catch-up burst (#11)', () => {
  let time = 0;
  let pending: (() => void) | null = null;
  let steps = 0;
  const loop = createLoop({
    step: () => {
      steps++;
      // The level-up choice: the second step of the frame pauses the loop.
      if (steps === 2) loop.pause();
    },
    render: () => undefined,
    now: () => time,
    raf: (cb) => {
      pending = cb;
      return 1;
    },
    cancelRaf: () => undefined,
  });
  const frame = (ms: number): void => {
    time += ms;
    const cb = pending;
    pending = null;
    cb?.();
  };
  loop.start();
  frame(STEP_MS * MAX_STEPS);
  expect(steps).toBe(2);
  frame(1000);
  expect(steps).toBe(2);
  loop.resume();
  frame(STEP_MS);
  expect(steps).toBe(3);
});

it('forceEnd (#20): pause and stop leave no step or render scheduled; the next run restarts without a burst', () => {
  const h = harness();
  h.loop.setBackgroundPolicy('simulate');
  h.loop.start();
  h.frame(STEP_MS * 3);
  const before = { ...h.counts };
  expect(before.steps).toBeGreaterThan(0);
  h.loop.pause();
  h.loop.stop();
  h.frame(1000);
  h.loop.setVisibility(true);
  h.loop.setVisibility(false);
  h.frame(1000);
  expect(h.counts.steps).toBe(before.steps);
  expect(h.counts.renders).toBe(before.renders);
  expect(h.frames.size).toBe(0);
  expect(h.timers.size).toBe(0);
  h.loop.resume();
  h.loop.start();
  h.frame(STEP_MS * 3);
  // No catch-up for the two stopped seconds: at most the three steps of this frame.
  expect(h.counts.steps - before.steps).toBeGreaterThan(0);
  expect(h.counts.steps - before.steps).toBeLessThanOrEqual(3);
});
