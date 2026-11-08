/** Fixed logical view (ADR 0004): the game always shows this area, scaled to fit and letterboxed. */
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/** Fixed simulation step: 60 Hz (ADR 0004). */
export const STEP_MS = 1000 / 60;
/** At most this many steps per visible frame; the remainder is dropped. */
export const MAX_STEPS = 5;
/** Step cap per tick of the hidden-tab `setTimeout` loop, so throttled timers (about 1 Hz) still catch up. */
export const MAX_STEPS_HIDDEN = 120;
/** Interval of the hidden-tab `setTimeout` loop. */
export const HIDDEN_TICK_MS = 50;
