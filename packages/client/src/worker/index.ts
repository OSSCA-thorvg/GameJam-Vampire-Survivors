// Game worker entry (ADR 0004): owns the simulation and all ThorVG rendering on the transferred OffscreenCanvas.
// It talks to the main thread only through the messages in ../protocol/worker-messages.ts.
import { assertNever } from '../protocol/assert-never';
import type {
  Axis,
  BackgroundPolicy,
  Finale,
  GameMainToWorker,
  PaneLayout,
  RunMode,
  VisibleRect,
  MainToWorker,
  TestSnapshotRequest,
  WorkerToMain,
} from '../protocol/worker-messages';
import {
  installWorkerDebugTools,
  dispatchDebug,
  registerDebugHandler,
  type WorkerDebugHooks,
} from './debug';
import {
  installPerfOverlay,
  layoutPerfOverlay,
  perfOverlayVisible,
  registerPerfStat,
  type PerfMeter,
} from './perf/overlay';
import { createLoop, type Loop } from './loop';
import { HUD_FONT, initThorVG, placeRoot, type ThorVGContext } from './render/thorvg';
import { loadManifest } from './assets/manifest';
import { AssetLibrary } from './assets/library';
import { createBootGate } from './boot-gate';
import { createSplash, SPLASH_ID, type Splash } from './render/splash';
import { createLayers } from './render/layers';
import { createDefeatOverlay, type DefeatOverlay } from './render/defeat';
import { createPanes, type Panes } from './render/panes';
import {
  createOpponentHud,
  createPaneLabel,
  YOU_LABEL,
  type OpponentHud,
  type PaneLabel,
} from './render/pane-hud';
import { createOpponentView, type OpponentView } from './game/opponent-view';
import { createStatusEmitter } from './game/status';
import { createViewEmitter, summarizeView } from './game/view-stream';
import { createOpponentFeed, readOpponentFeed } from './game/opponent-feed';
import { createSpawnLog } from './game/spawn-log';
import { createGameView, type GameView } from './game/view';
import { createSession, type Session } from './game/session';
import { createLevelUpFlow, xpForNextLevel } from './game/level';
import { createChestFlow } from './game/systems/chest-open';
import { spawnBoss } from './game/systems/bosses';
import { forceEvolution, nextEvolution } from './game/debug-evolution';
import {
  countElites,
  readBosses,
  readChestPositions,
  readEnemyPositions,
  readGemPositions,
  readPassives,
  readPlayerSnapshot,
  readWeapons,
} from './game/snapshot';
import { grantNextPassive } from './game/passives';
import { readLights } from './game/light-sources';
import { readPickups, spawnDebugPickup } from './game/pickups';
import { isFrozen } from './game/systems/freeze';
import {
  drainCollected,
  interferenceOnGround,
  queueInterference,
  spawnDebugInterference,
} from './game/systems/interference';
import { recomputeStats } from './game/stats';
import { grantNextWeapon } from './game/weapons/owned';
import { buildGallery, type Gallery } from './debug/gallery';
import { noteFrame, registerSnapshotField, takeSnapshot } from './test-bridge';
import type { StressScene, StressScenario } from './debug/stress';
import type * as StressScenarios from './debug/stress-scenarios';
import type {
  ScenarioRecorder,
  SharedLottieScene,
  WorldScenarioRun,
} from './debug/stress-scenarios';
import { INTERFERENCE } from '@vs/shared';
import { clearSfx, drainSfx } from './game/sfx';
import { FULL_VIEW } from './constants';
import { createResizeFrame } from './resize-frame';

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
let size: {
  width: number;
  height: number;
  scale: number;
  layout: PaneLayout;
  /** #171, ADR 0025: the part of the view the canvas shows; presentation only, the simulation never reads it. */
  visible: VisibleRect;
} = {
  width: 0,
  height: 0,
  scale: 1,
  layout: 'single',
  visible: { ...FULL_VIEW },
};
/** The run's view, for `applyPanes` to anchor its HUD to the visible area (#171). */
let hudView: Pick<GameView, 'layout'> | null = null;

/** Simulation steps since boot, for the test bridge's `steps` (and `timeS` when no run exists). */
let stepCount = 0;

/**
 * The runs on the game view, whose paints are created once at boot (#9); `null` in `?gallery` and `?stress`.
 * `session.world` is the current run, `null` on the title screen.
 */
let session: Session | null = null;
/** The level-up choice (#11): pauses the loop after a step that levelled up and posts one `levelUp` at a time. */
const levelUps = createLevelUpFlow({
  post,
  pause: () => {
    paused = true;
    loop?.pause();
  },
  resume: () => {
    paused = false;
    loop?.resume();
  },
});
/** The chest overlay (#15): pauses the loop after a step that opened a chest, resumes on `chestClosed`. */
const chests = createChestFlow({
  post,
  pause: () => {
    paused = true;
    loop?.pause();
  },
  resume: () => {
    paused = false;
    loop?.resume();
  },
});
/** A versus run's `status` messages (#20); single-player runs post none. */
const statuses = createStatusEmitter(post);
/** A versus run's world views (#114, ADR 0018); none in single player or while the tab is hidden. */
const views = createViewEmitter(post);
/** The opponent's latest relayed views (#114); drawn by the split panes (#115). */
const opponentFeed = createOpponentFeed();
/**
 * #115, ADR 0018: the two clipped panes under `root`, the opponent pane's world and HUD, and the own pane's "YOU"
 * label; all `null` in `?gallery` and `?stress`, which keep drawing on `root`.
 */
let panes: Panes | null = null;
let opponentView: OpponentView | null = null;
let opponentHud: OpponentHud | null = null;
let matchEnded = false;
let youLabel: PaneLabel | null = null;
/** The dimmed world and its line after a versus death (#20); `null` in `?gallery` and `?stress`. */
let defeat: DefeatOverlay | null = null;
/** The `E` debug key's next pair in `EVOLUTIONS`, kept across runs (dev builds only). */
let evolutionIndex = 0;
let library: AssetLibrary | null = null;
/** #126: the boot splash; `null` when skipped, and after boot it stays `done` and hidden. */
let splash: Splash | null = null;
let gallery: Gallery | null = null;
let stress: StressScene | null = null;
/** #22: the perf overlay's frame meter; `null` unless the overlay is installed (dev builds, `?perf`, a scenario). */
let meter: PerfMeter | null = null;
/** #22's named `?stress` scenarios (dev and `perf` builds only). */
let sharedLottie: SharedLottieScene | null = null;
let worldScenario: WorldScenarioRun | null = null;
let recorder: ScenarioRecorder | null = null;
const assetState = {
  ready: false,
  loaded: 0,
  total: 0,
  placeholders: [] as string[],
  font: 'default',
};

/** #21: an interference pickup was collected; the main thread sends it to the server. */
const postCollected = (index: number): void => {
  const def = INTERFERENCE[index];
  if (def) post({ type: 'interferenceCollected', kind: def.kind });
};

const describeScene = (): string => {
  const world = session?.world;
  return world
    ? `run ${world.time.toFixed(2)} s, player (${world.player.x.toFixed(0)}, ${world.player.y.toFixed(0)})`
    : `steps ${String(stepCount)}`;
};

function step(dtSec: number): void {
  // #22: timed only while the overlay shows or a scenario records.
  const started = meter?.enabled ? performance.now() : -1;
  stepCount++;
  library?.tick(dtSec);
  splash?.step(dtSec);
  gallery?.step(inputX, inputY, dtSec);
  if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
    stress?.step(dtSec);
    sharedLottie?.step(dtSec);
  }
  const world = session?.world;
  if (world) {
    world.step(dtSec);
    drainCollected(world, postCollected);
    statuses.afterStep(world, dtSec);
    views.afterStep(world, dtSec, hidden);
    if ((import.meta.env.DEV || import.meta.env.MODE === 'perf') && worldScenario)
      worldScenario.afterStep(world);
    else {
      levelUps.afterStep(world);
      chests.afterStep(world);
    }
  }
  if (import.meta.env.DEV) debugHooks?.onStep();
  if (started >= 0) meter?.stepDone(performance.now() - started);
}

function render(): void {
  if (!ctx) return;
  const timed = meter?.enabled === true;
  const started = timed ? performance.now() : 0;
  if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
    stress?.render();
    sharedLottie?.render();
  }
  session?.render(performance.now());
  if (opponentView && panes?.opponentVisible) {
    opponentView.render(
      opponentFeed,
      performance.now(),
      !hidden && !matchEnded && opponentHud?.state === 'live',
    );
    opponentHud?.sync(opponentFeed.latest()?.view.t ?? null);
  }
  if (import.meta.env.DEV) debugHooks?.onRender();
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') noteFrame(performance.now());
  const transformed = timed ? performance.now() : 0;
  ctx.canvas.update();
  const updated = timed ? performance.now() : 0;
  ctx.canvas.render();
  // #129: this frame's sound cues, posted once after it is drawn.
  drainSfx(session?.world, post);
  if (timed) meter?.frameDone(started, transformed, updated, performance.now());
  if (import.meta.env.DEV || import.meta.env.MODE === 'perf')
    recorder?.afterFrame(performance.now());
}

async function boot(message: Extract<MainToWorker, { type: 'init' }>): Promise<void> {
  if (booting) return;
  booting = true;
  size = {
    width: message.width,
    height: message.height,
    scale: message.scale,
    layout: message.layout,
    visible: message.visible,
  };
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
      message.visible,
    );
    const renderer = context.canvas.renderer;
    if (renderer !== 'gl')
      throw new Error(`ThorVG started with the '${renderer}' renderer instead of 'gl'`);
    ctx = context;
    if (
      size.width !== message.width ||
      size.height !== message.height ||
      size.scale !== message.scale ||
      size.visible !== message.visible
    )
      applySize();
    assetState.font = HUD_FONT;
    // #126: the game panes draw under `gameRoot`, the boot splash above them on `splashLayer`.
    const gameRoot = new context.TVG.Scene();
    const splashLayer = new context.TVG.Scene();
    context.root.add(gameRoot).add(splashLayer);
    const gate = createBootGate(() => {
      splash?.finish();
      post({ type: 'ready', renderer: 'gl' });
    });
    // Production always plays it: `debug` exists only in dev, e2e and perf builds, so the guards drop these names.
    let playSplash = true;
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      if (message.debug?.gallery || message.debug?.skipSplash === true) playSplash = false;
    }
    // Dev, e2e and perf builds send `stress: ''` without `?stress`; any value, even an unsupported one, skips it.
    if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
      if (message.debug?.stress) playSplash = false;
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      registerSnapshotField(
        'splash',
        () => splash?.snapshot() ?? { state: 'skipped', frame: 0, elapsedS: 0, durationS: 0 },
      );
    }
    const skipSplash = (): void => {
      post({ type: 'splashEnded', played: false });
      gate.splashEnded();
    };
    const onProgress = (loaded: number, total: number): void => {
      assetState.loaded = loaded;
      assetState.total = total;
      post({ type: 'loadProgress', loaded, total });
    };
    if (!playSplash) {
      skipSplash();
      library = await AssetLibrary.load(context.TVG, message.assetBaseUrl, onProgress, validated);
    } else {
      const phased = AssetLibrary.begin(context.TVG, message.assetBaseUrl, validated, onProgress);
      library = phased;
      await phased.loadFirst(SPLASH_ID);
      splash = createSplash({
        TVG: context.TVG,
        library: phased,
        layer: splashLayer,
        onEnded: () => {
          post({ type: 'splashEnded', played: true });
          gate.splashEnded();
        },
      });
      if (!splash) skipSplash();
      startLoop();
      await phased.loadRest();
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      registerSnapshotField('motion', () => library?.motionSnapshot());
      if (message.debug?.gallery) {
        gallery = buildGallery(context, library);
        registerSnapshotField('gallery', () => gallery?.snapshot());
        registerSnapshotField('galleryPreview', () => gallery?.previewVisible() ?? false);
        registerSnapshotField('galleryMotion', () => gallery?.motionState() ?? 'idle');
        if (import.meta.env.DEV)
          registerDebugHandler('galleryMotion', () => {
            gallery?.toggleMotion();
          });
        if (import.meta.env.DEV)
          registerDebugHandler('galleryPreview', () => {
            gallery?.togglePreview();
            console.warn(
              `[debug] gallery preview ${gallery?.previewVisible() ? 'shown' : 'hidden'}`,
            );
          });
      }
    }
    /** #22: the named scenario, its definition and the module that runs it. */
    let scenario: {
      name: string;
      def: StressScenario;
      run: typeof StressScenarios;
    } | null = null;
    /** What the scenario's result reports as `maxCounts`. */
    let recorderCounts: Record<string, () => number> = {};
    if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
      if (!gallery && message.debug?.stress !== undefined) {
        const { parseStress, createStressScene, STRESS_SCENARIOS } = await import('./debug/stress');
        const parsed = parseStress(message.debug.stress);
        if (parsed && 'scenario' in parsed) {
          const def: StressScenario = STRESS_SCENARIOS[parsed.scenario];
          scenario = { name: parsed.scenario, def, run: await import('./debug/stress-scenarios') };
          if (def.kind === 'lottie') {
            const layers = createLayers(context.root);
            if (def.mode === 'perEnemy')
              stress = createStressScene(library, layers.enemies, def.count, undefined, {
                assetId: 'enemy.lottieTest',
                churn: false,
              });
            else
              sharedLottie = scenario.run.createSharedLottieScene(
                library,
                layers.enemies,
                def.count,
              );
          }
        }
        const count = parsed && 'count' in parsed ? parsed.count : null;
        if (count !== null)
          stress = createStressScene(library, createLayers(context.root).enemies, count);
        if (stress) {
          registerPerfStat('entities', () => stress?.entities ?? 0);
          registerPerfStat('paints created', () => stress?.paintsCreated ?? 0);
          registerPerfStat('step ms', () => stress?.stepMs.toFixed(2) ?? '0');
          if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
            registerSnapshotField('debug', () => stress?.snapshot());
          }
        }
      }
    }
    if (!gallery && !stress && !sharedLottie) {
      const split = createPanes(context.TVG, gameRoot);
      panes = split;
      const layers = createLayers(split.self);
      const gameView = createGameView({
        TVG: context.TVG,
        library,
        layers,
        scale: () => size.scale,
      });
      hudView = gameView;
      const overlay = createDefeatOverlay(context.TVG, split.self, [layers.world, layers.hud]);
      defeat = overlay;
      youLabel = createPaneLabel(context.TVG, layers.hud, YOU_LABEL);
      const opponentLayers = createLayers(split.opponent);
      const otherView = createOpponentView({
        TVG: context.TVG,
        library,
        layers: opponentLayers,
        // #150: the `pip` inset draws the opponent scaled down, so its camera snaps at the inset's device scale.
        scale: () => size.scale * split.opponentScale,
      });
      opponentView = otherView;
      opponentHud = createOpponentHud(context.TVG, opponentLayers.hud, split.opponent, [
        opponentLayers.world,
        opponentLayers.hud,
      ]);
      applyPanes();
      const spawnLog =
        import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? createSpawnLog() : undefined;
      const runs = createSession(
        gameView,
        (stats) => {
          paused = true;
          loop?.pause();
          const world = session?.world;
          // A versus death (#20): one last status, then the frozen world dims under the defeat line.
          if (world) {
            statuses.final(world);
            if (world.mode === 'versus' && world.state === 'dead') overlay.setVisible(true);
          }
          post({ type: 'gameOver', stats });
        },
        spawnLog,
      );
      session = runs;
      // #22: the overlay's live counts (read only while it refreshes its text, at most 4 times a second).
      registerPerfStat('enemies', () => runs.world?.enemies.count ?? 0);
      registerPerfStat('projectiles', () => runs.world?.projectiles.count ?? 0);
      registerPerfStat('gems', () => runs.world?.gems.count ?? 0);
      registerPerfStat('pickups', () => runs.world?.pickups.count ?? 0);
      registerPerfStat('paints', () => gameView.countPaints());
      registerPerfStat('opponent paints', () => otherView.countPaints());
      if (
        (import.meta.env.DEV || import.meta.env.MODE === 'perf') &&
        scenario?.def.kind === 'world'
      ) {
        const { run } = scenario;
        worldScenario = run.startWorldScenario(runs, scenario.def);
        recorderCounts = {
          enemies: () => runs.world?.enemies.count ?? 0,
          projectiles: () => runs.world?.projectiles.count ?? 0,
          gems: () => runs.world?.gems.count ?? 0,
          pickups: () => runs.world?.pickups.count ?? 0,
          paints: () => gameView.countPaints(),
        };
      }
      if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
        if (spawnLog) registerSnapshotField('spawnLog', () => spawnLog.read());
        registerSnapshotField('mode', () => runs.world?.mode ?? null);
        registerSnapshotField('defeated', () => overlay.visible);
        registerSnapshotField('matchClock', () => gameView.matchClockText());
        registerSnapshotField('timeS', () => runs.world?.time ?? 0);
        registerSnapshotField('player', () => (runs.world ? readPlayerSnapshot(runs.world) : null));
        registerSnapshotField('enemies', () => runs.world?.enemies.count ?? 0);
        registerSnapshotField('enemyPositions', () =>
          runs.world ? readEnemyPositions(runs.world) : [],
        );
        registerSnapshotField('kills', () => runs.world?.stats.kills ?? 0);
        registerSnapshotField('projectiles', () => runs.world?.projectiles.count ?? 0);
        registerSnapshotField('weapons', () => (runs.world ? readWeapons(runs.world) : []));
        registerSnapshotField('characterId', () => runs.world?.characterId ?? null);
        registerSnapshotField('passives', () => (runs.world ? readPassives(runs.world) : []));
        registerSnapshotField('stats', () => (runs.world ? { ...runs.world.player.stats } : null));
        registerSnapshotField('damageDealt', () =>
          runs.world ? { ...runs.world.damageDealt } : { hits: 0, total: 0 },
        );
        registerSnapshotField('gems', () => runs.world?.gems.count ?? 0);
        registerSnapshotField('chests', () => runs.world?.chests.count ?? 0);
        registerSnapshotField('chestPositions', () =>
          runs.world ? readChestPositions(runs.world) : [],
        );
        registerSnapshotField('bosses', () => (runs.world ? readBosses(runs.world) : []));
        registerSnapshotField('gemPositions', () =>
          runs.world ? readGemPositions(runs.world) : [],
        );
        registerSnapshotField('lights', () => (runs.world ? readLights(runs.world) : []));
        registerSnapshotField('pickups', () => (runs.world ? readPickups(runs.world) : []));
        registerSnapshotField('frozen', () => (runs.world ? isFrozen(runs.world) : false));
        registerSnapshotField('cleared', () => runs.world?.cleared ?? false);
        registerSnapshotField('eventsFired', () => runs.world?.nextEventIndex ?? 0);
        registerSnapshotField('debugInvulnerable', () => runs.world?.debugInvulnerable ?? false);
        registerSnapshotField('interferenceOnGround', () =>
          runs.world ? interferenceOnGround(runs.world) : 0,
        );
        registerSnapshotField('elites', () => (runs.world ? countElites(runs.world) : 0));
        registerSnapshotField('viewOut', () =>
          views.last ? { ...summarizeView(views.last), sent: views.sent } : null,
        );
        registerSnapshotField('opponentFeed', () => readOpponentFeed(opponentFeed));
        registerSnapshotField('panes', () => ({
          layout: split.layout,
          opponentVisible: split.opponentVisible,
          youLabel: youLabel?.visible ?? false,
          visible: { ...size.visible },
        }));
        registerSnapshotField('opponentPane', () => ({
          cameraX: otherView.cameraX,
          cameraY: otherView.cameraY,
          enemiesShown: otherView.enemiesShown,
          gemsShown: otherView.gemsShown,
          pickupsShown: otherView.pickupsShown,
          state: opponentHud?.state ?? 'live',
          paintsCreated: otherView.countPaints(),
        }));
        // An unsupported `?stress` value falls back to this view, but it is still a stress boot: no `debug` field (#92).
        if (!message.debug?.stress)
          registerSnapshotField('debug', () => ({ paintsCreated: gameView.countPaints() }));
      }
      if (import.meta.env.DEV)
        registerDebugHandler('grantWeapon', () => {
          const granted = runs.world ? grantNextWeapon(runs.world) : null;
          console.warn(`[debug] grantWeapon: ${granted ?? 'nothing to grant'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('grantPassive', () => {
          const world = runs.world;
          const granted = world ? grantNextPassive(world) : null;
          if (world && granted) recomputeStats(world);
          console.warn(`[debug] grantPassive: ${granted ?? 'nothing to grant'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('spawnPickup', () => {
          const id = runs.world ? spawnDebugPickup(runs.world) : null;
          console.warn(`[debug] spawnPickup: ${id ?? 'nothing spawned'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('spawnInterference', () => {
          const kind = runs.world ? spawnDebugInterference(runs.world) : null;
          console.warn(`[debug] spawnInterference: ${kind ?? 'nothing spawned'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('forceEvolution', () => {
          const world = runs.world;
          if (!world || levelUps.open || chests.open) return;
          const { done, log } = forceEvolution(world, nextEvolution(evolutionIndex));
          if (done) evolutionIndex++;
          console.warn(`[debug] forceEvolution: ${log}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('spawnBoss', () => {
          const world = runs.world;
          const slot = world ? spawnBoss(world, 'reaper5') : -1;
          console.warn(`[debug] spawnBoss: ${slot < 0 ? 'not spawned' : 'reaper5'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('toggleInvulnerable', () => {
          const world = runs.world;
          if (world) world.debugInvulnerable = !world.debugInvulnerable;
          console.warn(`[debug] invulnerable: ${world?.debugInvulnerable ? 'on' : 'off'}`);
        });
      if (import.meta.env.DEV)
        registerDebugHandler('levelUp', () => {
          const world = runs.world;
          if (!world || levelUps.open) return;
          const xp = xpForNextLevel(world);
          world.player.xp += xp;
          console.warn(`[debug] levelUp: +${String(xp)} XP`);
        });
    }
    assetState.placeholders = [...library.placeholders];
    assetState.ready = true;
    // #22: on `root` after every layer, so it draws on top. Dev builds always install it (hidden until `` ` ``).
    if (import.meta.env.DEV || message.perf || scenario) {
      const perfOverlay = installPerfOverlay({
        TVG: context.TVG,
        root: context.root,
        visible: message.perf,
      });
      perfOverlay.layout(size.visible);
      meter = perfOverlay.meter;
    }
    if ((import.meta.env.DEV || import.meta.env.MODE === 'perf') && scenario && meter) {
      if (scenario.def.kind === 'lottie')
        recorderCounts = {
          enemies: () => stress?.entities ?? sharedLottie?.entities ?? 0,
          paints: () => stress?.paintsCreated ?? sharedLottie?.entities ?? 0,
        };
      recorder = scenario.run.createScenarioRecorder({
        scenario: scenario.name,
        meter,
        post,
        counts: recorderCounts,
        start: performance.now(),
        simTime: () => session?.world?.time ?? stepCount / 60,
        steps: () => stepCount,
      });
    }
    startLoop();
    post({ type: 'assetsReady', placeholders: assetState.placeholders });
    gate.assetsReady();
  } catch (err) {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }
}

/** Starts the frame loop once (the splash starts it before the rest of the assets load, #126). */
function startLoop(): void {
  if (loop) return;
  const gameLoop = createLoop({ step, render });
  loop = gameLoop;
  if (import.meta.env.DEV) {
    debugHooks = installWorkerDebugTools({
      loop: gameLoop,
      post,
      describe: describeScene,
    });
  }
  gameLoop.setBackgroundPolicy(policy);
  if (paused) gameLoop.pause();
  gameLoop.setVisibility(hidden);
  gameLoop.start();
}

/**
 * #165: the resize and its frame in one task (`resize-frame.ts`), so the cleared buffer is never presented; before the
 * loop exists (boot) only the size is applied. Also after `forceEnd`, which stops the loop, the result keeps a drawn frame.
 */
const resizeFrame = createResizeFrame({
  apply: () => {
    if (!ctx) return;
    ctx.canvas.resize(size.width, size.height);
    placeRoot(ctx.root, size.scale, size.visible);
    layoutPerfOverlay(size.visible);
    applyPanes();
  },
  render,
  ready: () => ctx !== null && loop !== null,
  hidden: () => hidden,
});

function applySize(): void {
  resizeFrame.resize();
}

/**
 * Places and clips the panes for the current size and layout; the "YOU" label shows only with two equal panes (#115),
 * never over the full view of `pip` (#150). #171: the own pane's clip, the inset and the HUD follow the visible area.
 */
function applyPanes(): void {
  if (!panes || size.scale <= 0) return;
  panes.apply(size.layout, size.width / size.scale, size.height / size.scale, size.visible);
  hudView?.layout(size.visible);
  youLabel?.setVisible(size.layout === 'columns' || size.layout === 'rows');
  if (size.layout === 'single') opponentView?.suspendPlayback();
}

/**
 * Replaces the current run with a fresh world (#9). The view's pools are released and reused, so no Paint is created
 * or disposed; the world's typed-array stores are new. Unpauses the loop.
 */
function startRun(seed: number, characterId: string, finale: Finale, mode: RunMode): void {
  if (!session || !loop) {
    console.warn('[worker] startRun before the game view is ready; ignored');
    return;
  }
  levelUps.reset();
  chests.reset();
  statuses.reset();
  views.reset();
  opponentFeed.clear();
  opponentView?.clear();
  opponentHud?.setState('live');
  matchEnded = false;
  defeat?.setVisible(false);
  // #177: a single-player run has no match clock; a versus run gets its own `matchClock` right after `startRun`.
  if (mode !== 'versus') session.matchEndsAt = null;
  const run = session.start(seed, characterId, finale, mode);
  run.input.dx = inputX;
  run.input.dy = inputY;
  paused = false;
  loop.resume();
  // After a `forceEnd` (#20) the loop was stopped.
  loop.start();
  if (import.meta.env.DEV) console.warn(`[worker] run started, seed ${String(seed)}`);
}

/** Clears the run and draws one empty frame (#9); the loop keeps running under the screens. */
function endRun(): void {
  levelUps.reset();
  chests.reset();
  views.reset();
  opponentFeed.clear();
  opponentView?.clear();
  opponentHud?.setState('live');
  matchEnded = false;
  session?.end();
  defeat?.setVisible(false);
  paused = false;
  loop?.resume();
  loop?.start();
  render();
}

/** The versus match is decided (#20): stop stepping and rendering, so the last frame stays on the canvas. */
function forceEnd(): void {
  matchEnded = true;
  if (session) session.matchEndsAt = null;
  opponentView?.suspendPlayback();
  paused = true;
  loop?.pause();
  loop?.stop();
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
      perfOverlay: perfOverlayVisible(),
    }),
  });
}

function handle(message: GameMainToWorker): void {
  switch (message.type) {
    case 'init':
      void boot(message);
      break;
    case 'resize':
      size = {
        width: message.width,
        height: message.height,
        scale: message.scale,
        layout: message.layout,
        visible: message.visible,
      };
      applySize();
      break;
    case 'input':
      inputX = message.dx;
      inputY = message.dy;
      if (session?.world) {
        session.world.input.dx = message.dx;
        session.world.input.dy = message.dy;
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
      if (hidden) opponentView?.suspendPlayback();
      loop?.setVisibility(message.hidden);
      // #129: a return from a hidden tab plays no backlog of cues.
      if (!message.hidden) clearSfx(session?.world);
      if (import.meta.env.DEV) debugHooks?.onVisibility(message.hidden);
      break;
    case 'setBackgroundPolicy':
      policy = message.policy;
      loop?.setBackgroundPolicy(message.policy);
      if (import.meta.env.DEV) console.warn(`[worker] background policy: ${message.policy}`);
      break;
    case 'startRun':
      startRun(
        message.seed,
        message.characterId,
        message.finale ?? 'death',
        message.mode ?? 'single',
      );
      break;
    case 'forceEnd':
      forceEnd();
      break;
    case 'endRun':
      endRun();
      break;
    case 'levelUpChoice':
      if (session?.world) levelUps.choose(session.world, message.index);
      break;
    case 'chestClosed':
      if (session?.world) chests.close(session.world);
      break;
    case 'applyInterference':
      if (session?.world) queueInterference(session.world, message.kind);
      break;
    case 'opponentView':
      if (session?.world?.mode === 'versus') opponentFeed.push(message.view, performance.now());
      break;
    case 'matchClock':
      // #177, ADR 0026: anchored on this worker's clock; the HUD counts down to it while the versus run lasts.
      if (session?.world?.mode === 'versus')
        session.matchEndsAt = performance.now() + Math.max(0, message.remainingMs);
      break;
    case 'opponentState':
      opponentHud?.setState(message.state);
      if (message.state !== 'live') opponentView?.suspendPlayback();
      break;
    case 'debug':
      if (import.meta.env.DEV) {
        dispatchDebug(message.command);
        // #129: 60 s of steps in one go would otherwise post one burst of every cue.
        if (message.command.kind === 'fastForward') clearSfx(session?.world);
      }
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
