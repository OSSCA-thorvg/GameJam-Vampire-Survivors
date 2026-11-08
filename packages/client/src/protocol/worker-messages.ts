// The only message contract between the main thread and the game worker (ADR 0004). Types only: compiled by both
// tsconfig.main.json and tsconfig.worker.json. Later issues extend these unions; every `switch` on `type` or `kind`
// is exhaustive and ends in `assertNever` (./assert-never.ts).

/** Hidden-tab behaviour: `'pause'` for single player, `'simulate'` for versus play (ADRs 0004, 0005). */
export type BackgroundPolicy = 'pause' | 'simulate';

/** -1, 0 or 1 on one axis. */
export type Axis = -1 | 0 | 1;

export type MainToWorker =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      scale: number;
      assetBaseUrl: string;
    }
  | { type: 'resize'; width: number; height: number; scale: number }
  | { type: 'input'; dx: Axis; dy: Axis }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'setBackgroundPolicy'; policy: BackgroundPolicy }
  | { type: 'debug'; command: DebugCommand }
  | TestSnapshotRequest;

export type WorkerToMain =
  | { type: 'ready'; renderer: 'gl' }
  | { type: 'fatal'; message: string }
  | { type: 'stats'; fps: number; stepsPerSecond: number }
  | TestSnapshotReply;

/**
 * Test bridge messages, dev and e2e builds only (main/test-bridge.ts, worker/test-bridge.ts). Each receiver filters
 * them out before its exhaustive `switch`, inside the dev/e2e guard, so production bundles do not even contain the
 * `type` string (`scripts/verify/check-prod-bundle.mjs`). The switches therefore take `GameMainToWorker` and
 * `GameWorkerToMain`.
 */
export interface TestSnapshotRequest {
  type: 'testSnapshot';
  requestId: number;
}
/** The answer to `TestSnapshotRequest` with the same `requestId`. */
export interface TestSnapshotReply {
  type: 'testSnapshot';
  requestId: number;
  snapshot: WorkerSnapshot;
}
/** `MainToWorker` without the test bridge request: what the worker's `switch` handles. */
export type GameMainToWorker = Exclude<MainToWorker, TestSnapshotRequest>;
/** `WorkerToMain` without the test bridge reply: what the main thread's `switch` handles. */
export type GameWorkerToMain = Exclude<WorkerToMain, TestSnapshotReply>;

// Extended by later issues; this issue defines the first two. Dev builds only (main/debug.ts, worker/debug.ts).
export type DebugCommand = { kind: 'togglePerfOverlay' } | { kind: 'fastForward'; seconds: number };

/**
 * Read-only worker state for verification (`window.__vsTest`, dev and e2e builds only). One flat object: fields
 * added with `registerSnapshotField` (worker/test-bridge.ts) appear at the top level and replace a base field of the
 * same name.
 */
export interface WorkerSnapshot {
  renderer: 'gl';
  /** Simulated seconds since boot (`steps / 60`). */
  timeS: number;
  steps: number;
  /** Rendered frames per second over the last full second. */
  fps: number;
  paused: boolean;
  hidden: boolean;
  backgroundPolicy: BackgroundPolicy;
  perfOverlay: boolean;
  /** Fields added with `registerSnapshotField`. */
  [field: string]: unknown;
}

/** What `window.__vsTest.snapshot()` returns: the worker snapshot plus main-thread fields (`registerMainSnapshotField`). */
export type GameSnapshot = WorkerSnapshot & {
  /** A `ready` message was received. */
  ready: boolean;
  /** Git revision the client was served from (`__VS_BUILD_REV__`). */
  buildRev: string;
  /** `'booting'` until `ready`, then `'running'`; #9 replaces it with the screen name. */
  state: string;
};
