// Runtime game worker errors (#123). An `error` event from the worker before its `ready` message means the game never
// started (the module failed to load or evaluate), so the page gets today's full-screen message. After `ready` the
// screens stay mounted and a small DOM notice (ADR 0004: never the canvas) offers Reload and Dismiss. Reload, not "the
// game goes on": an exception in a loop step or render stops `worker/loop.ts`'s rAF chain for good. Text goes through
// `textContent` only (ADR 0011); the error message is not trusted markup.
import { h } from './ui/dom';

/** The fields of a worker `ErrorEvent` this module reads. */
export interface WorkerErrorLike {
  message: string;
  filename: string;
  lineno: number;
  colno: number;
}

export interface RuntimeErrorReporter {
  /** Logs the error and shows (or updates) the `#runtime-error` notice. */
  report(event: WorkerErrorLike): void;
  /** How many errors were reported since boot, read by the `runtimeErrors` snapshot field (dev and e2e). */
  readonly count: number;
}

const HEADLINE = 'Something went wrong in the game. Reload to start again.';

/**
 * Appends the notice to `root` on the first report, never replacing its children. Later reports while it is shown
 * only update the detail line to `<message> (<count> errors)`; Dismiss removes it, and the next report mounts it again.
 */
export function createRuntimeErrorReporter(
  root: HTMLElement,
  reload: () => void = () => {
    location.reload();
  },
): RuntimeErrorReporter {
  let count = 0;
  let notice: HTMLElement | null = null;
  let detail: HTMLElement | null = null;

  const mount = (text: string): void => {
    detail = h('p', { class: 'runtime-error-detail', text });
    const el = h('div', { id: 'runtime-error', role: 'alert' }, [
      h('p', { text: HEADLINE }),
      detail,
      h('div', { class: 'runtime-error-actions' }, [
        h('button', {
          type: 'button',
          text: 'Reload',
          'on:click': () => {
            reload();
          },
        }),
        h('button', {
          type: 'button',
          text: 'Dismiss',
          'on:click': () => {
            el.remove();
            notice = null;
            detail = null;
          },
        }),
      ]),
    ]);
    notice = el;
    root.append(el);
  };

  return {
    report(event) {
      console.error(
        `[vs] game worker runtime error: ${event.message} at ${event.filename}:${String(event.lineno)}:${String(event.colno)}`,
      );
      count++;
      const message = event.message || 'Unknown error';
      if (notice && detail) detail.textContent = `${message} (${String(count)} errors)`;
      else mount(message);
    },
    get count() {
      return count;
    },
  };
}

/**
 * Sends a worker `error` event to `fatal` before the worker's `ready` message, and to `reporter` after it. Returns
 * which path it took.
 */
export function routeWorkerError(
  ready: boolean,
  event: WorkerErrorLike,
  fatal: (event: WorkerErrorLike) => void,
  reporter: { report(event: WorkerErrorLike): void },
): 'fatal' | 'runtime' {
  if (!ready) {
    fatal(event);
    return 'fatal';
  }
  reporter.report(event);
  return 'runtime';
}
