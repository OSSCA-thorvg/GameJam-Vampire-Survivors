import { expect, it, vi } from 'vitest';
import { fakePaintLibrary } from './pool-test-helpers';
import { createStore } from '../ecs/store';
import { PaintPool, RenderBinding } from './pool';

it('reuses hidden paints after warm-up, handles double release and grows only when exhausted', () => {
  const library = fakePaintLibrary();
  const pool = new PaintPool(library, 'enemy.bat', library.layer, 2);
  expect(pool.created).toBe(2);
  expect(pool.visibleCount).toBe(0);
  const a = pool.acquire();
  const b = pool.acquire();
  expect(pool.visibleCount).toBe(2);
  pool.release(a);
  pool.release(a);
  expect(pool.acquire()).toBe(a);
  expect(pool.created).toBe(2);
  expect(pool.acquire()).not.toBe(b);
  expect(pool.created).toBe(3);
  pool.releaseAll();
  pool.releaseAll();
  expect(pool.visibleCount).toBe(0);
  for (let i = 0; i < 3; i++) pool.acquire();
  expect(pool.created).toBe(3);
  expect(pool.visibleCount).toBe(3);
});

it('keeps actual handle zero distinct from an unbound new slot and follows swap removal', () => {
  const library = fakePaintLibrary();
  const pool = new PaintPool(library, 'enemy.bat', library.layer, 1);
  const store = createStore({ x: 'f32', y: 'f32', ...RenderBinding.columns }, 3);
  const binding = new RenderBinding(store, [pool]);
  store.add();
  binding.bind(0, 0);
  expect(store.cols.paintHandle[0]).toBe(0);
  store.add();
  binding.unbind(1);
  expect(pool.visibleCount).toBe(1);
  binding.bind(1, 0);
  store.cols.x[1] = 100;
  binding.unbind(0);
  store.remove(0);
  binding.sync(store, store.cols.x, store.cols.y);
  expect(pool.visibleCount).toBe(1);
  const handle = store.cols.paintHandle[0] ?? -1;
  expect(pool.get(handle).paint).toBeDefined();
  expect(library.paints[handle]?.matrix?.e13).toBe(84);
  expect(() => {
    binding.bind(0, 0);
  }).toThrow();
  binding.unbind(0);
  store.clear();
  store.add();
  binding.unbind(0);
  expect(pool.visibleCount).toBe(0);
  binding.bind(0, 0);
  expect(pool.created).toBe(2);
});

it('reuses the same binding after a new-run pool releaseAll and store clear', () => {
  const library = fakePaintLibrary();
  const pool = new PaintPool(library, 'enemy.bat', library.layer, 3);
  const store = createStore({ x: 'f32', y: 'f32', ...RenderBinding.columns }, 3);
  const binding = new RenderBinding(store, [pool]);
  for (let run = 0; run < 4; run++) {
    for (let i = 0; i < 3; i++) {
      store.add();
      binding.bind(i, 0);
    }
    binding.sync(store, store.cols.x, store.cols.y);
    expect(pool.created).toBe(3);
    expect(pool.visibleCount).toBe(3);
    pool.releaseAll();
    store.clear();
    expect(pool.visibleCount).toBe(0);
  }
});

it('restarts a Lottie instance each time it is acquired, and leaves static paints alone (#11)', () => {
  const { create, layer } = fakePaintLibrary();
  const lottie = { frame: vi.fn() };
  const restart = vi.fn();
  const library = {
    create: () => ({ ...create(), lottie: lottie as never }),
    restart,
  };
  const pool = new PaintPool(library, 'fx.levelUp', layer, 1);
  const handle = pool.acquire();
  pool.release(handle);
  pool.acquire();
  expect(restart).toHaveBeenCalledTimes(2);
  expect(restart).toHaveBeenLastCalledWith(pool.get(handle));
  const plain = new PaintPool({ create, restart }, 'gem.blue', layer, 1);
  plain.acquire();
  expect(restart).toHaveBeenCalledTimes(2);
});
