import { afterEach, expect, it, vi } from 'vitest';
import { installWorkerDebugTools } from './debug';
import { takeSnapshot } from './test-bridge';

afterEach(() => vi.useRealTimers());

it('reports cumulative renders independently of simulation steps', () => {
  vi.useFakeTimers();
  // Use real debug hooks and the real snapshot registry; the overlay lives in perf/overlay.ts (#22).
  const options = {
    loop: {},
    post: vi.fn(),
    describe: () => 'test',
  } as unknown as Parameters<typeof installWorkerDebugTools>[0];
  const hooks = installWorkerDebugTools(options);
  const read = () =>
    takeSnapshot({
      renderer: 'gl',
      timeS: 0,
      steps: 0,
      paused: false,
      hidden: false,
      backgroundPolicy: 'pause',
      perfOverlay: false,
    }).renders;
  expect(read()).toBe(0);
  hooks.onStep();
  expect(read()).toBe(0);
  hooks.onRender();
  hooks.onRender();
  expect(read()).toBe(2);
  hooks.onStep();
  expect(read()).toBe(2);
});
