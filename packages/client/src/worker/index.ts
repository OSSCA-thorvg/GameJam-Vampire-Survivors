// Game worker entry (ADR 0004): owns the simulation and all ThorVG rendering on the transferred OffscreenCanvas.
// It talks to the main thread only through the messages in ../protocol/worker-messages.ts.
import type { Shape } from '@thorvg/webcanvas';
import { assertNever } from '../protocol/assert-never';
import type {
  Axis,
  BackgroundPolicy,
  GameMainToWorker,
  MainToWorker,
  TestSnapshotRequest,
  WorkerToMain,
} from '../protocol/worker-messages';
import { VIEW_HEIGHT, VIEW_WIDTH } from './constants';
import { installWorkerDebugTools, dispatchDebug, type WorkerDebugHooks } from './debug';
import { createLoop, type Loop } from './loop';
import { initThorVG, type ThorVGContext } from './render/thorvg';
import { noteFrame, registerSnapshotField, takeSnapshot } from './test-bridge';

declare const self: DedicatedWorkerGlobalScope;

/** Test scene (until #3/#7): rotation speed of the square and movement speed of the dot. */
const SPIN_DEG_PER_SEC = 90;
const DOT_UNITS_PER_SEC = 200;
const DOT_RADIUS = 12;

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

/** Simulation steps since boot, for the test bridge's `steps` and `timeS`. */
let stepCount = 0;

// Test-scene state, advanced only by `step`.
let simTime = 0;
let angle = 0;
let dotX = VIEW_WIDTH / 2;
let dotY = VIEW_HEIGHT / 2 + 200;
let square: Shape | null = null;
let dot: Shape | null = null;

const describeScene = (): string =>
  `simTime ${simTime.toFixed(2)} s, angle ${angle.toFixed(1)} deg, dot (${dotX.toFixed(0)}, ${dotY.toFixed(0)})`;

function step(dtSec: number): void {
  stepCount++;
  simTime += dtSec;
  angle = (angle + SPIN_DEG_PER_SEC * dtSec) % 360;
  if (inputX !== 0 || inputY !== 0) {
    const norm = inputX !== 0 && inputY !== 0 ? Math.SQRT1_2 : 1;
    dotX = Math.min(
      VIEW_WIDTH - DOT_RADIUS,
      Math.max(DOT_RADIUS, dotX + inputX * norm * DOT_UNITS_PER_SEC * dtSec),
    );
    dotY = Math.min(
      VIEW_HEIGHT - DOT_RADIUS,
      Math.max(DOT_RADIUS, dotY + inputY * norm * DOT_UNITS_PER_SEC * dtSec),
    );
  }
  if (import.meta.env.DEV) debugHooks?.onStep();
}

function render(): void {
  if (!ctx || !square || !dot) return;
  square.rotate(angle);
  dot.translate(dotX, dotY);
  if (import.meta.env.DEV) debugHooks?.onRender();
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') noteFrame(performance.now());
  ctx.canvas.update();
  ctx.canvas.render();
}

/** Creates the test scene's Paints once (ADR 0003): a backdrop for the logical view, a rotating square and a dot. */
function buildTestScene({ TVG, root }: ThorVGContext): void {
  const backdrop = new TVG.Shape();
  backdrop.appendRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(24, 28, 40, 255);
  root.add(backdrop);

  square = new TVG.Shape();
  square.appendRect(-90, -90, 180, 180, { rx: 28, ry: 28 }).fill(232, 72, 85, 255);
  square.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
  root.add(square);

  dot = new TVG.Shape();
  dot.appendCircle(0, 0, DOT_RADIUS).fill(120, 220, 255, 255);
  dot.translate(dotX, dotY);
  root.add(dot);
}

async function boot(message: Extract<MainToWorker, { type: 'init' }>): Promise<void> {
  if (booting) return;
  booting = true;
  size = { width: message.width, height: message.height, scale: message.scale };
  try {
    const context = await initThorVG(
      message.canvas,
      message.width,
      message.height,
      message.scale,
      message.assetBaseUrl,
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
    buildTestScene(context);
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
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      // Removed with the test scene by #7.
      registerSnapshotField('testScene', () => ({ angleDeg: angle, dotX, dotY }));
    }
    gameLoop.setBackgroundPolicy(policy);
    if (paused) gameLoop.pause();
    gameLoop.setVisibility(hidden);
    gameLoop.start();
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
