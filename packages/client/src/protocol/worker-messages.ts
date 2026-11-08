// The only message contract between the main thread and the game worker (ADR 0004). Types only: compiled by both
// tsconfig.main.json and tsconfig.worker.json. Later issues extend these unions; every `switch` on `type` or `kind`
// is exhaustive and ends in `assertNever` (./assert-never.ts).
import type { AssetId, PassiveId, WeaponId } from '@vs/shared';

/** Hidden-tab behaviour: `'pause'` for single player, `'simulate'` for versus play (ADRs 0004, 0005). */
export type BackgroundPolicy = 'pause' | 'simulate';

/** -1, 0 or 1 on one axis. */
export type Axis = -1 | 0 | 1;

/** One run's results (#9): sent with `gameOver` and shown on the results screen. */
export interface RunStats {
  /** Simulated seconds survived. */
  timeSec: number;
  /** Enemies killed by weapons (#10). */
  kills: number;
  /** The level reached (#11). */
  level: number;
}

/** One card of the level-up choice (#11; passives #12). Text and icon come from content data only. */
export type LevelUpOption =
  | { kind: 'newWeapon'; weaponId: WeaponId; name: string; description: string; iconId: AssetId }
  | {
      kind: 'upgradeWeapon';
      weaponId: WeaponId;
      name: string;
      toLevel: number;
      description: string;
      iconId: AssetId;
    }
  | {
      kind: 'newPassive';
      passiveId: PassiveId;
      name: string;
      description: string;
      iconId: AssetId;
    }
  | {
      kind: 'upgradePassive';
      passiveId: PassiveId;
      name: string;
      toLevel: number;
      description: string;
      iconId: AssetId;
    }
  | { kind: 'heal'; amount: number; description: string; iconId: null };

export type MainToWorker =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      scale: number;
      assetBaseUrl: string;
      debug?: { gallery: boolean; stress: string };
    }
  | { type: 'resize'; width: number; height: number; scale: number }
  | { type: 'input'; dx: Axis; dy: Axis }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'setBackgroundPolicy'; policy: BackgroundPolicy }
  /** #9: clears the previous run and starts a fresh one (unpaused). The worker starts no run on boot. */
  | { type: 'startRun'; seed: number; characterId: string }
  /** #9: clears the run and draws an empty frame (back to the title). */
  | { type: 'endRun' }
  /** #11: the option chosen on the open level-up screen, an index into its `options`. */
  | { type: 'levelUpChoice'; index: number }
  | { type: 'debug'; command: DebugCommand }
  | TestSnapshotRequest;

export type WorkerToMain =
  | { type: 'ready'; renderer: 'gl' }
  | { type: 'loadProgress'; loaded: number; total: number }
  | { type: 'assetsReady'; placeholders: string[] }
  | { type: 'fatal'; message: string }
  | { type: 'stats'; fps: number; stepsPerSecond: number }
  /** #9: the player's HP reached 0; the run has stopped. Sent once per run. */
  | { type: 'gameOver'; stats: RunStats }
  /**
   * #11: a level-up is waiting; the worker has paused the run. `level` is the level being reached. Sent again, one at a
   * time, after each `levelUpChoice` while more are pending.
   */
  | { type: 'levelUp'; level: number; options: LevelUpOption[] }
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

// Extended by later issues (#2 defined the first two). Dev builds only (main/debug.ts, worker/debug.ts).
export type DebugCommand =
  | { kind: 'togglePerfOverlay' }
  | { kind: 'fastForward'; seconds: number }
  /** #5: toggles the `?gallery` speed preview (`KeyV`). */
  | { kind: 'galleryPreview' }
  /** #10: adds the first weapon of `WEAPON_LIST` the player does not own, at level 1 (`KeyG`). */
  | { kind: 'grantWeapon' }
  /** #11: grants exactly the XP missing for the next level (`KeyL`). */
  | { kind: 'levelUp' }
  /** #12: adds the first passive of `PASSIVES` not owned or, with 6 owned, levels the first below max (`KeyP`). */
  | { kind: 'grantPassive' }
  /** #16: drops the next `PICKUPS` entry (cycling, ignoring its level gate) 48 units right of the player (`KeyK`). */
  | { kind: 'spawnPickup' };

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
  /** `'booting'` until `ready`; then the screen from `main/app.ts` (#9): `'title'`, `'playing'`, `'levelUp'` (#11) or `'results'`. */
  state: string;
};
