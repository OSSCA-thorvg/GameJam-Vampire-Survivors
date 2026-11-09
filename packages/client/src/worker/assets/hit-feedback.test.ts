import { HIT_INVULN_SEC } from '@vs/shared';
import { expect, it } from 'vitest';
import { createHitFeedbackSlot } from './hit-feedback';

const FPS = 150;

it('covers the whole invulnerability window, ending opaque once it runs out (#148)', () => {
  const keys = createHitFeedbackSlot(0, HIT_INVULN_SEC).damage.p.k;
  // The first cycle's transitions (the keys repeat after 600 frames).
  const first = keys.filter((key) => key.t > 0 && key.t < 600);
  const last = first[first.length - 1];
  // The window's last blink returns to full opacity within one step of HIT_INVULN_SEC, not at a fixed 0.5 s.
  expect(last?.s).toEqual([100]);
  expect(last?.t ?? 0).toBeGreaterThan((HIT_INVULN_SEC - 2 / 60) * FPS);
  expect(last?.t ?? 0).toBeLessThanOrEqual((HIT_INVULN_SEC + 1 / 60) * FPS);
  // Dim and opaque alternate through the window: one change per 0.08 s blink phase, give or take one.
  expect(first.length).toBeGreaterThanOrEqual(Math.floor(HIT_INVULN_SEC / 0.08));
});
