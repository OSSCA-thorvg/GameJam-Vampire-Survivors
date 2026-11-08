// Main-thread entry (ADR 0004): checks browser support, transfers the canvas to the game worker, and forwards input,
// resize and visibility. It owns the DOM; after `transferControlToOffscreen()` it never touches the canvas again.
import './style.css';
import type { MainToWorker, WorkerToMain } from '../protocol/worker-messages';
import { assertNever } from '../protocol/assert-never';
import { installDebugTools, recordStats } from './debug';
import { createInput } from './input';
import { checkSupport } from './support';
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
  appRoot().replaceChildren(canvas);

  const worker = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' });
  const post = (message: MainToWorker, transfer: Transferable[] = []): void => {
    worker.postMessage(message, transfer);
  };

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    const message = event.data;
    switch (message.type) {
      case 'ready':
        if (import.meta.env.DEV) console.warn('[vs] worker ready, renderer:', message.renderer);
        break;
      case 'fatal':
        console.error('[vs] game worker failed:', message.message);
        worker.terminate();
        showMessage('The game could not start.', [message.message]);
        break;
      case 'stats':
        if (import.meta.env.DEV) recordStats(message);
        break;
      default:
        assertNever(message);
    }
  });
  worker.addEventListener('error', (event) => {
    console.error('[vs] game worker error:', event.message);
    showMessage('The game could not start.', [event.message || 'The game worker failed to load.']);
  });

  const offscreen = canvas.transferControlToOffscreen();
  post(
    {
      type: 'init',
      canvas: offscreen,
      width: viewport.width,
      height: viewport.height,
      scale: viewport.scale,
      assetBaseUrl: new URL(import.meta.env.BASE_URL, location.href).href,
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

  if (import.meta.env.DEV) installDebugTools(worker);
}

void boot();
