// Dev-only debug tools, main-thread side. Every call into this module is wrapped in `if (import.meta.env.DEV) { … }`,
// and the module has no top-level side effects, so production builds drop it (checked by grepping the bundle for
// `__vsDebug`). Later issues add keys with `registerDebugKey`; every key is listed in CLAUDE.md's reserved-keys table.
import type { DebugCommand, MainToWorker, WorkerToMain } from '../protocol/worker-messages';

type StatsMessage = Extract<WorkerToMain, { type: 'stats' }>;

export interface VsDebug {
  /** Sends any worker message, for example `__vsDebug.post({ type: 'setBackgroundPolicy', policy: 'simulate' })`. */
  post(message: MainToWorker): void;
  /** The most recent `stats` messages from the worker, oldest first, with the time they arrived. */
  stats: (StatsMessage & { at: number })[];
}

declare global {
  var __vsDebug: VsDebug | undefined;
}

/** How many `stats` messages `__vsDebug.stats` keeps. */
const STATS_KEPT = 300;

const keys = new Map<string, DebugCommand>();
const statsLog: (StatsMessage & { at: number })[] = [];

/** Binds a `KeyboardEvent.code` to a debug command. A code that is already bound logs a warning and is ignored. */
export function registerDebugKey(code: string, command: DebugCommand): void {
  if (keys.has(code)) {
    console.warn(`[debug] key ${code} is already registered; ignored`);
    return;
  }
  keys.set(code, command);
}

/** Records a worker `stats` message for `__vsDebug.stats`. */
export function recordStats(message: StatsMessage): void {
  statsLog.push({ ...message, at: performance.now() });
  if (statsLog.length > STATS_KEPT) statsLog.shift();
}

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/** Registers the built-in keys, forwards registered keys to the worker, and exposes `globalThis.__vsDebug`. */
export function installDebugTools(worker: Worker): void {
  const post = (message: MainToWorker): void => {
    worker.postMessage(message);
  };
  if (!keys.has('Backquote')) registerDebugKey('Backquote', { kind: 'togglePerfOverlay' });
  if (!keys.has('BracketRight'))
    registerDebugKey('BracketRight', { kind: 'fastForward', seconds: 60 });

  document.addEventListener('keydown', (e) => {
    if (e.repeat || isTextField(e.target)) return;
    const command = keys.get(e.code);
    if (!command) return;
    e.preventDefault();
    post({ type: 'debug', command });
  });

  globalThis.__vsDebug = { post, stats: statsLog };
  console.warn(
    '[debug] dev tools installed: ` perf overlay, ] fast-forward 60 s, __vsDebug.post(message)',
  );
}
