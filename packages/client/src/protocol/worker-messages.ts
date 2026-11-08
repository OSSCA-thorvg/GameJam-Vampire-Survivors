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
  | { type: 'debug'; command: DebugCommand };

export type WorkerToMain =
  | { type: 'ready'; renderer: 'gl' }
  | { type: 'fatal'; message: string }
  | { type: 'stats'; fps: number; stepsPerSecond: number };

// Extended by later issues; this issue defines the first two. Dev builds only (main/debug.ts, worker/debug.ts).
export type DebugCommand = { kind: 'togglePerfOverlay' } | { kind: 'fastForward'; seconds: number };
