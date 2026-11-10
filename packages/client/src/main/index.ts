// Main-thread entry (ADR 0004): checks browser support, transfers the canvas to the game worker, forwards input,
// resize and visibility, and starts the screens (`app.ts`, #9) once the worker is ready. It owns the DOM; after `transferControlToOffscreen()` it never touches the canvas again.
import './style.css';
import type { GameWorkerToMain, MainToWorker, WorkerToMain } from '../protocol/worker-messages';
import { assertNever } from '../protocol/assert-never';
import { createApp, type App, type AppState } from './app';
import { createRecordsStore } from './records/store';
import { installDebugTools, recordStats, registerDebugKey } from './debug';
import { createInput } from './input';
import { createInputMode } from './input-mode';
import { checkSupport } from './support';
import { loadAssetUrls, type AssetUrl } from './ui/asset-url';
import { logStressProgress, showStressResult } from './stress-results';
import { installTestBridge, registerMainSnapshotField, type MainTestBridge } from './test-bridge';
import { createResizer } from './resize';
import {
  createRuntimeErrorReporter,
  routeWorkerError,
  type WorkerErrorLike,
} from './runtime-error';
import { computeViewport, type Viewport } from './viewport';
import { createBootLoading } from './boot-loading';
import { createAudioDirector } from './audio/director';
import { createAudioEngine } from './audio/engine';
import { loadAudioEntries } from './audio/entries';
import { loadAudioSettings } from './audio/settings';
import { mountSoundToggle, type SoundToggle } from './ui/sound-toggle';
import { mountPauseButton, type PauseButton } from './ui/pause-button';
import { mountRotateHint } from './ui/rotate-hint';
import { mountTouchStick, type TouchStick } from './ui/touch-stick';

function appRoot(): HTMLElement {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app is missing from index.html');
  return app;
}

/** Replaces the page with a text message; every string goes through `textContent` (ADR 0011). */
function showMessage(title: string, items: readonly string[] = []): void {
  const box = document.createElement('div');
  box.className = 'message';
  const heading = document.createElement('p');
  heading.textContent = title;
  box.append(heading);
  if (items.length > 0) {
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
    box.append(list);
  }
  appRoot().replaceChildren(box);
}

function applyCssSize(canvas: HTMLCanvasElement, v: Viewport): void {
  canvas.style.width = `${String(v.cssWidth)}px`;
  canvas.style.height = `${String(v.cssHeight)}px`;
}

async function boot(): Promise<void> {
  const support = await checkSupport();
  if (!support.ok) {
    showMessage('This game needs a recent Chrome, Edge, Firefox or Safari 17+', support.missing);
    return;
  }

  /** #149: touch or keyboard controls; `body[data-input]` shows the touch controls only in touch mode. */
  const inputMode = createInputMode(document, window);

  const canvas = document.createElement('canvas');
  const loading = document.createElement('p');
  loading.id = 'loading';
  const bootLoading = createBootLoading(loading);
  appRoot().replaceChildren(canvas, loading);
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
    registerMainSnapshotField('loading', () => ({
      visible: bootLoading.visible,
      held: bootLoading.held,
      text: bootLoading.text,
    }));

  const worker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' });
  const post = (message: MainToWorker, transfer: Transferable[] = []): void => {
    worker.postMessage(message, transfer);
  };

  /**
   * The canvas size and pane layout (#115): one view, or two panes during a versus match (ADR 0018). A layout change
   * relayouts at once; size changes within a layout are debounced (`main/resize.ts`).
   */
  const resizer = createResizer({
    measure: (panes) => computeViewport(innerWidth, innerHeight, devicePixelRatio, panes),
    apply: (v) => {
      applyCssSize(canvas, v);
      bootLoading.place(v.cssHeight);
      markPanes();
    },
    post,
  });
  const setPanes = (panes: 1 | 2): void => {
    resizer.setPanes(panes);
  };
  canvas.width = resizer.viewport.width;
  canvas.height = resizer.viewport.height;
  applyCssSize(canvas, resizer.viewport);
  bootLoading.place(resizer.viewport.cssHeight);

  const assetBaseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
  /** Icons for the DOM screens (#11), resolved through the same manifest as the worker; `null` until it loads. */
  let iconUrl: AssetUrl = () => null;
  void loadAssetUrls(assetBaseUrl).then((resolve) => {
    iconUrl = resolve;
  });

  /**
   * #129: sound. The director listens for the first trusted gesture from now on, so a key pressed during the splash
   * already unlocks the context; the splash itself stays silent (no music before the title). The files are fetched
   * after `assetsReady`, so they never compete with the boot assets.
   */
  const audio = createAudioEngine({
    entries: loadAudioEntries(assetBaseUrl),
    baseUrl: assetBaseUrl,
  });
  const director = createAudioDirector({
    engine: audio,
    doc: document,
    root: document.body,
    initial: loadAudioSettings(),
  });
  director.screen({ name: 'booting' });
  let soundToggle: SoundToggle | null = null;
  director.onSettings((s) => {
    soundToggle?.update(s.muted);
  });
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
    registerMainSnapshotField('audio', () => audio.snapshot());

  /** The screens (#9), started on the title once the worker is ready; none in the `?gallery` and `?stress` scenes. */
  let app: App | null = null;
  /** #149: the touch controls, created with the screens. */
  let stick: TouchStick | null = null;
  let pauseButton: PauseButton | null = null;
  /** A single-player run being played: the only state the pause button and the portrait pause act on. */
  const playingSingle = (s: AppState): boolean => s.name === 'playing' && !s.paused;
  /**
   * #149: portrait is not played (ADR 0004's landscape view). Its appearance pauses a single-player run through the
   * hidden-tab pause; versus ignores `hidden` and keeps running (ADR 0005). Dispatched after the current transition.
   */
  const pauseIfPortrait = (): void => {
    queueMicrotask(() => {
      if (app && rotateHint.shown && playingSingle(app.state)) app.dispatch({ type: 'hidden' });
    });
  };
  const rotateHint = mountRotateHint(
    document.body,
    window.matchMedia('(orientation: portrait)'),
    () => inputMode.mode === 'touch',
    pauseIfPortrait,
  );
  /** The joystick steers only while a run is played without a dialog; the pause button only in single player. */
  const followState = (s: AppState): void => {
    stick?.setActive(playingSingle(s) || (s.name === 'versusPlaying' && s.overlay === null));
    pauseButton?.setVisible(playingSingle(s));
    if (rotateHint.shown) pauseIfPortrait();
  };
  inputMode.on(() => {
    rotateHint.refresh();
  });
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
    registerMainSnapshotField('touch', () => ({
      mode: inputMode.mode,
      stickActive: (stick?.active ?? false) && inputMode.mode === 'touch',
      axis: [...(stick?.axis ?? [0, 0])],
      pauseButton: (pauseButton?.visible ?? false) && inputMode.mode === 'touch',
      rotateHint: rotateHint.shown,
    }));
  /** The screen root, once the app started; carries the layout and the pane rects for the versus CSS (#115). */
  let screensEl: HTMLElement | null = null;
  /** Writes `data-layout` and the pane rects (window CSS pixels) on `#screens`, read by `versus.css`. */
  const markPanes = (): void => {
    if (!screensEl) return;
    const viewport = resizer.viewport;
    const left = (innerWidth - viewport.cssWidth) / 2;
    const top = (innerHeight - viewport.cssHeight) / 2;
    screensEl.dataset.layout = viewport.layout;
    const [self, opponent] = viewport.panes;
    for (const [prefix, pane] of [
      ['self', self],
      ['opp', opponent ?? self],
    ] as const) {
      if (!pane) continue;
      screensEl.style.setProperty(`--${prefix}-x`, `${String(left + pane.x)}px`);
      screensEl.style.setProperty(`--${prefix}-y`, `${String(top + pane.y)}px`);
      screensEl.style.setProperty(`--${prefix}-w`, `${String(pane.width)}px`);
      screensEl.style.setProperty(`--${prefix}-h`, `${String(pane.height)}px`);
    }
  };
  /** Set inside the dev/e2e/perf guard below, so production bundles do not name the debug scenes. */
  let debugScene = false;
  const startApp = (): void => {
    if (app || debugScene) return;
    // #149: the joystick layer goes before the screens, so it lies above the canvas and under every screen.
    stick = mountTouchStick(appRoot(), (dx, dy) => {
      input.setTouchAxis(dx, dy);
    });
    const screens = document.createElement('div');
    screens.id = 'screens';
    appRoot().append(screens);
    screensEl = screens;
    markPanes();
    const started = createApp(
      screens,
      post,
      undefined,
      (id) => iconUrl(id),
      undefined,
      undefined,
      setPanes,
      director,
      createRecordsStore(),
    );
    soundToggle = mountSoundToggle(document.body, {
      muted: director.settings().muted,
      onToggle: () => {
        const s = director.settings();
        director.setSettings({ ...s, muted: !s.muted });
      },
    });
    pauseButton = mountPauseButton(document.body, () => {
      started.dispatch({ type: 'pauseToggle' });
    });
    started.onStateChange(followState);
    followState(started.state);
    app = started;
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      registerMainSnapshotField('state', () => started.state.name);
      // #143: the personal records, what the last run broke, and whether storage works.
      registerMainSnapshotField('records', () => started.recordsSnapshot());
      // #115: the canvas layout and how many panes it was asked for.
      registerMainSnapshotField('layout', () => ({
        layout: resizer.viewport.layout,
        panes: resizer.panes,
      }));
      // #20: the dialog over a running versus world, and whether its socket was lost.
      // #21: the incoming-interference banners shown now.
      registerMainSnapshotField('banners', () => started.banners());
      registerMainSnapshotField('versus', () => {
        const s = started.state;
        return s.name === 'versusPlaying' || s.name === 'versusResult'
          ? {
              overlay: s.name === 'versusPlaying' ? (s.overlay?.kind ?? null) : null,
              offline: s.offline,
            }
          : null;
      });
    }
  };

  /** #22: `?perf` shows the perf overlay in every build, including production. */
  const perf = new URLSearchParams(location.search).has('perf');
  /** Milliseconds from navigation to `assetsReady` (#22's asset load time), once it arrived. */
  let loadMs: number | null = null;
  /** Set by the worker's `ready` message (#123): `error` events before it are boot failures, later ones runtime errors. */
  let workerReady = false;
  const runtimeErrors = createRuntimeErrorReporter(document.body);
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
    registerMainSnapshotField('runtimeErrors', () => runtimeErrors.count);

  let testBridge: MainTestBridge | null = null;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') testBridge = installTestBridge(post);

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      if (event.data.type === 'testSnapshot') {
        testBridge?.onSnapshot(event.data);
        return;
      }
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'perf') {
      if (event.data.type === 'stressProgress') {
        logStressProgress(event.data);
        return;
      }
    }
    // Only dev and e2e workers send test bridge replies, and only dev and perf workers stress progress; both are
    // handled above.
    const message = event.data as GameWorkerToMain;
    switch (message.type) {
      case 'ready':
        if (import.meta.env.DEV) console.warn('[vs] worker ready, renderer:', message.renderer);
        if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') testBridge?.onReady();
        workerReady = true;
        startApp();
        break;
      case 'loadProgress':
        bootLoading.progress(message.loaded, message.total);
        break;
      case 'splashEnded':
        bootLoading.splashEnded(message.played);
        break;
      case 'assetsReady':
        bootLoading.assetsReady();
        void audio.load();
        loadMs = Math.round(performance.now());
        if (perf) console.warn(`[perf] assets ready ${String(loadMs)} ms after navigation`);
        break;
      case 'fatal':
        console.error('[vs] game worker failed:', message.message);
        worker.terminate();
        showMessage('The game could not start.', [message.message]);
        break;
      case 'stats':
        if (import.meta.env.DEV) recordStats(message);
        break;
      case 'gameOver':
        director.worker(message);
        app?.dispatch({ type: 'gameOver', stats: message.stats });
        break;
      case 'levelUp':
        director.worker(message);
        app?.dispatch({ type: 'levelUp', level: message.level, options: message.options });
        break;
      case 'chestOpened':
        director.worker(message);
        app?.dispatch({ type: 'chestOpened', rewards: message.rewards });
        break;
      case 'status':
        app?.status(message);
        break;
      case 'interferenceCollected':
        director.worker(message);
        app?.interferenceCollected(message.kind);
        break;
      case 'stressResult':
        if (import.meta.env.DEV || import.meta.env.MODE === 'perf')
          showStressResult(appRoot(), message.result, loadMs);
        break;
      case 'view':
        app?.view(message);
        break;
      case 'sfx':
        director.worker(message);
        break;
      default:
        assertNever(message);
    }
  });
  /** Before `ready`: the worker failed to load or evaluate, so the page is replaced by the boot failure. */
  const fatal = (event: WorkerErrorLike): void => {
    console.error(
      `[vs] game worker error: ${event.message} at ${event.filename}:${String(event.lineno)}:${String(event.colno)}`,
    );
    showMessage('The game could not start.', [event.message || 'The game worker failed to load.']);
  };
  // After `ready` the screens stay mounted and a notice offers Reload (#123); this path never terminates the worker.
  worker.addEventListener('error', (event) => {
    routeWorkerError(workerReady, event, fatal, runtimeErrors);
  });

  let debug: { gallery: boolean; stress: string; skipSplash?: boolean } | undefined;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e' || import.meta.env.MODE === 'perf') {
    const query = new URLSearchParams(location.search);
    debug = {
      gallery: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && query.has('gallery'),
      stress:
        import.meta.env.DEV || import.meta.env.MODE === 'perf' ? (query.get('stress') ?? '') : '',
    };
    // #126: e2e builds skip the boot splash unless `?splash=full`; dev builds play it unless `?splash=skip`.
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
      // The e2e server is a dev server too (`DEV` is true there), so the mode decides first.
      debug.skipSplash =
        import.meta.env.MODE === 'e2e'
          ? query.get('splash') !== 'full'
          : query.get('splash') === 'skip';
    debugScene = debug.gallery || debug.stress !== '';
  }
  const offscreen = canvas.transferControlToOffscreen();
  post(
    {
      type: 'init',
      canvas: offscreen,
      width: resizer.viewport.width,
      height: resizer.viewport.height,
      scale: resizer.viewport.scale,
      layout: resizer.viewport.layout,
      assetBaseUrl,
      perf,
      ...(debug ? { debug } : {}),
    },
    [offscreen],
  );

  const input = createInput(document, window, (dx, dy) => {
    post({ type: 'input', dx, dy });
  });

  window.addEventListener('resize', () => {
    resizer.onResize();
  });

  document.addEventListener('visibilitychange', () => {
    post({ type: 'visibility', hidden: document.hidden });
  });
  if (document.hidden) post({ type: 'visibility', hidden: true });

  if (import.meta.env.DEV) {
    if (debug?.gallery) {
      registerDebugKey('KeyV', { kind: 'galleryPreview' });
      registerDebugKey('KeyO', { kind: 'galleryMotion' });
    }
    registerDebugKey('KeyG', { kind: 'grantWeapon' });
    registerDebugKey('KeyL', { kind: 'levelUp' });
    registerDebugKey('KeyP', { kind: 'grantPassive' });
    registerDebugKey('KeyK', { kind: 'spawnPickup' });
    registerDebugKey('KeyE', { kind: 'forceEvolution' });
    registerDebugKey('KeyB', { kind: 'spawnBoss' });
    registerDebugKey('KeyI', { kind: 'toggleInvulnerable' });
    registerDebugKey('KeyJ', { kind: 'spawnInterference' });
    installDebugTools(worker);
  }
}

void boot();
