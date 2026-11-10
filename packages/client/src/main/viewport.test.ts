import { describe, expect, it } from 'vitest';
import type { PaneLayout as WorkerPaneLayout } from '../protocol/worker-messages';
import {
  computeViewport,
  hudClearCss,
  paneLayout,
  PANE_GAP,
  PIP_MARGIN,
  PIP_RECT,
  PIP_SCALE,
  PIP_TOP,
  type PaneLayout,
} from './viewport';
import { MIN_VISIBLE_WIDTH, SPLASH_CONTENT_BOUNDS } from '../worker/constants';

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
      fit: 'contain',
      visible: { x: 0, y: 0, width: 1280, height: 720 },
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
      fit: 'contain',
      visible: { x: 0, y: 0, width: 1280, height: 720 },
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

// #150, ADR 0024: touch devices show the opponent as a top-right inset over one full view.
describe('computeViewport in pip mode', () => {
  it('keeps the inset constants of ADR 0024', () => {
    expect([PIP_SCALE, PIP_MARGIN, PIP_TOP]).toEqual([0.32, 16, 64]);
    expect(PIP_RECT.x).toBeCloseTo(854.4, 9);
    expect(PIP_RECT.width).toBeCloseTo(409.6, 9);
    expect(PIP_RECT.height).toBeCloseTo(230.4, 9);
  });

  it('fits 1280 × 720 at DPR 1 as the full view with a 409.6 × 230.4 inset at (854.4, 64)', () => {
    const v = computeViewport(1280, 720, 1, 2, 'pip');
    const single = computeViewport(1280, 720, 1);
    expect(v).toMatchObject({
      layout: 'pip',
      cssWidth: single.cssWidth,
      cssHeight: single.cssHeight,
      width: single.width,
      height: single.height,
      scale: single.scale,
    });
    expect(v.panes[0]).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    const inset = v.panes[1];
    expect(inset?.x).toBeCloseTo(854.4, 9);
    expect(inset?.y).toBe(64);
    expect(inset?.width).toBeCloseTo(409.6, 9);
    expect(inset?.height).toBeCloseTo(230.4, 9);
  });

  it('fits a 844 × 390 phone at DPR 3 (capped at 2) like one view, the inset scaled with it', () => {
    const v = computeViewport(844, 390, 3, 2, 'pip');
    const single = computeViewport(844, 390, 3);
    expect(v.width).toBe(single.width);
    expect(v.height).toBe(single.height);
    expect(v.scale).toBe(single.scale);
    expect(v.height).toBe(780);
    const k = v.scale / 2;
    expect(v.panes[0]).toEqual({ x: 0, y: 0, width: 1280 * k, height: 720 * k });
    const inset = v.panes[1];
    if (!inset) throw new Error('inset expected');
    expect(inset.x).toBeCloseTo(462.8, 6);
    expect(inset.y).toBeCloseTo(34.6667, 4);
    expect(inset.width).toBeCloseTo(221.867, 3);
    expect(inset.height).toBeCloseTo(124.8, 6);
    // Top right: 16 units from the view's right edge, inside the canvas.
    expect(inset.x + inset.width + PIP_MARGIN * k).toBeCloseTo(1280 * k, 9);
    expect(inset.width / inset.height).toBeCloseTo(16 / 9, 9);
  });

  it('ignores the mode with one pane and in split', () => {
    expect(computeViewport(844, 390, 3, 1, 'pip')).toEqual(computeViewport(844, 390, 3));
    expect(computeViewport(1600, 900, 1, 2, 'split')).toEqual(computeViewport(1600, 900, 1, 2));
    expect(paneLayout(844, 390, 1, 'pip')).toBe('single');
    expect(paneLayout(844, 390, 2, 'pip')).toBe('pip');
  });
});

// #171, ADR 0025: touch devices fill the window and crop the overflowing axis evenly.
describe('computeViewport with cover fit', () => {
  it('fills a 844 × 390 phone at DPR 3 (capped at 2): full width, 591.5 of 720 units high', () => {
    const v = computeViewport(844, 390, 3, 1, 'split', 'cover');
    expect(v).toMatchObject({
      fit: 'cover',
      layout: 'single',
      cssWidth: 844,
      cssHeight: 390,
      width: 1688,
      height: 780,
    });
    expect(v.scale).toBe(1688 / 1280);
    expect(v.scale).toBeGreaterThanOrEqual(780 / 720);
    expect(v.visible.x).toBe(0);
    expect(v.visible.width).toBe(1280);
    expect(v.visible.y).toBeCloseTo(64.6, 0);
    expect(v.visible.height).toBeCloseTo(591.5, 1);
    // The crop is a whole number of device pixels, so the translated root keeps pixel art on the device grid.
    expect(v.visible.y * v.scale).toBeCloseTo(Math.round(v.visible.y * v.scale), 9);
    // Evenly on both sides, within one device pixel.
    expect(Math.abs(720 - v.visible.height - 2 * v.visible.y) * v.scale).toBeLessThanOrEqual(1);
    expect(v.panes).toEqual([{ x: 0, y: 0, width: 844, height: 390 }]);
    // About 1.2 times the letterboxed size.
    expect(v.scale / computeViewport(844, 390, 3).scale).toBeCloseTo(1.2, 1);
  });

  it('stops cropping a 1024 × 768 tablet at MIN_VISIBLE_WIDTH and letterboxes it above and below', () => {
    const v = computeViewport(1024, 768, 2, 1, 'split', 'cover');
    expect(MIN_VISIBLE_WIDTH).toBe(1220);
    // Covering the window would show only 960 units of width; the floor keeps 1220, so the scale is 2048 / 1220.
    expect(v).toMatchObject({
      fit: 'cover',
      cssWidth: 1024,
      width: 2048,
      height: 1208,
      cssHeight: 604,
    });
    expect(v.scale).toBe(2048 / 1220);
    expect(v.visible.width).toBe(1220);
    expect(v.visible.x).toBeCloseTo(30, 0);
    expect(v.visible.x * v.scale).toBeCloseTo(Math.round(v.visible.x * v.scale), 9);
    // The whole height of the view, within the one backing pixel the canvas is rounded down by.
    expect(v.visible.y).toBe(0);
    expect(v.visible.height).toBeLessThanOrEqual(720);
    expect(720 - v.visible.height).toBeLessThan(1 / v.scale);
    // The canvas is the fitted box, so the own pane is the canvas box; the window keeps 82 CSS pixel bars.
    expect(v.panes).toEqual([{ x: 0, y: 0, width: 1024, height: 604 }]);
    expect((768 - v.cssHeight) / 2).toBe(82);
    // Larger than the plain letterbox (1024 / 1280), smaller than the uncapped cover (768 / 720).
    expect(v.scale).toBeGreaterThan(computeViewport(1024, 768, 2).scale);
    expect(v.scale).toBeLessThan(1536 / 720);
  });

  it.each([
    [1024, 768, 2],
    [1000, 700, 1],
    [800, 600, 1.5],
    [720, 720, 2],
    [1180, 820, 2],
  ])(
    'never shows less than MIN_VISIBLE_WIDTH on the narrow window %d × %d at DPR %d',
    (w, h, dpr) => {
      const v = computeViewport(w, h, dpr, 1, 'split', 'cover');
      expect(v.visible.width).toBeCloseTo(MIN_VISIBLE_WIDTH, 9);
      expect(v.cssWidth).toBeCloseTo(Math.floor(w * Math.min(dpr, 2) + 1e-6) / Math.min(dpr, 2), 9);
      expect(v.cssHeight).toBeLessThanOrEqual(h);
      expect(v.visible.y).toBe(0);
      expect(v.visible.x).toBeGreaterThanOrEqual(0);
      expect(v.visible.x + v.visible.width).toBeLessThanOrEqual(1280 + 1e-9);
      const pip = computeViewport(w, h, dpr, 2, 'pip', 'cover');
      expect(pip.visible).toEqual(v.visible);
      const inset = pip.panes[1];
      const k = pip.scale / Math.min(dpr, 2);
      expect(pip.cssWidth - ((inset?.x ?? NaN) + (inset?.width ?? NaN))).toBeCloseTo(16 * k, 9);
    },
  );

  it('leaves windows at least as wide as the floor fully covered', () => {
    // 1220:720 is the aspect ratio where the floor starts; 16:9 and wider crop only top and bottom.
    for (const [w, h] of [
      [1220, 720],
      [1280, 720],
      [844, 390],
    ] as const) {
      const v = computeViewport(w, h, 1, 1, 'split', 'cover');
      expect([v.cssWidth, v.cssHeight]).toEqual([w, h]);
      expect(v.visible.width).toBeGreaterThanOrEqual(MIN_VISIBLE_WIDTH - 1e-9);
    }
  });

  it.each([
    [844, 390, 3],
    [863, 360, 2.625],
    [915, 412, 2.625],
    [1280, 720, 1],
    [667.5, 375.25, 1.5],
  ])('covers every device pixel of %d × %d at DPR %d and stays inside the view', (w, h, dpr) => {
    const v = computeViewport(w, h, dpr, 1, 'split', 'cover');
    const d = Math.min(dpr, 2);
    expect(v.width).toBe(Math.floor(w * d + 1e-6));
    expect(v.height).toBe(Math.floor(h * d + 1e-6));
    expect(1280 * v.scale).toBeGreaterThanOrEqual(v.width - 1e-9);
    expect(720 * v.scale).toBeGreaterThanOrEqual(v.height - 1e-9);
    expect(v.visible.x).toBeGreaterThanOrEqual(0);
    expect(v.visible.y).toBeGreaterThanOrEqual(0);
    expect(v.visible.x + v.visible.width).toBeLessThanOrEqual(1280 + 1e-9);
    expect(v.visible.y + v.visible.height).toBeLessThanOrEqual(720 + 1e-9);
    expect(v.visible.width * v.scale).toBeCloseTo(v.width, 9);
    expect(v.visible.height * v.scale).toBeCloseTo(v.height, 9);
  });

  it('measures the pip inset from the visible area: 16 units from its right edge, 64 from its top', () => {
    for (const [w, h, dpr] of [
      [844, 390, 3],
      [1024, 768, 2],
    ] as const) {
      const v = computeViewport(w, h, dpr, 2, 'pip', 'cover');
      const single = computeViewport(w, h, dpr, 1, 'split', 'cover');
      expect(v.layout).toBe('pip');
      expect(v).toMatchObject({ width: single.width, height: single.height, scale: single.scale });
      expect(v.visible).toEqual(single.visible);
      const k = v.scale / 2; // CSS pixels per logical unit
      const [self, inset] = v.panes;
      if (!self || !inset) throw new Error('two panes expected');
      expect(self).toEqual({ x: 0, y: 0, width: v.cssWidth, height: v.cssHeight });
      expect(inset.width).toBeCloseTo(1280 * PIP_SCALE * k, 9);
      expect(inset.height).toBeCloseTo(720 * PIP_SCALE * k, 9);
      expect(v.cssWidth - (inset.x + inset.width)).toBeCloseTo(PIP_MARGIN * k, 9);
      expect(inset.y).toBeCloseTo(PIP_TOP * k, 9);
      expect(inset.y + inset.height).toBeLessThan(v.cssHeight);
    }
  });

  it('ignores cover with two equal panes and keeps contain byte-for-byte', () => {
    expect(computeViewport(1600, 900, 1, 2, 'split', 'cover')).toEqual(
      computeViewport(1600, 900, 1, 2),
    );
    expect(computeViewport(900, 1400, 2, 2, 'split', 'cover').fit).toBe('contain');
    for (const [w, h, dpr] of [
      [844, 390, 3],
      [1005, 565, 1],
      [1024, 768, 2],
    ] as const) {
      expect(computeViewport(w, h, dpr, 1, 'split', 'contain')).toEqual(computeViewport(w, h, dpr));
      expect(computeViewport(w, h, dpr, 2, 'pip', 'contain')).toEqual(
        computeViewport(w, h, dpr, 2, 'pip'),
      );
      expect(computeViewport(w, h, dpr).visible).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    }
  });

  it('starts the pause button 8 units under the kill count over a covered view only', () => {
    const phone = computeViewport(844, 390, 3, 1, 'split', 'cover');
    // 58 logical units at 844 / 1280 CSS pixels per unit, from the window's top (the canvas starts there).
    expect(hudClearCss(phone, 390)).toBeCloseTo((58 * 844) / 1280, 9);
    // A 4:3 tablet keeps 82 pixel bars: 58 units at 1024 / 1220 below the canvas's top.
    const tablet = computeViewport(1024, 768, 2, 1, 'split', 'cover');
    expect(hudClearCss(tablet, 768)).toBeCloseTo(82 + (58 * 1024) / 1220, 9);
    expect(hudClearCss(computeViewport(844, 390, 3), 390)).toBe(0);
    expect(hudClearCss(computeViewport(1600, 900, 1, 2), 900)).toBe(0);
  });

  // Plan step 7: the splash stays centred on the full view; the crop takes only its empty margins.
  it('keeps the boot splash content inside the visible area on phones and 4:3 tablets', () => {
    const b = SPLASH_CONTENT_BOUNDS;
    for (const [w, h, dpr] of [
      [844, 390, 3],
      [863, 360, 2.625],
      [1024, 768, 2],
    ] as const) {
      const { visible } = computeViewport(w, h, dpr, 1, 'split', 'cover');
      expect(b.x).toBeGreaterThanOrEqual(visible.x);
      expect(b.y).toBeGreaterThanOrEqual(visible.y);
      expect(b.x + b.width).toBeLessThanOrEqual(visible.x + visible.width);
      expect(b.y + b.height).toBeLessThanOrEqual(visible.y + visible.height);
    }
  });
});

// The worker re-declares `PaneLayout` (tsconfig.worker.json does not compile main/): both must stay the same union.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const samePaneLayout: Same<PaneLayout, WorkerPaneLayout> = true;
it('keeps the worker message PaneLayout equal to the viewport one', () => {
  expect(samePaneLayout).toBe(true);
});
