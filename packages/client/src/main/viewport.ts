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
}

/** Device pixels along one axis: the fitted size, or the whole window when the letterbox would be under a pixel. */
function axis(view: number, fit: number, windowCss: number, dpr: number): number {
  const max = Math.max(1, Math.floor(windowCss * dpr + 1e-6));
  const fitted = Math.min(max, Math.max(1, Math.round(view * fit * dpr)));
  return max - fitted < FILL_SLACK ? max : fitted;
}

/**
 * Fits the fixed logical view (ADR 0004) into the window, letterboxed, at up to 2× device pixels. The canvas covers
 * whole device pixels only, and fills an axis whose letterbox would be thinner than `FILL_SLACK` device pixels.
 */
export function computeViewport(
  innerWidth: number,
  innerHeight: number,
  devicePixelRatio: number,
): Viewport {
  const fit = Math.min(innerWidth / VIEW_WIDTH, innerHeight / VIEW_HEIGHT);
  const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
  const width = axis(VIEW_WIDTH, fit, innerWidth, dpr);
  const height = axis(VIEW_HEIGHT, fit, innerHeight, dpr);
  return {
    cssWidth: width / dpr,
    cssHeight: height / dpr,
    width,
    height,
    scale: Math.min(width / VIEW_WIDTH, height / VIEW_HEIGHT),
  };
}
