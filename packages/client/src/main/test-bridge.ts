// Test bridge, main-thread side (dev and e2e builds only). The canvas belongs to the worker (ADR 0004), so its state
// cannot be read through the DOM: `window.__vsTest` asks the worker over `worker-messages.ts` instead. Every call into
// this module is wrapped in `if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') { … }`, and the module has no
// top-level side effects, so production builds drop it (`scripts/verify/check-prod-bundle.mjs` greps for `__vsTest`).
// It only reads state. Later issues add fields with `registerMainSnapshotField` and never edit it.
import type { GameSnapshot, MainToWorker, TestSnapshotReply } from '../protocol/worker-messages';

type SnapshotMessage = TestSnapshotReply;

export interface VsTest {
  /** Asks the worker for its state and adds the main-thread fields; rejects after 2 s. */
  snapshot(): Promise<GameSnapshot>;
  /** Polls `snapshot` every 50 ms until `predicate` holds; rejects after `timeoutMs`. */
  waitFor(predicate: (s: GameSnapshot) => boolean, timeoutMs: number): Promise<GameSnapshot>;
}

declare global {
  var __vsTest: VsTest | undefined;
}

export interface MainTestBridge {
  /** Call when the worker's `ready` message arrives. */
  onReady(): void;
  /** Call with every `testSnapshot` message from the worker. */
  onSnapshot(message: SnapshotMessage): void;
}

const SNAPSHOT_TIMEOUT_MS = 2000;
const POLL_MS = 50;

const mainFields = new Map<string, () => unknown>();

/**
 * Adds `name` to every `GameSnapshot`, merged last, so it replaces a worker field or default of the same name (for
 * example #9's `state`). Registering the same name twice logs a warning and keeps the first.
 */
export function registerMainSnapshotField(name: string, read: () => unknown): void {
  if (mainFields.has(name)) {
    console.warn(`[test] main snapshot field '${name}' is already registered; ignored`);
    return;
  }
  mainFields.set(name, read);
}

/** Exposes `globalThis.__vsTest`. Call once, right after the worker is created. */
export function installTestBridge(post: (message: MainToWorker) => void): MainTestBridge {
  let ready = false;
  let nextId = 1;
  const pending = new Map<number, (message: SnapshotMessage) => void>();

  const snapshot = (): Promise<GameSnapshot> =>
    new Promise((resolve, reject) => {
      const requestId = nextId++;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            `__vsTest.snapshot: no answer from the worker within ${String(SNAPSHOT_TIMEOUT_MS)} ms`,
          ),
        );
      }, SNAPSHOT_TIMEOUT_MS);
      pending.set(requestId, (message) => {
        clearTimeout(timer);
        const result: GameSnapshot = {
          ...message.snapshot,
          ready,
          buildRev: __VS_BUILD_REV__,
          state: ready ? 'running' : 'booting',
        };
        for (const [name, read] of mainFields) result[name] = read();
        resolve(result);
      });
      post({ type: 'testSnapshot', requestId });
    });

  const waitFor = async (
    predicate: (s: GameSnapshot) => boolean,
    timeoutMs: number,
  ): Promise<GameSnapshot> => {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const last = await snapshot();
      if (predicate(last)) return last;
      if (performance.now() >= deadline) {
        throw new Error(
          `__vsTest.waitFor timed out after ${String(timeoutMs)} ms; last snapshot: ${JSON.stringify(last)}`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };

  globalThis.__vsTest = { snapshot, waitFor };

  return {
    onReady() {
      ready = true;
    },
    onSnapshot(message) {
      const resolve = pending.get(message.requestId);
      if (!resolve) return;
      pending.delete(message.requestId);
      resolve(message);
    },
  };
}
