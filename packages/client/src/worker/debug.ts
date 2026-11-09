// Dev-only debug tools, worker side. Every call into this module is wrapped in `if (import.meta.env.DEV) { … }`, and
// the module has no top-level side effects, so production builds drop it (checked by grepping the bundle for
// `togglePerfOverlay`). Later issues add commands with `registerDebugHandler`; they never edit a switch. Keys are
// bound on the main thread (`main/debug.ts`). The overlay itself is production-safe and lives in `perf/overlay.ts`
// (#22); this module only binds its toggle and adds the `fps` and `steps/s` lines.
import { registerSnapshotField } from './test-bridge';
import type { DebugCommand, WorkerToMain } from '../protocol/worker-messages';
import type { Loop } from './loop';
import { perfOverlayVisible, registerPerfStat, setPerfOverlayVisible } from './perf/overlay';

type Handler<K extends DebugCommand['kind']> = (
  command: Extract<DebugCommand, { kind: K }>,
) => void;

const handlers = new Map<DebugCommand['kind'], (command: DebugCommand) => void>();
const warnedKinds = new Set<string>();

/** `stats` messages are posted once per second. */
const STATS_INTERVAL_MS = 1000;

/** Registers the worker handler for a debug command kind. A second registration for the same kind replaces the first. */
export function registerDebugHandler<K extends DebugCommand['kind']>(
  kind: K,
  fn: Handler<K>,
): void {
  if (handlers.has(kind)) console.warn(`[debug] handler for '${kind}' replaced`);
  handlers.set(kind, fn as (command: DebugCommand) => void);
}

/** Runs the handler for a debug command; an unknown kind logs one warning per kind. */
export function dispatchDebug(command: DebugCommand): void {
  const fn = handlers.get(command.kind);
  if (fn) {
    fn(command);
    return;
  }
  if (!warnedKinds.has(command.kind)) {
    warnedKinds.add(command.kind);
    console.warn(`[debug] no handler for '${command.kind}'`);
  }
}

export interface WorkerDebugOptions {
  loop: Loop;
  post: (message: WorkerToMain) => void;
  /** Describes the simulation state for the dev log, for example the run's time and player position. */
  describe: () => string;
  now?: () => number;
}

export interface WorkerDebugHooks {
  /** Call once per simulation step. */
  onStep(): void;
  /** Call once per rendered frame, before `canvas.update()`. */
  onRender(): void;
  /** Call when the tab's visibility changes; logs the steps and renders that happened while hidden. */
  onVisibility(hidden: boolean): void;
}

/**
 * Installs the built-in handlers, the overlay's `fps` and `steps/s` lines and the `stats` counter. Call once after
 * ThorVG is ready and the perf overlay is installed (`perf/overlay.ts`).
 */
export function installWorkerDebugTools(opts: WorkerDebugOptions): WorkerDebugHooks {
  const { loop, post, describe } = opts;
  const now = opts.now ?? (() => performance.now());

  let frames = 0;
  let steps = 0;
  let totalSteps = 0;
  let totalRenders = 0;
  registerSnapshotField('renders', () => totalRenders);
  let windowStart = now();
  let fps = 0;
  let stepsPerSecond = 0;
  let hiddenAt: { steps: number; renders: number; time: number } | null = null;
  registerPerfStat('fps', () => fps.toFixed(0));
  registerPerfStat('steps/s', () => stepsPerSecond.toFixed(0));

  setInterval(() => {
    const t = now();
    const seconds = (t - windowStart) / 1000;
    fps = frames / seconds;
    stepsPerSecond = steps / seconds;
    frames = 0;
    steps = 0;
    windowStart = t;
    post({ type: 'stats', fps, stepsPerSecond });
  }, STATS_INTERVAL_MS);

  registerDebugHandler('togglePerfOverlay', () => {
    const show = !perfOverlayVisible();
    setPerfOverlayVisible(show);
    console.warn(`[debug] perf overlay ${show ? 'shown' : 'hidden'}`);
  });
  registerDebugHandler('fastForward', (command) => {
    const before = describe();
    const t = now();
    loop.fastForward(command.seconds);
    console.warn(
      `[debug] fastForward ${String(command.seconds)} s in ${(now() - t).toFixed(1)} ms: ${before} -> ${describe()}`,
    );
  });

  return {
    onStep() {
      steps++;
      totalSteps++;
    },
    onRender() {
      frames++;
      totalRenders++;
    },
    onVisibility(hidden) {
      if (hidden) {
        hiddenAt = { steps: totalSteps, renders: totalRenders, time: now() };
        console.warn(`[worker] hidden: ${describe()}`);
        return;
      }
      if (!hiddenAt) return;
      const seconds = (now() - hiddenAt.time) / 1000;
      console.warn(
        `[worker] visible after ${seconds.toFixed(1)} s hidden: steps while hidden ${String(totalSteps - hiddenAt.steps)}, ` +
          `renders while hidden ${String(totalRenders - hiddenAt.renders)}; ${describe()}`,
      );
      hiddenAt = null;
    },
  };
}
