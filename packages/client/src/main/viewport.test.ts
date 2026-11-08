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
});
