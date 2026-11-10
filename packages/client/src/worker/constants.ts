/** Fixed logical view (ADR 0004): the game always shows this area, scaled to fit and letterboxed. */
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/**
 * #150, ADR 0024: on touch devices a versus match shows the opponent's view as a top-right inset over the own view, at
 * this fraction of its size, `PIP_MARGIN` logical units from the right edge and `PIP_TOP` from the top: its 2-unit
 * backdrop starts at 62, 12 units below the lowest top-right HUD element (the kill count, which ends at 50;
 * `render/hud.ts` `HUD_TOP_RIGHT_BOTTOM`), so the inset never covers the XP bar, "Lv n", the skull or the kills. Shared by `main/viewport.ts` (the DOM pane rects) and `worker/render/panes.ts` (the drawing).
 */
export const PIP_SCALE = 0.32;
export const PIP_MARGIN = 16;
export const PIP_TOP = 64;
/** The inset's logical rect in the full view. */
export const PIP_RECT = {
  x: VIEW_WIDTH - PIP_MARGIN - VIEW_WIDTH * PIP_SCALE,
  y: PIP_TOP,
  width: VIEW_WIDTH * PIP_SCALE,
  height: VIEW_HEIGHT * PIP_SCALE,
} as const;

/** Fixed simulation step: 60 Hz (ADR 0004). */
export const STEP_MS = 1000 / 60;
/** At most this many steps per visible frame; the remainder is dropped. */
export const MAX_STEPS = 5;
/** Step cap per tick of the hidden-tab `setTimeout` loop, so throttled timers (about 1 Hz) still catch up. */
export const MAX_STEPS_HIDDEN = 120;
/** Interval of the hidden-tab `setTimeout` loop. */
export const HIDDEN_TICK_MS = 50;
