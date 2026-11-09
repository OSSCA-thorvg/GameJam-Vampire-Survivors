import { expect, it, vi } from 'vitest';
import { createBootGate } from './boot-gate';

it.each([
  ['assets first', ['assetsReady', 'splashEnded'] as const],
  ['splash first', ['splashEnded', 'assetsReady'] as const],
])('posts ready exactly once after both, %s', (_name, order) => {
  const onReady = vi.fn();
  const gate = createBootGate(onReady);
  gate[order[0]]();
  gate[order[0]]();
  expect(onReady).not.toHaveBeenCalled();
  expect(gate.ready).toBe(false);
  gate[order[1]]();
  expect(onReady).toHaveBeenCalledOnce();
  expect(gate.ready).toBe(true);
  gate.assetsReady();
  gate.splashEnded();
  expect(onReady).toHaveBeenCalledOnce();
});

it('never opens on one side alone', () => {
  const onReady = vi.fn();
  const a = createBootGate(onReady);
  for (let i = 0; i < 5; i++) a.assetsReady();
  const b = createBootGate(onReady);
  for (let i = 0; i < 5; i++) b.splashEnded();
  expect(onReady).not.toHaveBeenCalled();
});
