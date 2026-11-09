import { expect, it, vi } from 'vitest';
import {
  installPerfOverlay,
  perfOverlayVisible,
  registerPerfStat,
  setPerfOverlayVisible,
} from './overlay';
import { createFrameTimings } from './stats';

/** Records what the overlay draws; only the external ThorVG Text API is stubbed. */
class FakeText {
  static all: FakeText[] = [];
  content = '';
  color: number[] = [];
  shown = true;
  constructor() {
    FakeText.all.push(this);
  }
  font() {
    return this;
  }
  fontSize() {
    return this;
  }
  translate() {
    return this;
  }
  fill(...rgb: number[]) {
    this.color = rgb;
    return this;
  }
  text(value: string) {
    this.content = value;
    return this;
  }
  visible(show: boolean) {
    this.shown = show;
    return this;
  }
}

it('times frames only while shown or recording, and marks a capped frame red', () => {
  let t = 0;
  registerPerfStat('enemies', () => 7);
  const overlay = installPerfOverlay({
    TVG: { Text: FakeText } as never,
    root: { add: vi.fn() },
    visible: false,
    now: () => t,
  });
  const [steps, body] = FakeText.all;
  expect(overlay.meter.enabled).toBe(false);
  expect(perfOverlayVisible()).toBe(false);

  const recorder = createFrameTimings(16);
  overlay.meter.record(recorder);
  expect(overlay.meter.enabled).toBe(true);
  overlay.meter.frameDone(0, 1, 2, 3);
  overlay.meter.frameDone(16, 17, 18, 19);
  expect(recorder.frame.count).toBe(1);
  expect(recorder.frame.median()).toBe(16);
  overlay.meter.record(null);
  expect(overlay.meter.enabled).toBe(false);

  setPerfOverlayVisible(true);
  expect(overlay.meter.enabled).toBe(true);
  expect(steps?.shown).toBe(true);
  for (let i = 0; i < 5; i++) overlay.meter.stepDone(0.5);
  t = 1000;
  overlay.meter.frameDone(1000, 1001, 1002, 1003);
  expect(steps?.content).toBe('steps 5 (cap)');
  expect(steps?.color).toEqual([255, 64, 64]);
  expect(body?.content).toContain('sim 0.50 ms/step');
  expect(body?.content).toContain('enemies 7');
  setPerfOverlayVisible(false);
  expect(overlay.meter.enabled).toBe(false);
  expect(body?.shown).toBe(false);
});
