// Game worker entry (ADR 0004): owns the simulation and all ThorVG rendering on the transferred OffscreenCanvas.
// It talks to the main thread only through the messages in ../protocol/worker-messages.ts.
import { assertNever } from '../protocol/assert-never';
import type {
  Axis,
  BackgroundPolicy,
  GameMainToWorker,
  MainToWorker,
  TestSnapshotRequest,
  WorkerToMain,
} from '../protocol/worker-messages';
import {
  installWorkerDebugTools,
  dispatchDebug,
  registerDebugHandler,
  registerPerfStat,
  type WorkerDebugHooks,
} from './debug';
import { createLoop, type Loop } from './loop';
import { HUD_FONT, initThorVG, type ThorVGContext } from './render/thorvg';
import { loadManifest } from './assets/manifest';
import { AssetLibrary } from './assets/library';
import { createLayers } from './render/layers';
import { createWorld, type World } from './game/world';
import { readEnemyPositions, readPlayerSnapshot } from './game/snapshot';
import { buildGallery, type Gallery } from './debug/gallery';
import { noteFrame, registerSnapshotField, takeSnapshot } from './test-bridge';
import type { StressScene } from './debug/stress';

declare const self: DedicatedWorkerGlobalScope;

const post = (message: WorkerToMain): void => {
  self.postMessage(message);
};

// State that messages may set before ThorVG is ready.
let ctx: ThorVGContext | null = null;
let loop: Loop | null = null;
let debugHooks: WorkerDebugHooks | null = null;
let booting = false;
let hidden = false;
let paused = false;
let policy: BackgroundPolicy = 'pause';
let inputX: Axis = 0;
let inputY: Axis = 0;
/** Latest backing size and scale; a `resize` that arrives during boot is applied once ThorVG is ready. */
let size = { width: 0, height: 0, scale: 1 };

/** Simulation steps since boot, for the test bridge's `steps` (and `timeS` when no run exists). */
let stepCount = 0;

/** The current run (#7); `null` in `?gallery` and `?stress`. #9 replaces the auto-start with `startRun`. */
let world: World | null = null;
let library: AssetLibrary | null = null;
let gallery: Gallery | null = null;
let stress: StressScene | null = null;
const assetState = {
  ready: false,
  loaded: 0,
  total: 0,
  placeholders: [] as string[],
  font: 'default',
};

const describeScene = (): string =>
  world
    ? `run ${world.time.toFixed(2)} s, player (${world.player.x.toFixed(0)}, ${world.player.y.toFixed(0)})`
    : `steps ${String(stepCount)}`;

function step(dtSec: number): void {
  stepCount++;
  library?.tick(dtSec);
  gallery?.step(inputX, inputY, dtSec);
  if (import.meta.env.DEV || import.meta.env.MODE === 'perf') stress?.step(dtSec);
  world?.step(dtSec);
  if (import.meta.env.DEV) debugHooks?.onStep();
}

function render(alpha: number): void {
  if (!ctx) return;
  if (import.meta.env.DEV || import.meta.env.MODE === 'perf') stress?.render();
  world?.render(alpha);
  if (import.meta.env.DEV) debugHooks?.onRender();
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') noteFrame(performance.now());
  ctx.canvas.update();
  ctx.canvas.render();
}

async function boot(message: Extract<MainToWorker, { type: 'init' }>): Promise<void> {
  if (booting) return;
  booting = true;
  size = { width: message.width, height: message.height, scale: message.scale };
  try {
    const validated = await loadManifest(message.assetBaseUrl);
    assetState.total = Object.keys(validated.manifest.assets).length;
    post({ type: 'loadProgress', loaded: 0, total: assetState.total });
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      registerSnapshotField('assets', () => ({ ...assetState }));
    }
    const context = await initThorVG(
      message.canvas,
      message.width,
      message.height,
      message.scale,
      message.assetBaseUrl,
      validated.manifest,
    );
    const renderer = context.canvas.renderer;
    if (renderer !== 'gl')
      throw new Error(`ThorVG started with the '${renderer}' renderer instead of 'gl'`);
    ctx = context;
    if (
      size.width !== message.width ||
      size.height !== message.height ||
      size.scale !== message.scale
    )
      applySize();
    assetState.font = HUD_FONT;
    library = await AssetLibrary.load(
      context.TVG,
      message.assetBaseUrl,
      (loaded, total) => {
        assetState.loaded = loaded;
        assetState.total = total;
        post({ type: 'loadProgress', loaded, total });
      },
      validated,
    );
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      if (message.debug?.gallery) {
        gallery = buildGallery(context, library);
        registerSnapshotField('gallery', () => gallery?.snapshot());
        registerSnapshotField('galleryPreview', () => gallery?.previewVisible() ?? false);
        if (import.meta.env.DEV)
          registerDebugHandler('galleryPreview', () => {
            gallery?.togglePreview();
            console.warn(
              `[debug] gallery preview ${gallery?.previewVisible() ? 'shown' : 'hidden'}`,
            );
          });
      }
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
      if (!gallery && message.debug?.stress !== undefined) {
        const { parseStressCount, createStressScene } = await import('./debug/stress');
        const count = parseStressCount(message.debug.stress);
        if (count !== null) {
          const layers = createLayers(context.root);
          stress = createStressScene(library, layers.enemies, count);
          if (import.meta.env.DEV) {
            registerPerfStat('entities', () => stress?.entities ?? 0);
            registerPerfStat('paints created', () => stress?.paintsCreated ?? 0);
            registerPerfStat('step ms', () => stress?.stepMs.toFixed(2) ?? '0');
          }
          if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
            registerSnapshotField('debug', () => stress?.snapshot());
          }
        }
      }
    }
    if (!gallery && !stress) {
      const layers = createLayers(context.root);
      const run = createWorld({
        seed: Date.now() >>> 0,
        characterId: 'warden',
        view: { library, layers, scale: () => size.scale },
      });
      run.input.dx = inputX;
      run.input.dy = inputY;
      world = run;
      if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
        registerSnapshotField('timeS', () => run.time);
        registerSnapshotField('player', () => readPlayerSnapshot(run));
        registerSnapshotField('enemies', () => run.enemies.count);
        registerSnapshotField('enemyPositions', () => readEnemyPositions(run));
      }
    }
    assetState.placeholders = [...library.placeholders];
    assetState.ready = true;
    const gameLoop = createLoop({ step, render });
    loop = gameLoop;
    if (import.meta.env.DEV) {
      debugHooks = installWorkerDebugTools({
        TVG: context.TVG,
        root: context.root,
        loop: gameLoop,
        post,
        describe: describeScene,
      });
    }
    gameLoop.setBackgroundPolicy(policy);
    if (paused) gameLoop.pause();
    gameLoop.setVisibility(hidden);
    gameLoop.start();
    post({ type: 'assetsReady', placeholders: assetState.placeholders });
    post({ type: 'ready', renderer: 'gl' });
  } catch (err) {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }
}

function applySize(): void {
  if (!ctx) return;
  ctx.canvas.resize(size.width, size.height);
  ctx.root.scale(size.scale);
}

/** Answers the test bridge (dev and e2e builds only; every call is behind that guard). */
function answerSnapshot(message: TestSnapshotRequest): void {
  post({
    type: 'testSnapshot',
    requestId: message.requestId,
    snapshot: takeSnapshot({
      renderer: 'gl',
      timeS: stepCount / 60,
      steps: stepCount,
      paused,
      hidden,
      backgroundPolicy: policy,
      perfOverlay: import.meta.env.DEV ? (debugHooks?.perfOverlayVisible() ?? false) : false,
    }),
  });
}

function handle(message: GameMainToWorker): void {
  switch (message.type) {
    case 'init':
      void boot(message);
      break;
    case 'resize':
      size = { width: message.width, height: message.height, scale: message.scale };
      applySize();
      break;
    case 'input':
      inputX = message.dx;
      inputY = message.dy;
      if (world) {
        world.input.dx = message.dx;
        world.input.dy = message.dy;
      }
      break;
    case 'pause':
      paused = true;
      loop?.pause();
      break;
    case 'resume':
      paused = false;
      loop?.resume();
      break;
    case 'visibility':
      hidden = message.hidden;
      loop?.setVisibility(message.hidden);
      if (import.meta.env.DEV) debugHooks?.onVisibility(message.hidden);
      break;
    case 'setBackgroundPolicy':
      policy = message.policy;
      loop?.setBackgroundPolicy(message.policy);
      if (import.meta.env.DEV) console.warn(`[worker] background policy: ${message.policy}`);
      break;
    case 'debug':
      if (import.meta.env.DEV) dispatchDebug(message.command);
      break;
    default:
      assertNever(message);
  }
}

self.addEventListener('message', (event: MessageEvent<MainToWorker>) => {
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    if (event.data.type === 'testSnapshot') {
      answerSnapshot(event.data);
      return;
    }
  }
  // Only the dev and e2e test bridge sends `testSnapshot`, and it was answered above.
  handle(event.data as GameMainToWorker);
});
