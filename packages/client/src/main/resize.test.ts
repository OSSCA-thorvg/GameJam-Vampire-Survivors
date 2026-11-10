import { describe, expect, it } from 'vitest';
import type { MainToWorker } from '../protocol/worker-messages';
import { createResizer, RESIZE_DEBOUNCE_MS } from './resize';
import { computeViewport, type PaneMode, type ViewFit } from './viewport';

/** A resizer over a fake window and a fake clock. */
function setup(w = 1600, h = 900) {
  const win = { w, h, mode: 'split' as PaneMode, fit: 'contain' as ViewFit };
  const posted: Extract<MainToWorker, { type: 'resize' }>[] = [];
  let applied = 0;
  let time = 0;
  const timers: { cb: () => void; at: number }[] = [];
  const resizer = createResizer({
    measure: (panes, mode, fit) => computeViewport(win.w, win.h, 1, panes, mode, fit),
    mode: () => win.mode,
    fit: () => win.fit,
    apply: () => applied++,
    post: (m) => posted.push(m),
    setTimer: (cb, ms) => {
      timers.push({ cb, at: time + ms });
      return timers.length;
    },
    clearTimer: (id) => {
      const t = timers[id - 1];
      if (t) t.at = Infinity;
    },
  });
  const advance = (ms: number) => {
    time += ms;
    for (const t of timers)
      if (t.at <= time) {
        t.at = Infinity;
        t.cb();
      }
  };
  const resize = (nw: number, nh: number) => {
    win.w = nw;
    win.h = nh;
    resizer.onResize();
  };
  const setMode = (mode: PaneMode) => {
    win.mode = mode;
    resizer.onModeChange();
  };
  /** The input mode switched: touch asks for the inset and the cover fit, keys for the split and the letterbox. */
  const setInput = (input: 'touch' | 'keys') => {
    win.mode = input === 'touch' ? 'pip' : 'split';
    win.fit = input === 'touch' ? 'cover' : 'contain';
    resizer.onModeChange();
  };
  return { resizer, posted, advance, resize, setMode, setInput, applied: () => applied };
}

describe('createResizer (#115)', () => {
  it('posts exactly one resize for a burst of same-layout resize events, after the trailing debounce', () => {
    const t = setup(1600, 900);
    // A window drag in single player: 30 events 16 ms apart.
    for (let i = 1; i <= 30; i++) {
      t.resize(1600 - i * 5, 900 - i * 3);
      t.advance(16);
    }
    expect(t.posted).toEqual([]);
    t.advance(RESIZE_DEBOUNCE_MS);
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]).toMatchObject({
      type: 'resize',
      layout: 'single',
      width: 1440,
      height: 810,
    });
  });

  it('keeps the debounce for same-layout changes in a split, too', () => {
    const t = setup(1600, 900);
    t.resizer.setPanes(2);
    t.posted.length = 0;
    for (let i = 1; i <= 10; i++) {
      t.resize(1600 + i * 10, 900);
      t.advance(16);
    }
    expect(t.posted).toEqual([]);
    t.advance(RESIZE_DEBOUNCE_MS);
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]?.layout).toBe('columns');
  });

  it('posts a layout-crossing resize at once and cancels the pending debounce', () => {
    const t = setup(1600, 900);
    t.resizer.setPanes(2);
    expect(t.posted).toEqual([expect.objectContaining({ layout: 'columns' })]);
    t.resize(1610, 900); // same layout: pending
    t.resize(900, 1400); // crosses to rows: now
    expect(t.posted.at(-1)).toMatchObject({ layout: 'rows', width: 900 });
    expect(t.posted).toHaveLength(2);
    t.advance(RESIZE_DEBOUNCE_MS * 2);
    expect(t.posted).toHaveLength(2);
    expect(t.resizer.viewport.layout).toBe('rows');
  });

  it('relayouts at once on a pane-count change and skips a post that changes nothing', () => {
    const t = setup(1600, 900);
    t.resizer.setPanes(1);
    expect(t.posted).toEqual([]);
    t.resizer.setPanes(2);
    t.resizer.setPanes(1);
    expect(t.posted.map((m) => m.layout)).toEqual(['columns', 'single']);
    expect(t.resizer.panes).toBe(1);
    // A resize event that leaves the canvas as it is: applied (offsets may move), never posted.
    t.resize(1600, 900);
    t.advance(RESIZE_DEBOUNCE_MS);
    expect(t.posted).toHaveLength(2);
    expect(t.applied()).toBe(3);
  });

  // #150, ADR 0024: the input mode decides between the split and the touch inset.
  it('relayouts at once when the pane mode changes during a split, and never in single player', () => {
    const t = setup(915, 412);
    t.setMode('pip');
    expect(t.posted).toEqual([]);
    expect(t.resizer.viewport.layout).toBe('single');
    t.resizer.setPanes(2);
    expect(t.posted.at(-1)).toMatchObject({ layout: 'pip' });
    t.resize(920, 412); // same layout: pending
    t.setMode('split'); // a mouse or key: columns now, the pending debounce cancelled
    expect(t.posted.at(-1)).toMatchObject({ layout: 'columns' });
    expect(t.posted).toHaveLength(2);
    t.advance(RESIZE_DEBOUNCE_MS * 2);
    expect(t.posted).toHaveLength(2);
    t.setMode('split'); // no change: nothing
    expect(t.posted).toHaveLength(2);
    t.setMode('pip');
    expect(t.posted.map((m) => m.layout)).toEqual(['pip', 'columns', 'pip']);
    expect(t.resizer.viewport.panes).toHaveLength(2);
  });

  // #171, ADR 0025: touch mode covers the window; the fit follows the input mode in single player too.
  it('relayouts at once when the fit changes, posts the visible rect, and one resize per switch', () => {
    const t = setup(1024, 768);
    expect(t.resizer.viewport).toMatchObject({ fit: 'contain', cssHeight: 576 });
    t.setInput('touch');
    expect(t.posted).toHaveLength(1);
    // DPR 1: the floor (1220 units) keeps the 4:3 window from covering fully: 1024 × 604, bars above and below.
    expect(t.posted[0]).toMatchObject({
      type: 'resize',
      layout: 'single',
      width: 1024,
      height: 604,
      visible: { y: 0, width: 1220 },
    });
    expect(t.posted[0]?.visible.x).toBeCloseTo(30, 0);
    expect(t.resizer.viewport.fit).toBe('cover');
    t.setInput('touch'); // no change: nothing
    expect(t.posted).toHaveLength(1);
    t.resize(1030, 768); // same layout and fit: pending
    t.setInput('keys'); // back to the letterbox now, the pending debounce cancelled
    expect(t.posted).toHaveLength(2);
    expect(t.posted[1]).toMatchObject({
      layout: 'single',
      visible: { x: 0, y: 0, width: 1280, height: 720 },
    });
    expect(t.posted[1]?.height).toBe(579); // 1030 × 768 letterboxed
    t.advance(RESIZE_DEBOUNCE_MS * 2);
    expect(t.posted).toHaveLength(2);
    // Every post carries its own copy of the rect.
    expect(t.posted[1]?.visible).not.toBe(t.resizer.viewport.visible);
  });

  it('keeps the debounce for size changes within the cover fit and posts a crop change', () => {
    const t = setup(844, 390);
    t.setInput('touch');
    t.posted.length = 0;
    for (let i = 1; i <= 10; i++) {
      t.resize(844, 390 + i);
      t.advance(16);
    }
    expect(t.posted).toEqual([]);
    t.advance(RESIZE_DEBOUNCE_MS);
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]).toMatchObject({ width: 844, height: 400 });
    expect(t.posted[0]?.visible.height).toBeCloseTo((400 * 1280) / 844, 6);
  });

  it('switches between the covered inset and the letterboxed split during a match', () => {
    const t = setup(915, 412);
    t.setInput('touch');
    t.resizer.setPanes(2);
    expect(t.resizer.viewport).toMatchObject({ layout: 'pip', fit: 'cover', cssWidth: 915 });
    t.setInput('keys');
    expect(t.resizer.viewport).toMatchObject({ layout: 'columns', fit: 'contain' });
    expect(t.posted.map((m) => m.layout)).toEqual(['single', 'pip', 'columns']);
  });
});
