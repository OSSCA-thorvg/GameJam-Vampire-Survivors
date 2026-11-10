import type { VisibleRect } from '../protocol/worker-messages';

export type { VisibleRect };

/**
 * Fixed logical view (ADR 0004): the simulation always uses this area. It is scaled to fit and letterboxed, except in
 * touch mode, where the canvas covers the window and shows its centred part (ADR 0025, `VisibleRect`).
 */
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/**
 * #150, ADR 0024: the lowest edge of the top-right HUD (the kill count, outline included) in view units. The kills
 * text is top-aligned at 16 (`MARGIN + 2` in `render/hud.ts`) with `KILLS_SIZE` 24; measured at 1280×720 its glyphs and 2-unit outline
 * end at 50. The skull (16×16 × 1.5, centred at y 29) ends at 41 and "Lv n" at 17. The versus inset keeps
 * at least 8 units below this, and so does the touch pause button over a covered view (#171, `main/viewport.ts`
 * `hudClearCss`). Measured from the visible area's top (ADR 0025).
 */
export const HUD_TOP_RIGHT_BOTTOM = 50;
/** The gap kept under `HUD_TOP_RIGHT_BOTTOM` by what sits below the top-right HUD. */
export const HUD_CLEARANCE = 8;

/**
 * #150, ADR 0024: on touch devices a versus match shows the opponent's view as a top-right inset over the own view, at
 * this fraction of its size, `PIP_MARGIN` logical units from the right edge and `PIP_TOP` from the top: its 2-unit
 * backdrop starts at 62, 12 units below the lowest top-right HUD element (the kill count, which ends at 50;
 * `render/hud.ts` `HUD_TOP_RIGHT_BOTTOM`), so the inset never covers the XP bar, "Lv n", the skull or the kills. Shared by `main/viewport.ts` (the DOM pane rects) and `worker/render/panes.ts` (the drawing).
 */
export const PIP_SCALE = 0.32;
export const PIP_MARGIN = 16;
export const PIP_TOP = 64;
/**
 * #171, ADR 0025: the cover fit never crops the visible width below this many logical units; a narrower touch window
 * (a 4:3 tablet) is scaled to show exactly this width and letterboxed above and below. It is the smallest multiple of
 * 20 at which the HUD's top row still fits: derived, and checked, in `render/hud-extents.ts` and its test.
 */
export const MIN_VISIBLE_WIDTH = 1220;

/** #171, ADR 0025: the visible area when the whole view is shown (`contain`). */
export const FULL_VIEW: Readonly<VisibleRect> = {
  x: 0,
  y: 0,
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
};

/**
 * The inset's logical rect for a `visible` area: `PIP_MARGIN` from its right edge and `PIP_TOP` from its top
 * (ADR 0025), so it moves with the HUD. Returns a new object; call it on a layout change only, never per frame.
 */
export function pipRect(visible: Readonly<VisibleRect>): VisibleRect {
  return {
    x: visible.x + visible.width - PIP_MARGIN - VIEW_WIDTH * PIP_SCALE,
    y: visible.y + PIP_TOP,
    width: VIEW_WIDTH * PIP_SCALE,
    height: VIEW_HEIGHT * PIP_SCALE,
  };
}
/** The inset's logical rect in the full view. */
export const PIP_RECT: Readonly<VisibleRect> = pipRect(FULL_VIEW);

/**
 * #171: the box of the boot splash's drawn content (the "Powered by ThorVG" logo and wordmark, `render/splash.ts`) in
 * the 1280×720 view, with a margin; measured on its last frames at 1280×720 (content 449..833 × 150..561). The cover
 * fit crops only the empty area around it on phones and 4:3 tablets (`viewport.test.ts`).
 */
export const SPLASH_CONTENT_BOUNDS: Readonly<VisibleRect> = {
  x: 440,
  y: 140,
  width: 400,
  height: 430,
};

/** Fixed simulation step: 60 Hz (ADR 0004). */
export const STEP_MS = 1000 / 60;
/** At most this many steps per visible frame; the remainder is dropped. */
export const MAX_STEPS = 5;
/** Step cap per tick of the hidden-tab `setTimeout` loop, so throttled timers (about 1 Hz) still catch up. */
export const MAX_STEPS_HIDDEN = 120;
/** Interval of the hidden-tab `setTimeout` loop. */
export const HIDDEN_TICK_MS = 50;
