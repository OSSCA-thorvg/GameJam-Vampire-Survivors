// The only message contract between the main thread and the game worker (ADR 0004). Types only: compiled by both
// tsconfig.main.json and tsconfig.worker.json. Later issues extend these unions; every `switch` on `type` or `kind`
// is exhaustive and ends in `assertNever` (./assert-never.ts).
import type {
  AssetId,
  ChestReward,
  InterferenceKind,
  PassiveId,
  PlayerView,
  WeaponId,
} from '@vs/shared';

/** Hidden-tab behaviour: `'pause'` for single player, `'simulate'` for versus play (ADRs 0004, 0005). */
export type BackgroundPolicy = 'pause' | 'simulate';

/**
 * #115, ADR 0018: one full view, or two equal panes left/right (`columns`) or top/bottom (`rows`). Re-declared from
 * `main/viewport.ts`, which `tsconfig.worker.json` does not compile; `viewport.test.ts` keeps them equal.
 */
export type PaneLayout = 'single' | 'columns' | 'rows';

/** #115: how the opponent pane is shown: playing, away or disconnected (dimmed), or out of the match (dimmer). */
export type OpponentState = 'live' | 'away' | 'out';

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

/**
 * The `gameOver` payload (#17): #9's `RunStats` plus what the results screen lists. `cleared` is true once the run
 * reached the time limit, even when Death killed the player afterwards. `weapons` are sorted by `damage`, descending.
 */
export interface RunSummary extends RunStats {
  cleared: boolean;
  /** The `CharacterId` played. */
  characterId: string;
  /** Damage counted up to each enemy's remaining HP; an evolved weapon keeps its slot, so its total carries over. */
  weapons: { id: string; level: number; damage: number }[];
  passives: { id: string; level: number }[];
}

/**
 * What the time limit does (#17): `'death'` (single player) clears the screen and spawns Death; `'end'` (versus, #20)
 * ends the run with `cleared: true` and no Death (ADR 0005).
 */
export type Finale = 'death' | 'end';

/** Who a run is for (#20): `'single'` player, or a `'versus'` match, which always runs with `finale: 'end'` (ADR 0005). */
export type RunMode = 'single' | 'versus';

/**
 * #20: the local player's state, posted by a `'versus'` run every 250 ms of simulated time and once more on death;
 * the main thread relays it as the protocol's `status` (`PlayerStatus`). `hp` is clamped to `0..maxHp`.
 */
export interface WorkerStatus {
  type: 'status';
  hp: number;
  maxHp: number;
  level: number;
  kills: number;
  alive: boolean;
  elapsedMs: number;
}

/**
 * #114: the local world's view (ADR 0018), posted by a `'versus'` run every 0.1 s of simulated time while the tab is
 * visible; the main thread sends it as the protocol's `view`.
 */
export interface WorkerView {
  type: 'view';
  view: PlayerView;
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
      /** #115: the pane layout the backing size was computed for. */
      layout: PaneLayout;
      assetBaseUrl: string;
      /**
       * Dev, e2e and perf builds only. `skipSplash` (#126, dev and e2e only): the e2e build skips the boot splash
       * unless `?splash=full`, the dev build plays it unless `?splash=skip`; production always plays it.
       */
      debug?: { gallery: boolean; stress: string; skipSplash?: boolean };
      /** #22: the page was opened with `?perf`, so the perf overlay is shown from boot, in every build. */
      perf: boolean;
    }
  | { type: 'resize'; width: number; height: number; scale: number; layout: PaneLayout }
  | { type: 'input'; dx: Axis; dy: Axis }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'setBackgroundPolicy'; policy: BackgroundPolicy }
  /**
   * #9: clears the previous run and starts a fresh one (unpaused). The worker starts no run on boot. `finale` (#17)
   * defaults to `'death'`; `mode` (#20) defaults to `'single'`, and a `'versus'` run always uses `finale: 'end'`.
   */
  | { type: 'startRun'; seed: number; characterId: string; finale?: Finale; mode?: RunMode }
  /** #20: the versus match is decided; the loop stops and the last frame stays on the canvas until the next run. */
  | { type: 'forceEnd'; reason: 'matchOver' }
  /** #9: clears the run and draws an empty frame (back to the title). */
  | { type: 'endRun' }
  /** #11: the option chosen on the open level-up screen, an index into its `options`. */
  | { type: 'levelUpChoice'; index: number }
  /** #15: the chest overlay closed (Enter or its timer); the worker resumes the run. */
  | { type: 'chestClosed' }
  /**
   * #21: an opponent's interference reached this player (the server's `interferenceIncoming`; the nickname stays on
   * the main thread). Applied at the start of the next step; a `kind` outside `INTERFERENCE_KINDS` is ignored.
   */
  | { type: 'applyInterference'; kind: InterferenceKind }
  /** #114: the first opponent's relayed `peerView` (ADR 0018); display data only, kept by the opponent feed. */
  | { type: 'opponentView'; view: PlayerView }
  /** #115: the opponent is away (hidden tab) or disconnected, back (`'live'`), or eliminated (`'out'`). */
  | { type: 'opponentState'; state: OpponentState }
  | { type: 'debug'; command: DebugCommand }
  | TestSnapshotRequest;

export type WorkerToMain =
  | { type: 'ready'; renderer: 'gl' }
  | { type: 'loadProgress'; loaded: number; total: number }
  | { type: 'assetsReady'; placeholders: string[] }
  /**
   * #126: the boot splash is over; `played` is true only when the animation ran to its end (and now holds its last
   * frame until `ready`), false when it was skipped or unavailable. Once per boot, before `ready`.
   */
  | { type: 'splashEnded'; played: boolean }
  | { type: 'fatal'; message: string }
  | { type: 'stats'; fps: number; stepsPerSecond: number }
  /** #9: HP reached 0, or (#17) the time limit ended a `finale: 'end'` run; the run has stopped. Once per run. */
  | { type: 'gameOver'; stats: RunSummary }
  /**
   * #11: a level-up is waiting; the worker has paused the run. `level` is the level being reached. Sent again, one at a
   * time, after each `levelUpChoice` while more are pending.
   */
  | { type: 'levelUp'; level: number; options: LevelUpOption[] }
  /** #15: a chest opened and its rewards are already applied; the worker has paused the run until `chestClosed`. */
  | { type: 'chestOpened'; rewards: ChestReward[] }
  /** #21: the player walked into an interference pickup; the main thread sends it to the server. */
  | { type: 'interferenceCollected'; kind: InterferenceKind }
  /**
   * #129: the world sounds cued since the last rendered frame, at most one per frame and only when non-zero; bit `i`
   * is `WORLD_SFX[i]` (`@vs/shared`). The main thread plays them; hidden-tab ticks never render, so never post it.
   */
  | { type: 'sfx'; mask: number }
  | WorkerStatus
  /** #22: a named `?stress` scenario finished its measured window (dev and `perf` builds only). */
  | { type: 'stressResult'; result: StressResult }
  | WorkerView
  | StressProgress
  | TestSnapshotReply;

/**
 * #119: a named `?stress` scenario's progress (dev and `perf` builds only): every 10 s of wall time from its first
 * frame, with `error: null`, and once for every uncaught worker error or unhandled rejection while it runs, with
 * `error` set to the stack. The main thread filters it out before its exhaustive `switch`, inside the dev/perf guard,
 * so the normal production bundle does not contain the `type` string.
 */
export interface StressProgress {
  type: 'stressProgress';
  scenario: string;
  phase: 'warmup' | 'measuring';
  /** Wall-clock seconds since the scenario started recording. */
  elapsedS: number;
  /** Simulation steps and rendered frames since boot and since the first recorded frame. */
  steps: number;
  frames: number;
  /** Simulated seconds (the world's `time`, or steps / 60 for the Lottie scenes). */
  simS: number;
  error: string | null;
}

/**
 * The worker's half of a stress scenario's summary (#22). All timings are milliseconds over the measured window,
 * after the warm-up: `medianMs`/`p95Ms`/`maxMs` of the frame interval, the median sim time per step and the median
 * transform, `canvas.update()` and `canvas.render()` time per frame. The main thread adds `ua`, `gpu` and `loadMs`.
 */
export interface StressResult {
  scenario: string;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  simMs: number;
  transformMs: number;
  updateMs: number;
  renderMs: number;
  /** Means of the same phases: worker clocks are often coarsened to 0.1 ms, so medians of sub-ms phases are coarse. */
  meanMs: { sim: number; transform: number; update: number; render: number };
  frames: number;
  steps: number;
  durationS: number;
  /** The largest live count of each kind seen while measuring (`enemies`, `projectiles`, `gems`, `pickups`, `paints`). */
  maxCounts: Record<string, number>;
}

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
/** `WorkerToMain` without the test bridge reply and #119's stress progress: what the main thread's `switch` handles. */
export type GameWorkerToMain = Exclude<WorkerToMain, TestSnapshotReply | StressProgress>;

// Extended by later issues (#2 defined the first two). Dev builds only (main/debug.ts, worker/debug.ts).
export type DebugCommand =
  | { kind: 'togglePerfOverlay' }
  | { kind: 'fastForward'; seconds: number }
  /** #5: toggles the `?gallery` speed preview (`KeyV`). */
  | { kind: 'galleryPreview' }
  | { kind: 'galleryMotion' }
  /** #10: adds the first weapon of `WEAPON_LIST` the player does not own, at level 1 (`KeyG`). */
  | { kind: 'grantWeapon' }
  /** #11: grants exactly the XP missing for the next level (`KeyL`). */
  | { kind: 'levelUp' }
  /** #12: adds the first passive of `PASSIVES` not owned or, with 6 owned, levels the first below max (`KeyP`). */
  | { kind: 'grantPassive' }
  /** #16: drops the next `PICKUPS` entry (cycling, ignoring its level gate) 48 units right of the player (`KeyK`). */
  | { kind: 'spawnPickup' }
  /** #15: sets up the next pair of `EVOLUTIONS` and spawns an elite whose chest evolves it (`KeyE`). */
  | { kind: 'forceEvolution' }
  /** #15: spawns `reaper5` on the spawn ring (`KeyB`). */
  | { kind: 'spawnBoss' }
  /** #17: toggles `world.debugInvulnerable`, so long fast-forwarded runs survive (`KeyI`). */
  | { kind: 'toggleInvulnerable' }
  /** #21: drops the next interference pickup (cycling, ignoring the drop rules) 48 units right of the player (`KeyJ`, versus only). */
  | { kind: 'spawnInterference' };

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
  /** `'booting'` until `ready`; then the screen from `main/app.ts` (#9): `'title'`, `'playing'`, `'levelUp'` (#11), `'chest'` (#15), `'results'`, `'versusPlaying'` or `'versusResult'` (#20). */
  state: string;
};
