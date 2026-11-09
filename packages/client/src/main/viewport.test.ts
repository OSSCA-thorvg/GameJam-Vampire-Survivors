import { describe, expect, it } from 'vitest';
import type { PaneLayout as WorkerPaneLayout } from '../protocol/worker-messages';
import { computeViewport, paneLayout, PANE_GAP, type PaneLayout } from './viewport';

describe('computeViewport', () => {
  it('fits 1920×1080 at DPR 2', () => {
    expect(computeViewport(1920, 1080, 2)).toEqual({
      cssWidth: 1920,
      cssHeight: 1080,
      width: 3840,
      height: 2160,
      scale: 3,
      layout: 'single',
      panes: [{ x: 0, y: 0, width: 1920, height: 1080 }],
    });
  });

  it('letterboxes 800×600 at DPR 1', () => {
    expect(computeViewport(800, 600, 1)).toEqual({
      cssWidth: 800,
      cssHeight: 450,
      width: 800,
      height: 450,
      scale: 0.625,
      layout: 'single',
      panes: [{ x: 0, y: 0, width: 800, height: 450 }],
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

// #115, ADR 0018: two panes for a versus match.
describe('computeViewport with two panes', () => {
  it.each([
    [1600, 900, 'columns'],
    // The issue plan listed 1000 × 1000 as columns, but the rule gives rows: min(1000 / 2576, 1000 / 720) = 0.39 <
    // min(1000 / 1280, 1000 / 1456) = 0.69.
    [1000, 1000, 'rows'],
    [1440, 900, 'rows'],
    [900, 1400, 'rows'],
    [1280, 720, 'columns'],
  ] as const)('%d × %d gives %s', (w, h, layout) => {
    expect(paneLayout(w, h, 2)).toBe(layout);
    expect(computeViewport(w, h, 1, 2).layout).toBe(layout);
  });

  it('keeps one pane byte-for-byte the old single result, whatever the panes argument', () => {
    for (const [w, h, dpr] of [
      [1600, 900, 1],
      [1005, 565, 1],
      [900, 1400, 2],
    ] as const)
      expect(computeViewport(w, h, dpr, 1)).toEqual(computeViewport(w, h, dpr));
  });

  it.each([
    [1600, 900, 1],
    [1600, 900, 2],
    [900, 1400, 1],
    [1440, 900, 1.5],
    [1000, 1000, 1],
  ])('gives two equal 16:9 panes with a 16-unit gap at %d × %d, DPR %d', (w, h, dpr) => {
    const v = computeViewport(w, h, dpr, 2);
    expect(v.panes).toHaveLength(2);
    const [a, b] = v.panes;
    if (!a || !b) throw new Error('two panes expected');
    expect(a.width).toBeCloseTo(b.width, 9);
    expect(a.height).toBeCloseTo(b.height, 9);
    expect(a.width / a.height).toBeCloseTo(16 / 9, 9);
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    const gap = (PANE_GAP * v.scale) / Math.min(dpr, 2);
    if (v.layout === 'columns') {
      expect(b.y).toBe(0);
      expect(b.x - a.width).toBeCloseTo(gap, 9);
    } else {
      expect(b.x).toBe(0);
      expect(b.y - a.height).toBeCloseTo(gap, 9);
    }
    // Both panes fit inside the canvas; the far side reaches its edge within the fill slack.
    expect(b.x + b.width).toBeLessThanOrEqual(v.cssWidth + 1e-9);
    expect(b.y + b.height).toBeLessThanOrEqual(v.cssHeight + 1e-9);
    expect(Number.isInteger(v.width) && Number.isInteger(v.height)).toBe(true);
  });

  it('fits 1600 × 900 at DPR 1 as two 795 × 447 panes', () => {
    const v = computeViewport(1600, 900, 1, 2);
    expect(v).toMatchObject({ layout: 'columns', cssWidth: 1600, cssHeight: 447 });
    expect(v.scale).toBeCloseTo(447 / 720, 12);
    expect(v.panes[0]?.width).toBeCloseTo(794.67, 2);
    expect(v.panes[0]?.height).toBe(447);
    expect(v.panes[1]?.x).toBeCloseTo(804.6, 2);
  });
});

// The worker re-declares `PaneLayout` (tsconfig.worker.json does not compile main/): both must stay the same union.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const samePaneLayout: Same<PaneLayout, WorkerPaneLayout> = true;
it('keeps the worker message PaneLayout equal to the viewport one', () => {
  expect(samePaneLayout).toBe(true);
});
