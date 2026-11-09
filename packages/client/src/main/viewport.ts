import { VIEW_HEIGHT, VIEW_WIDTH } from '../worker/constants';

/** Highest device pixel ratio the backing store uses; higher ratios cost fill rate for no visible gain. */
const MAX_DPR = 2;
/**
 * A letterbox narrower than this many device pixels in total is filled by the canvas instead: two bars under one
 * device pixel each cannot be drawn as bars, and the compositor showed the page background as one dark column at
 * the canvas edge (#103, 1005 × 565 and 1366 × 768 CSS pixels at DPR 1).
 */
const FILL_SLACK = 2;

export interface Viewport {
  /** CSS size of the canvas element: exactly the backing store divided by the DPR, so it maps 1:1 to device pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  /**
   * Device pixels per logical unit, applied by the worker as the root scene's scale: the largest uniform scale at
   * which the whole 1280×720 view fits the backing store. Any slack (under `FILL_SLACK` device pixels) lies right
   * of and below the view, where the ground still extends (`render/ground.ts`).
   */
  scale: number;
  /** #115, ADR 0018: one view, or two equal panes side by side (`columns`) or stacked (`rows`). */
  layout: PaneLayout;
  /**
   * The panes in CSS pixels relative to the canvas, self first then opponent; one entry for `single`. Each is exactly
   * the 1280×720 logical view at `scale`.
   */
  panes: PaneRect[];
}

/** #115: the canvas shows one view, or two panes left/right or top/bottom (ADR 0018). */
export type PaneLayout = 'single' | 'columns' | 'rows';

/** Logical units between the two panes (ADR 0018). */
export const PANE_GAP = 16;

export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Device pixels along one axis: the fitted size, or the whole window when the letterbox would be under a pixel. */
function axis(view: number, fit: number, windowCss: number, dpr: number): number {
  const max = Math.max(1, Math.floor(windowCss * dpr + 1e-6));
  const fitted = Math.min(max, Math.max(1, Math.round(view * fit * dpr)));
  return max - fitted < FILL_SLACK ? max : fitted;
}

/**
 * The layout of `panes` views in a `w`×`h` window (ADR 0018): `columns` when its pane scale `min(w / 2576, h / 720)`
 * is at least the `rows` scale `min(w / 1280, h / 1456)`, else `rows`; one pane is `single`.
 */
export function paneLayout(w: number, h: number, panes: 1 | 2): PaneLayout {
  if (panes === 1) return 'single';
  const columns = Math.min(w / (2 * VIEW_WIDTH + PANE_GAP), h / VIEW_HEIGHT);
  const rows = Math.min(w / VIEW_WIDTH, h / (2 * VIEW_HEIGHT + PANE_GAP));
  return columns >= rows ? 'columns' : 'rows';
}

/**
 * Fits the fixed logical view (ADR 0004) into the window, letterboxed, at up to 2× device pixels. The canvas covers
 * whole device pixels only, and fills an axis whose letterbox would be thinner than `FILL_SLACK` device pixels. With
 * `panes` 2 (#115, a versus match) the fitted area holds two such views and a `PANE_GAP` between them.
 */
export function computeViewport(
  innerWidth: number,
  innerHeight: number,
  devicePixelRatio: number,
  panes: 1 | 2 = 1,
): Viewport {
  const layout = paneLayout(innerWidth, innerHeight, panes);
  const areaW = layout === 'columns' ? 2 * VIEW_WIDTH + PANE_GAP : VIEW_WIDTH;
  const areaH = layout === 'rows' ? 2 * VIEW_HEIGHT + PANE_GAP : VIEW_HEIGHT;
  const fit = Math.min(innerWidth / areaW, innerHeight / areaH);
  const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
  const width = axis(areaW, fit, innerWidth, dpr);
  const height = axis(areaH, fit, innerHeight, dpr);
  const scale = Math.min(width / areaW, height / areaH);
  const paneW = (VIEW_WIDTH * scale) / dpr;
  const paneH = (VIEW_HEIGHT * scale) / dpr;
  const panesOut: PaneRect[] = [];
  for (let i = 0; i < (layout === 'single' ? 1 : 2); i++) {
    const offset = (i * (VIEW_WIDTH + PANE_GAP) * scale) / dpr;
    const offsetY = (i * (VIEW_HEIGHT + PANE_GAP) * scale) / dpr;
    panesOut.push({
      x: layout === 'columns' ? offset : 0,
      y: layout === 'rows' ? offsetY : 0,
      width: paneW,
      height: paneH,
    });
  }
  return {
    cssWidth: width / dpr,
    cssHeight: height / dpr,
    width,
    height,
    scale,
    layout,
    panes: panesOut,
  };
}
