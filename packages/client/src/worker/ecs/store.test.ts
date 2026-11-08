import { expect, it, vi } from 'vitest';
import { createRng } from '@vs/shared';
import { createStore } from './store';

it('keeps typed columns, stable IDs and movement callbacks consistent through swap removal', () => {
  const store = createStore({ x: 'f32', damage: 'i32', owner: 'u32', kind: 'u8' }, 3);
  expect(store.cols.x).toBeInstanceOf(Float32Array);
  expect(store.cols.damage).toBeInstanceOf(Int32Array);
  expect(store.cols.owner).toBeInstanceOf(Uint32Array);
  expect(store.cols.kind).toBeInstanceOf(Uint8Array);
  for (let i = 0; i < 3; i++) {
    expect(store.add()).toBe(i);
    store.cols.x[i] = i + 1;
  }
  expect(store.add()).toBe(-1);
  const removed = store.uid[0] ?? -1;
  const moved = store.uid[2] ?? -1;
  const onMove = vi.fn();
  store.onMove = onMove;
  store.remove(0);
  expect(onMove).toHaveBeenCalledExactlyOnceWith(2, 0);
  expect(store.cols.x[0]).toBe(3);
  expect(store.indexOf(moved)).toBe(0);
  expect(store.indexOf(removed)).toBe(-1);
  expect(store.add()).toBe(2);
  expect(store.cols.x[2]).toBe(0);
  expect(store.indexOf(removed)).toBe(-1);
  store.remove(2);
  expect(onMove).toHaveBeenCalledTimes(1);
  store.clear();
  expect(store.count).toBe(0);
  expect(store.indexOf(moved)).toBe(-1);
});

// Long seeded property test: CI runners are several times slower than local machines (#80).
it('matches a reference model for 10,000 seeded add/remove/clear operations', () => {
  const store = createStore({ value: 'i32' }, 64);
  const model = new Map<number, number>();
  const rng = createRng(8);
  for (let step = 0; step < 10_000; step++) {
    if (rng.next() < 0.55) {
      const slot = store.add();
      if (slot !== -1) {
        store.cols.value[slot] = step;
        model.set(store.uid[slot] ?? -1, step);
      }
    } else if (store.count > 0) {
      const slot = rng.int(store.count);
      const removed = store.uid[slot] ?? -1;
      store.remove(slot);
      model.delete(removed);
      expect(store.indexOf(removed)).toBe(-1);
    }
    expect(store.count).toBe(model.size);
    for (const [uid, value] of model) expect(store.cols.value[store.indexOf(uid)]).toBe(value);
    if (step % 1000 === 999) {
      const dead = [...model.keys()];
      store.clear();
      model.clear();
      for (const uid of dead) expect(store.indexOf(uid)).toBe(-1);
    }
  }
}, 30_000);

it('retires exhausted ID indices instead of reviving a stale UID', () => {
  const store = createStore({}, 1);
  const first = store.add();
  const stale = store.uid[first] ?? -1;
  for (let generation = 0; generation <= 0xfffff; generation++) {
    if (store.indexOf(store.uid[0] ?? -1) !== 0)
      throw new Error('Live UID stopped resolving before exhaustion');
    store.remove(0);
    if (generation < 0xfffff) {
      if (store.add() !== 0) throw new Error('ID retired too early');
      if (store.indexOf(stale) !== -1) throw new Error('Stale UID revived');
    }
  }
  expect(store.add()).toBe(-1);
  expect(store.indexOf(stale)).toBe(-1);
});

it('uses unsigned high-bit UIDs and rejects invalid indices/capacities', () => {
  const store = createStore({}, 1);
  for (let i = 0; i < 0x80001; i++) {
    store.add();
    if (i !== 0x80000) store.remove(0);
  }
  expect(store.uid[0]).toBe(0x80000000);
  expect(store.indexOf(0x80000000)).toBe(0);
  for (const value of [-1, 1.5, NaN, 2 ** 32]) expect(store.indexOf(value)).toBe(-1);
  expect(() => {
    store.remove(1);
  }).toThrow(RangeError);
  for (const value of [0, -1, 4097, 1.5]) expect(() => createStore({}, value)).toThrow(RangeError);
});
