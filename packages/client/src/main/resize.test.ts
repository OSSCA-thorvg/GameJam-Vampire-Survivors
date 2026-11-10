import { describe, expect, it } from 'vitest';
import type { MainToWorker } from '../protocol/worker-messages';
import { createResizer, RESIZE_DEBOUNCE_MS } from './resize';
import { computeViewport, type PaneMode } from './viewport';

/** A resizer over a fake window and a fake clock. */
function setup(w = 1600, h = 900) {
  const win = { w, h, mode: 'split' as PaneMode };
  const posted: Extract<MainToWorker, { type: 'resize' }>[] = [];
  let applied = 0;
  let time = 0;
  const timers: { cb: () => void; at: number }[] = [];
  const resizer = createResizer({
    measure: (panes, mode) => computeViewport(win.w, win.h, 1, panes, mode),
    mode: () => win.mode,
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
  return { resizer, posted, advance, resize, setMode, applied: () => applied };
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
});
