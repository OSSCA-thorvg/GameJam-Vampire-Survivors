import { expect, it } from 'vitest';
import { MIN_VISIBLE_WIDTH, VIEW_WIDTH } from '../constants';
import {
  deriveMinVisibleWidth,
  hudClearances,
  hudFits,
  HUD_PAIR_GAP,
  HUD_WIDTH_STEP,
  INVENTORY_RIGHT,
  LONGEST_PASSIVE_ROW,
  LONGEST_TOAST,
  LONGEST_WEAPON_ROW,
  TIMER_HALF_WIDTH,
  TOAST_HALF_WIDTH,
} from './hud-extents';

// #171, ADR 0025: the cover fit's floor comes from the HUD, not from a guess.
it('keeps every top-row pair at least 8 units apart at MIN_VISIBLE_WIDTH', () => {
  const gaps = hudClearances(MIN_VISIBLE_WIDTH);
  expect(gaps.inventoryToTimer).toBeGreaterThanOrEqual(HUD_PAIR_GAP);
  expect(gaps.inventoryToToast).toBeGreaterThanOrEqual(HUD_PAIR_GAP);
  expect(gaps.timerToInset).toBeGreaterThanOrEqual(HUD_PAIR_GAP);
  expect(gaps.toastToInset).toBeGreaterThanOrEqual(HUD_PAIR_GAP);
  expect(HUD_PAIR_GAP).toBe(8);
});

it('uses the smallest multiple of 20 that fits, so the constant follows the HUD', () => {
  expect(MIN_VISIBLE_WIDTH).toBe(deriveMinVisibleWidth());
  expect(MIN_VISIBLE_WIDTH % HUD_WIDTH_STEP).toBe(0);
  expect(hudFits(MIN_VISIBLE_WIDTH - HUD_WIDTH_STEP)).toBe(false);
  expect(MIN_VISIBLE_WIDTH).toBeLessThanOrEqual(VIEW_WIDTH);
  // The full view, which the HUD was laid out for, fits.
  expect(hudFits(VIEW_WIDTH)).toBe(true);
});

it('measures the inputs from the content data', () => {
  // "Unholy Vespers Lv 8", "Candelabrador Lv 8", "Sent Elite Call": a longer name widens the floor through the test above.
  expect([LONGEST_WEAPON_ROW, LONGEST_PASSIVE_ROW, LONGEST_TOAST]).toEqual([19, 18, 15]);
  // The backing (466) reaches further than the longest row (244 + 18 × 14 × 0.8 = 445.6).
  expect(INVENTORY_RIGHT).toBe(466);
  expect(TIMER_HALF_WIDTH).toBe(58);
  expect(TOAST_HALF_WIDTH).toBe(134);
  // A 4:3 tablet's uncapped cover (960 units) is what the floor exists for: three of the four pairs collide there.
  const tablet = hudClearances(960);
  expect(tablet.inventoryToTimer).toBeLessThan(HUD_PAIR_GAP);
  expect(tablet.inventoryToToast).toBeLessThan(HUD_PAIR_GAP);
  expect(tablet.toastToInset).toBeLessThan(HUD_PAIR_GAP);
});
