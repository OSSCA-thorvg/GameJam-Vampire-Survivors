// Dev-only debug tools, worker side. Every call into this module is wrapped in `if (import.meta.env.DEV) { … }`, and
// the module has no top-level side effects, so production builds drop it (checked by grepping the bundle for
// `togglePerfOverlay`). Later issues add commands with `registerDebugHandler` and overlay lines with
// `registerPerfStat`; they never edit a switch. Keys are bound on the main thread (`main/debug.ts`).
import type { Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import type { DebugCommand, WorkerToMain } from '../protocol/worker-messages';
import type { Loop } from './loop';
import { HUD_FONT } from './render/thorvg';

type Handler<K extends DebugCommand['kind']> = (
  command: Extract<DebugCommand, { kind: K }>,
) => void;

const handlers = new Map<DebugCommand['kind'], (command: DebugCommand) => void>();
const warnedKinds = new Set<string>();
const perfStats: { label: string; read: () => string | number }[] = [];

/** Overlay text refresh interval: at most 4 updates per second. */
const OVERLAY_INTERVAL_MS = 250;
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

/** Adds a line to the perf overlay (for example #6's `entities`, `paints created` and `step ms`). */
export function registerPerfStat(label: string, read: () => string | number): void {
  perfStats.push({ label, read });
}

export interface WorkerDebugOptions {
  TVG: ThorVGNamespace;
  root: Scene;
  loop: Loop;
  post: (message: WorkerToMain) => void;
  /** Describes the simulation state for the dev log, for example the test scene's simulated time. */
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

/** Installs the built-in handlers, the perf overlay and the `stats` counter. Call once after ThorVG is ready. */
export function installWorkerDebugTools(opts: WorkerDebugOptions): WorkerDebugHooks {
  const { TVG, root, loop, post, describe } = opts;
  const now = opts.now ?? (() => performance.now());

  const overlay: Text = new TVG.Text();
  overlay.font(HUD_FONT).fontSize(18).fill(255, 255, 255).translate(12, 12);
  overlay.text('perf');
  overlay.visible(false);
  root.add(overlay);

  let frames = 0;
  let steps = 0;
  let totalSteps = 0;
  let totalRenders = 0;
  let windowStart = now();
  let fps = 0;
  let stepsPerSecond = 0;
  let lastOverlay = 0;
  let hiddenAt: { steps: number; renders: number; time: number } | null = null;

  const overlayText = (): string => {
    const lines = [`fps ${fps.toFixed(0)}`, `steps/s ${stepsPerSecond.toFixed(0)}`];
    for (const stat of perfStats) lines.push(`${stat.label} ${String(stat.read())}`);
    return lines.join('\n');
  };

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
    const show = !overlay.visible();
    overlay.visible(show);
    if (show) {
      overlay.text(overlayText());
      lastOverlay = now();
    }
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
      if (!overlay.visible()) return;
      const t = now();
      if (t - lastOverlay < OVERLAY_INTERVAL_MS) return;
      lastOverlay = t;
      overlay.text(overlayText());
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
