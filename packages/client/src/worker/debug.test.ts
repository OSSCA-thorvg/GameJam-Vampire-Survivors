import { afterEach, expect, it, vi } from 'vitest';
import { installWorkerDebugTools } from './debug';
import { takeSnapshot } from './test-bridge';

/** Minimal third-party renderer fixture: the counter under test never calls into WASM. */
class Overlay {
  font() {
    return this;
  }
  fontSize() {
    return this;
  }
  fill() {
    return this;
  }
  translate() {
    return this;
  }
  text() {
    return this;
  }
  visible(show?: boolean) {
    return show === undefined ? false : this;
  }
}

afterEach(() => vi.useRealTimers());

it('reports cumulative renders independently of simulation steps', () => {
  vi.useFakeTimers();
  // Only the external ThorVG drawing API is stubbed; use real debug hooks and the real snapshot registry.
  const options = {
    TVG: { Text: Overlay },
    root: { add: vi.fn() },
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
