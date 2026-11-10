import type { MainToWorker } from '../protocol/worker-messages';
import type { PaneMode, ViewFit, Viewport } from './viewport';

/** Size changes within the same layout reach the worker this long after the last resize event (trailing debounce). */
export const RESIZE_DEBOUNCE_MS = 100;

export interface ResizerOptions {
  /** `computeViewport` for the current window, `panes`, pane mode and fit. */
  measure: (panes: 1 | 2, mode: PaneMode, fit: ViewFit) => Viewport;
  /**
   * #150, ADR 0024: the current pane mode, `'pip'` on touch devices; read on every measure. Defaults to `'split'`.
   * After it changes, call `onModeChange()`.
   */
  mode?: () => PaneMode;
  /**
   * #171, ADR 0025: the current fit, `'cover'` on touch devices; read on every measure. Defaults to `'contain'`. It
   * changes with the input mode, so `onModeChange()` covers it.
   */
  fit?: () => ViewFit;
  /** Sizes the canvas element and writes the pane rects; cheap, called on every committed relayout. */
  apply: (viewport: Viewport) => void;
  post: (message: Extract<MainToWorker, { type: 'resize' }>) => void;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface Resizer {
  /** A window `resize` event. */
  onResize(): void;
  /** The app's switch between one view and the versus split: relayouts at once. */
  setPanes(panes: 1 | 2): void;
  /**
   * #150, #171: the pane mode or the fit may have changed (the input mode switched); relayouts at once when the
   * layout or the fit changes.
   */
  onModeChange(): void;
  readonly viewport: Viewport;
  readonly panes: 1 | 2;
}

/**
 * The canvas resize policy (#115, ADR 0018). A resize that crosses the layout (`columns` ↔ `rows`) or a pane-count
 * change relayouts at once, so the split switches within a frame; size changes within one layout keep the trailing
 * `RESIZE_DEBOUNCE_MS` debounce, so dragging a window resizes ThorVG's canvas (a buffer reallocation) once, not per
 * event, exactly as before #115 in single player. A relayout that changes nothing the worker uses posts nothing.
 * #150: a change of the pane mode (`split` ↔ `pip`) during a split counts as a layout change. #171: so does a change
 * of the fit (`contain` ↔ `cover`), in single player too, and the posted `resize` carries the `visible` rect.
 */
export function createResizer(opts: ResizerOptions): Resizer {
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    opts.clearTimer ??
    ((id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    });
  const modeOf = opts.mode ?? ((): PaneMode => 'split');
  const fitOf = opts.fit ?? ((): ViewFit => 'contain');
  const measure = (p: 1 | 2): Viewport => opts.measure(p, modeOf(), fitOf());
  /** Whether going from `a` to `b` is more than a size change: it is committed at once, never debounced. */
  const relayouts = (a: Viewport, b: Viewport): boolean => a.layout !== b.layout || a.fit !== b.fit;
  let panes: 1 | 2 = 1;
  let viewport = measure(panes);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const commit = (next: Viewport): void => {
    const prev = viewport;
    viewport = next;
    opts.apply(next);
    if (
      next.width === prev.width &&
      next.height === prev.height &&
      next.scale === prev.scale &&
      next.layout === prev.layout &&
      next.visible.x === prev.visible.x &&
      next.visible.y === prev.visible.y &&
      next.visible.width === prev.visible.width &&
      next.visible.height === prev.visible.height
    )
      return;
    opts.post({
      type: 'resize',
      width: next.width,
      height: next.height,
      scale: next.scale,
      layout: next.layout,
      visible: { ...next.visible },
    });
  };

  return {
    get viewport() {
      return viewport;
    },
    get panes() {
      return panes;
    },
    onResize() {
      const next = measure(panes);
      cancel();
      if (relayouts(viewport, next)) {
        commit(next);
        return;
      }
      timer = setTimer(() => {
        timer = null;
        commit(measure(panes));
      }, RESIZE_DEBOUNCE_MS);
    },
    onModeChange() {
      const next = measure(panes);
      // The same layout and fit as before: nothing to relayout, and a pending size debounce stays.
      if (!relayouts(viewport, next)) return;
      cancel();
      commit(next);
    },
    setPanes(next) {
      if (next === panes) return;
      panes = next;
      cancel();
      commit(measure(panes));
    },
  };
}
