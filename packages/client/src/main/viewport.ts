import { VIEW_HEIGHT, VIEW_WIDTH } from '../worker/constants';

/** Highest device pixel ratio the backing store uses; higher ratios cost fill rate for no visible gain. */
const MAX_DPR = 2;

export interface Viewport {
  /** CSS size of the canvas element: the 1280×720 logical view scaled to fit the window. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  /** Device pixels per logical unit, applied by the worker as the root scene's scale. */
  scale: number;
}

/** Fits the fixed logical view (ADR 0004) into the window, letterboxed, at up to 2× device pixels. */
export function computeViewport(
  innerWidth: number,
  innerHeight: number,
  devicePixelRatio: number,
): Viewport {
  const fit = Math.min(innerWidth / VIEW_WIDTH, innerHeight / VIEW_HEIGHT);
  const cssWidth = VIEW_WIDTH * fit;
  const cssHeight = VIEW_HEIGHT * fit;
  const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  return { cssWidth, cssHeight, width, height, scale: width / VIEW_WIDTH };
}
