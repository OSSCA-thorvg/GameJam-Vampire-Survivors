// Main-thread entry (ADR 0004): checks browser support, transfers the canvas to the game worker, forwards input,
// resize and visibility, and starts the screens (`app.ts`, #9) once the worker is ready. It owns the DOM; after `transferControlToOffscreen()` it never touches the canvas again.
import './style.css';
import type { GameWorkerToMain, MainToWorker, WorkerToMain } from '../protocol/worker-messages';
import { assertNever } from '../protocol/assert-never';
import { createApp, type App } from './app';
import { installDebugTools, recordStats, registerDebugKey } from './debug';
import { createInput } from './input';
import { checkSupport } from './support';
import { loadAssetUrls, type AssetUrl } from './ui/asset-url';
import { installTestBridge, registerMainSnapshotField, type MainTestBridge } from './test-bridge';
import { computeViewport, type Viewport } from './viewport';

/** Resize events are debounced by this long before the worker is told. */
const RESIZE_DEBOUNCE_MS = 100;

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

  const canvas = document.createElement('canvas');
  let viewport = computeViewport(innerWidth, innerHeight, devicePixelRatio);
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  applyCssSize(canvas, viewport);
  const loading = document.createElement('p');
  loading.id = 'loading';
  loading.textContent = 'Loading 0/0';
  appRoot().replaceChildren(canvas, loading);

  const worker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' });
  const post = (message: MainToWorker, transfer: Transferable[] = []): void => {
    worker.postMessage(message, transfer);
  };

  const assetBaseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
  /** Icons for the DOM screens (#11), resolved through the same manifest as the worker; `null` until it loads. */
  let iconUrl: AssetUrl = () => null;
  void loadAssetUrls(assetBaseUrl).then((resolve) => {
    iconUrl = resolve;
  });

  /** The screens (#9), started on the title once the worker is ready; none in the `?gallery` and `?stress` scenes. */
  let app: App | null = null;
  /** Set inside the dev/e2e/perf guard below, so production bundles do not name the debug scenes. */
  let debugScene = false;
  const startApp = (): void => {
    if (app || debugScene) return;
    const screens = document.createElement('div');
    screens.id = 'screens';
    appRoot().append(screens);
    const started = createApp(screens, post, undefined, (id) => iconUrl(id));
    app = started;
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')
      registerMainSnapshotField('state', () => started.state.name);
  };

  let testBridge: MainTestBridge | null = null;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') testBridge = installTestBridge(post);

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      if (event.data.type === 'testSnapshot') {
        testBridge?.onSnapshot(event.data);
        return;
      }
    }
    // Only dev and e2e workers send test bridge replies, and they were handled above.
    const message = event.data as GameWorkerToMain;
    switch (message.type) {
      case 'ready':
        if (import.meta.env.DEV) console.warn('[vs] worker ready, renderer:', message.renderer);
        if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') testBridge?.onReady();
        startApp();
        break;
      case 'loadProgress':
        loading.textContent = `Loading ${String(message.loaded)}/${String(message.total)}`;
        break;
      case 'assetsReady':
        loading.remove();
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
        app?.dispatch({ type: 'gameOver', stats: message.stats });
        break;
      case 'levelUp':
        app?.dispatch({ type: 'levelUp', level: message.level, options: message.options });
        break;
      case 'chestOpened':
        app?.dispatch({ type: 'chestOpened', rewards: message.rewards });
        break;
      default:
        assertNever(message);
    }
  });
  worker.addEventListener('error', (event) => {
    console.error('[vs] game worker error:', event.message);
    showMessage('The game could not start.', [event.message || 'The game worker failed to load.']);
  });

  let debug: { gallery: boolean; stress: string } | undefined;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e' || import.meta.env.MODE === 'perf') {
    const query = new URLSearchParams(location.search);
    debug = {
      gallery: (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && query.has('gallery'),
      stress:
        import.meta.env.DEV || import.meta.env.MODE === 'perf' ? (query.get('stress') ?? '') : '',
    };
    debugScene = debug.gallery || debug.stress !== '';
  }
  const offscreen = canvas.transferControlToOffscreen();
  post(
    {
      type: 'init',
      canvas: offscreen,
      width: viewport.width,
      height: viewport.height,
      scale: viewport.scale,
      assetBaseUrl,
      ...(debug ? { debug } : {}),
    },
    [offscreen],
  );

  createInput(document, window, (dx, dy) => {
    post({ type: 'input', dx, dy });
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      viewport = computeViewport(innerWidth, innerHeight, devicePixelRatio);
      applyCssSize(canvas, viewport);
      post({
        type: 'resize',
        width: viewport.width,
        height: viewport.height,
        scale: viewport.scale,
      });
    }, RESIZE_DEBOUNCE_MS);
  });

  document.addEventListener('visibilitychange', () => {
    post({ type: 'visibility', hidden: document.hidden });
  });
  if (document.hidden) post({ type: 'visibility', hidden: true });

  if (import.meta.env.DEV) {
    if (debug?.gallery) registerDebugKey('KeyV', { kind: 'galleryPreview' });
    registerDebugKey('KeyG', { kind: 'grantWeapon' });
    registerDebugKey('KeyL', { kind: 'levelUp' });
    registerDebugKey('KeyP', { kind: 'grantPassive' });
    registerDebugKey('KeyK', { kind: 'spawnPickup' });
    registerDebugKey('KeyE', { kind: 'forceEvolution' });
    registerDebugKey('KeyB', { kind: 'spawnBoss' });
    installDebugTools(worker);
  }
}

void boot();
