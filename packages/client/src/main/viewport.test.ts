import { describe, expect, it } from 'vitest';
import { computeViewport } from './viewport';

describe('computeViewport', () => {
  it('fits 1920×1080 at DPR 2', () => {
    expect(computeViewport(1920, 1080, 2)).toEqual({
      cssWidth: 1920,
      cssHeight: 1080,
      width: 3840,
      height: 2160,
      scale: 3,
    });
  });

  it('letterboxes 800×600 at DPR 1', () => {
    expect(computeViewport(800, 600, 1)).toEqual({
      cssWidth: 800,
      cssHeight: 450,
      width: 800,
      height: 450,
      scale: 0.625,
    });
  });

  it('pillarboxes a wide window and caps the DPR at 2', () => {
    const v = computeViewport(3000, 720, 3);
    expect(v.cssWidth).toBe(1280);
    expect(v.cssHeight).toBe(720);
    expect(v.width).toBe(2560);
    expect(v.scale).toBe(2);
  });

  // #103: at these windows the fitted canvas was 1004.44 and 1365.33 CSS pixels wide, centred at a sub-pixel offset,
  // and the compositor showed the page background as a dark one-pixel column at the left edge.
  it.each([
    [1005, 565, 1],
    [1366, 768, 1],
    [1280, 720, 1],
    [1005, 565, 2],
    [1366, 768, 1.5],
    [1440, 900, 2],
    [1003.5, 564.25, 1.25],
  ])(
    'covers whole device pixels and leaves no sub-pixel letterbox at %d × %d, DPR %d',
    (w, h, dpr) => {
      const v = computeViewport(w, h, dpr);
      for (const [px, css, win] of [
        [v.width, v.cssWidth, w],
        [v.height, v.cssHeight, h],
      ] as const) {
        expect(Number.isInteger(px)).toBe(true);
        expect(css * dpr).toBeCloseTo(px, 9); // CSS size maps 1:1 to the backing store, no resampling
        const slack = Math.floor(win * dpr + 1e-6) - px; // device pixels of letterbox along the axis
        expect(slack).toBeGreaterThanOrEqual(0);
        expect(slack === 0 || slack >= 2).toBe(true);
      }
      // The whole logical view fits, and the scale is the largest that does on at least one axis.
      expect(1280 * v.scale).toBeLessThanOrEqual(v.width + 1e-9);
      expect(720 * v.scale).toBeLessThanOrEqual(v.height + 1e-9);
      expect(Math.max(1280 * v.scale - v.width, 720 * v.scale - v.height)).toBeCloseTo(0, 9);
      // What lies beyond the view (right and bottom) is under 2 device pixels per axis, or a real letterbox bar.
      expect(v.width - 1280 * v.scale < 2 || v.height - 720 * v.scale < 1e-9).toBe(true);
    },
  );

  it('fills 1005 × 565 at DPR 1 edge to edge', () => {
    const v = computeViewport(1005, 565, 1);
    expect(v).toMatchObject({ cssWidth: 1005, cssHeight: 565, width: 1005, height: 565 });
    expect(v.scale).toBeCloseTo(565 / 720, 12);
  });

  it('keeps a real letterbox of 2 or more device pixels', () => {
    const v = computeViewport(1010, 565, 1);
    expect(v.width).toBe(1004);
    expect(v.cssWidth).toBe(1004);
  });
});
