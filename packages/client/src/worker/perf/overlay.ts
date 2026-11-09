// The perf overlay (#2, moved here by #22): frame interval median and p95, the per-phase timings, the steps run this
// frame and the lines later issues add with `registerPerfStat`. Production-safe, so it holds no debug strings: dev
// builds toggle it through `worker/debug.ts` (`` ` ``), and production builds show it when the page is opened with
// `?perf` (`init.perf`). While it is hidden and no stress scenario records, the worker skips all timing: its per-frame
// cost is one boolean check (`meter.enabled`).
import type { Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { MAX_STEPS } from '../constants';
import { HUD_FONT } from '../render/thorvg';
import { createFrameTimings, type FrameTimings, type PerfSeries } from './stats';

/** Overlay text refresh interval: at most 4 updates per second. */
const OVERLAY_INTERVAL_MS = 250;
const FONT_SIZE = 18;
/** The steps line sits above the body text; ThorVG's line advance at this size is about 33 units. */
const LINE_HEIGHT = 33;
const LEFT = 12;
const TOP = 12;

const perfStats: { label: string; read: () => string | number }[] = [];

/** Adds a line to the perf overlay (for example the live entity counts, or #6's `entities` and `step ms`). */
export function registerPerfStat(label: string, read: () => string | number): void {
  perfStats.push({ label, read });
}

/** Times the worker's frames while `enabled`; the worker checks `enabled` before reading the clock. */
export interface PerfMeter {
  /** True while the overlay is visible or a recorder is attached. */
  enabled: boolean;
  /** One simulation step took `ms`. */
  stepDone(ms: number): void;
  /**
   * One frame finished: it started at `start`, set the transforms until `transformed`, ran `canvas.update()` until
   * `updated` and `canvas.render()` until `end` (all `performance.now()` values).
   */
  frameDone(start: number, transformed: number, updated: number, end: number): void;
  /** Also writes every sample into `target` (a stress scenario's full-run buffers), or stops when `null`. */
  record(target: FrameTimings | null): void;
}

export interface PerfOverlay {
  readonly meter: PerfMeter;
  setVisible(visible: boolean): void;
  readonly visible: boolean;
}

let installed: PerfOverlay | null = null;

/** Shows or hides the overlay; does nothing before `installPerfOverlay`. */
export function setPerfOverlayVisible(visible: boolean): void {
  installed?.setVisible(visible);
}

/** Whether the overlay is shown (the test bridge's `perfOverlay`). */
export function perfOverlayVisible(): boolean {
  return installed?.visible ?? false;
}

const ms = (series: PerfSeries): string => series.median().toFixed(2);

/** Creates the overlay's two Text paints once, on `root` (above every layer). Call once after ThorVG is ready. */
export function installPerfOverlay(opts: {
  TVG: Pick<ThorVGNamespace, 'Text'>;
  root: Pick<Scene, 'add'>;
  visible: boolean;
  now?: () => number;
}): PerfOverlay {
  if (installed) return installed;
  const now = opts.now ?? (() => performance.now());
  const steps: Text = new opts.TVG.Text();
  steps.font(HUD_FONT).fontSize(FONT_SIZE).fill(255, 255, 255).translate(LEFT, TOP);
  const body: Text = new opts.TVG.Text();
  body
    .font(HUD_FONT)
    .fontSize(FONT_SIZE)
    .fill(255, 255, 255)
    .translate(LEFT, TOP + LINE_HEIGHT);
  steps.text('steps 0');
  body.text('perf');
  opts.root.add(steps);
  opts.root.add(body);

  const timings = createFrameTimings();
  let recorder: FrameTimings | null = null;
  let visible = false;
  let lastStart = -1;
  let stepsThisFrame = 0;
  /** The most steps one frame ran since the last text refresh, so a capped frame between refreshes still shows. */
  let windowSteps = 0;
  let lastText = 0;

  const refresh = (): void => {
    const capped = windowSteps >= MAX_STEPS;
    steps.text(`steps ${String(windowSteps)}${capped ? ' (cap)' : ''}`);
    if (capped) steps.fill(255, 64, 64);
    else steps.fill(255, 255, 255);
    windowSteps = 0;
    const lines = [
      `frame ${ms(timings.frame)} p95 ${timings.frame.p95().toFixed(2)} ms`,
      `sim ${ms(timings.sim)} ms/step`,
      `xform ${ms(timings.transform)} upd ${ms(timings.update)} rnd ${ms(timings.render)}`,
    ];
    for (const stat of perfStats) lines.push(`${stat.label} ${String(stat.read())}`);
    body.text(lines.join('\n'));
  };

  const meter: PerfMeter = {
    enabled: false,
    stepDone(value) {
      stepsThisFrame++;
      timings.sim.push(value);
      recorder?.sim.push(value);
    },
    frameDone(start, transformed, updated, end) {
      if (lastStart >= 0) {
        timings.frame.push(start - lastStart);
        recorder?.frame.push(start - lastStart);
      }
      lastStart = start;
      timings.transform.push(transformed - start);
      timings.update.push(updated - transformed);
      timings.render.push(end - updated);
      if (recorder) {
        recorder.transform.push(transformed - start);
        recorder.update.push(updated - transformed);
        recorder.render.push(end - updated);
      }
      if (stepsThisFrame > windowSteps) windowSteps = stepsThisFrame;
      if (visible && end - lastText >= OVERLAY_INTERVAL_MS) {
        lastText = end;
        refresh();
      }
      stepsThisFrame = 0;
    },
    record(target) {
      recorder = target;
      update();
    },
  };
  function update(): void {
    const enabled = visible || recorder !== null;
    if (enabled && !meter.enabled) {
      lastStart = -1;
      stepsThisFrame = 0;
      windowSteps = 0;
    }
    meter.enabled = enabled;
  }

  const overlay: PerfOverlay = {
    meter,
    setVisible(show) {
      visible = show;
      steps.visible(show);
      body.visible(show);
      if (show) {
        refresh();
        lastText = now();
      }
      update();
    },
    get visible() {
      return visible;
    },
  };
  overlay.setVisible(opts.visible);
  installed = overlay;
  return overlay;
}
