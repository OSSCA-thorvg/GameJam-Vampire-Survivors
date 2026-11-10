// #171, ADR 0025: how wide the visible area must be for the HUD's top row to fit, from the HUD's own metrics. The
// cover fit never crops below `MIN_VISIBLE_WIDTH` (`worker/constants.ts`); `hud-extents.test.ts` fails when that
// constant is not the width derived here, or when any pair below comes closer than `HUD_PAIR_GAP` at it.
import { INTERFERENCE, PASSIVES, WEAPONS } from '@vs/shared';
import { PIP_MARGIN, PIP_SCALE, VIEW_WIDTH } from '../constants';
import { HUD_METRICS } from './hud';
import { PIP_BACKDROP } from './panes';
import { TOAST_SIZE } from './sent-toast';

/**
 * Advance of one glyph of the monospaced HUD font per unit of ThorVG font size (ADR 0013, Noto Sans Mono). Measured in
 * the running game at 1280×720: "Candelabrador Lv 1" (18 glyphs at size 14) is 200 units wide (0.794) and the timer's
 * `00:00` (5 glyphs at size 28, with its outline) 109 units (0.78); 0.8 is the upper bound used here.
 */
export const HUD_GLYPH_ADVANCE = 0.8;
/** Units every pair of neighbouring HUD elements keeps between them. */
export const HUD_PAIR_GAP = 8;
/** `MIN_VISIBLE_WIDTH` is rounded up to a multiple of this. */
export const HUD_WIDTH_STEP = 20;
/** The longest level suffix an inventory row is measured with. */
export const LONGEST_LEVEL_SUFFIX = ' Lv 8';
/** The timer shows `mm:ss`. */
export const TIMER_GLYPHS = 5;

const longest = (names: readonly string[]): number => Math.max(...names.map((n) => n.length));
/** Glyphs of the longest inventory row of each column: the longest display name (evolutions included) and a level. */
export const LONGEST_WEAPON_ROW =
  longest(Object.values(WEAPONS).map((w) => w.name)) + LONGEST_LEVEL_SUFFIX.length;
export const LONGEST_PASSIVE_ROW =
  longest(PASSIVES.map((p) => p.name)) + LONGEST_LEVEL_SUFFIX.length;
/** Glyphs of the widest "Sent <label>" toast. */
export const LONGEST_TOAST = longest(INTERFERENCE.map((def) => `Sent ${def.label}`));

/** Right edge of the inventory (its backing or its longest row, whichever reaches further), from the visible left. */
export const INVENTORY_RIGHT = Math.max(
  HUD_METRICS.backingRight,
  HUD_METRICS.weaponsX + LONGEST_WEAPON_ROW * HUD_METRICS.inventorySize * HUD_GLYPH_ADVANCE,
  HUD_METRICS.passivesX + LONGEST_PASSIVE_ROW * HUD_METRICS.inventorySize * HUD_GLYPH_ADVANCE,
);
/** Half the widths of the two centred texts, outline included. */
export const TIMER_HALF_WIDTH =
  (TIMER_GLYPHS * HUD_METRICS.timerSize * HUD_GLYPH_ADVANCE) / 2 + HUD_METRICS.outline;
export const TOAST_HALF_WIDTH =
  (LONGEST_TOAST * TOAST_SIZE * HUD_GLYPH_ADVANCE) / 2 + HUD_METRICS.outline;
/** Width the picture-in-picture inset takes from the visible right edge, its backdrop included. */
export const INSET_FROM_RIGHT = PIP_MARGIN + VIEW_WIDTH * PIP_SCALE + PIP_BACKDROP;

/** The horizontal gaps between the top-row neighbours for a visible width, in logical units. */
export interface HudClearances {
  /** Single player and versus: the inventory (backing and longest row) to the timer. */
  inventoryToTimer: number;
  /** Versus: the inventory to the widest sent toast (both show only in a match). */
  inventoryToToast: number;
  /** `pip`: the timer to the inset's backdrop. */
  timerToInset: number;
  /** `pip`: the widest sent toast to the inset's backdrop. */
  toastToInset: number;
}

export function hudClearances(visibleWidth: number): HudClearances {
  const centre = visibleWidth / 2;
  const insetLeft = visibleWidth - INSET_FROM_RIGHT;
  return {
    inventoryToTimer: centre - TIMER_HALF_WIDTH - INVENTORY_RIGHT,
    inventoryToToast: centre - TOAST_HALF_WIDTH - INVENTORY_RIGHT,
    timerToInset: insetLeft - (centre + TIMER_HALF_WIDTH),
    toastToInset: insetLeft - (centre + TOAST_HALF_WIDTH),
  };
}

/** Whether every pair keeps `HUD_PAIR_GAP` at `visibleWidth`. */
export function hudFits(visibleWidth: number): boolean {
  return Object.values(hudClearances(visibleWidth)).every((gap) => gap >= HUD_PAIR_GAP);
}

/** The smallest multiple of `HUD_WIDTH_STEP` at which the HUD fits; every gap grows with the width. */
export function deriveMinVisibleWidth(): number {
  let width = HUD_WIDTH_STEP;
  while (!hudFits(width) && width < VIEW_WIDTH) width += HUD_WIDTH_STEP;
  return width;
}
