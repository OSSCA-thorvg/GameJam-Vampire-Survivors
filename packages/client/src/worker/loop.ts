import type { BackgroundPolicy } from '../protocol/worker-messages';
import { HIDDEN_TICK_MS, MAX_STEPS, MAX_STEPS_HIDDEN, STEP_MS } from './constants';

/** Longest frame interval fed to the accumulator in a visible tab; longer hitches are treated as this. */
const MAX_FRAME_MS = 250;
/** `fastForward` runs its steps in chunks of this many. */
const FAST_FORWARD_CHUNK = 600;

export interface LoopOptions {
  /** Advances the simulation by one fixed step (`STEP_MS / 1000` seconds). */
  step: (dtSec: number) => void;
  /** Draws one frame; `alpha` is the fraction of a step left in the accumulator. Ends with one update and one render. */
  render: (alpha: number) => void;
  now?: () => number;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Stops calling `step`; rendering continues. */
  pause(): void;
  /** Resumes stepping from now, without a catch-up burst. */
  resume(): void;
  setVisibility(hidden: boolean): void;
  setBackgroundPolicy(policy: BackgroundPolicy): void;
  /** Runs `seconds * 60` steps synchronously, without rendering (dev debug tool). */
  fastForward(seconds: number): void;
}

/**
 * Fixed-timestep game loop (ADR 0004): 60 Hz steps on an accumulator, at most `MAX_STEPS` per visible frame with the
 * remainder dropped, one `render` per frame. In a hidden tab it either pauses (`'pause'`, single player) or switches
 * to a `setTimeout` loop that only steps, capped at `MAX_STEPS_HIDDEN` per tick (`'simulate'`, versus). It never
 * renders while hidden.
 */
export function createLoop(opts: LoopOptions): Loop {
  const { step, render } = opts;
  const now = opts.now ?? (() => performance.now());
  const raf = opts.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf =
    opts.cancelRaf ??
    ((id: number) => {
      cancelAnimationFrame(id);
    });
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;

  const stepSec = STEP_MS / 1000;
  let running = false;
  let paused = false;
  let hidden = false;
  let policy: BackgroundPolicy = 'pause';
  let last = 0;
  let acc = 0;
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  /** True when `step` may run: not paused, and not hidden under the `'pause'` policy. */
  const canStep = (): boolean => !paused && !(hidden && policy === 'pause');

  const advance = (elapsed: number, cap: number): void => {
    if (!canStep()) return;
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP_MS && steps < cap) {
      step(stepSec);
      acc -= STEP_MS;
      steps++;
    }
    // Hitting the cap drops the remainder (ADR 0004): no spiral of death, no catch-up burst.
    if (steps === cap) acc = 0;
  };

  const frame = (): void => {
    rafId = null;
    if (!running || hidden) return;
    const t = now();
    const elapsed = Math.min(t - last, MAX_FRAME_MS);
    last = t;
    advance(elapsed, MAX_STEPS);
    render(canStep() ? acc / STEP_MS : 0);
    rafId = raf(frame);
  };

  const tick = (): void => {
    timerId = null;
    if (!running || !hidden || policy !== 'simulate') return;
    const t = now();
    const elapsed = t - last;
    last = t;
    advance(elapsed, MAX_STEPS_HIDDEN);
    timerId = setTimer(tick, HIDDEN_TICK_MS);
  };

  const cancelScheduled = (): void => {
    if (rafId !== null) {
      cancelRaf(rafId);
      rafId = null;
    }
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  };

  /** Starts the scheduler that matches the current visibility and policy. */
  const schedule = (): void => {
    cancelScheduled();
    if (!running) return;
    last = now();
    if (!hidden) {
      rafId = raf(frame);
    } else if (policy === 'simulate') {
      timerId = setTimer(tick, HIDDEN_TICK_MS);
    }
    // Hidden with the 'pause' policy: nothing runs until the tab is visible again.
  };

  return {
    start() {
      if (running) return;
      running = true;
      acc = 0;
      schedule();
    },
    stop() {
      running = false;
      cancelScheduled();
    },
    pause() {
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      last = now();
    },
    setVisibility(next) {
      if (next === hidden) return;
      hidden = next;
      schedule();
    },
    setBackgroundPolicy(next) {
      if (next === policy) return;
      policy = next;
      if (hidden) schedule();
    },
    fastForward(seconds) {
      let remaining = Math.max(0, Math.round(seconds * 60));
      while (remaining > 0) {
        const chunk = Math.min(remaining, FAST_FORWARD_CHUNK);
        for (let i = 0; i < chunk; i++) step(stepSec);
        remaining -= chunk;
      }
      last = now();
    },
  };
}
