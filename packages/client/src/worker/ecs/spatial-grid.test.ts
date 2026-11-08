import { expect, it } from 'vitest';
import { createRng } from '@vs/shared';
import { createSpatialGrid } from './spatial-grid';

it.each([8, 4096])('matches brute force for 200 probes over 2000 points, buckets=%i', (buckets) => {
  const rng = createRng(42);
  const xs = Float32Array.from({ length: 2000 }, () => rng.range(-5000, 5000));
  const ys = Float32Array.from({ length: 2000 }, () => rng.range(-5000, 5000));
  const grid = createSpatialGrid({ cellSize: 64, buckets, maxItems: xs.length });
  grid.rebuild(xs, ys, xs.length);
  const out = new Int32Array(xs.length);
  for (let probe = 0; probe < 200; probe++) {
    const x = rng.range(-5000, 5000);
    const y = rng.range(-5000, 5000);
    const radius = probe % 2 ? rng.range(0, 160) : rng.range(160, 2500);
    const expected: number[] = [];
    let closest = -1;
    let best = radius * radius;
    for (let i = 0; i < xs.length; i++) {
      const distance = ((xs[i] ?? 0) - x) ** 2 + ((ys[i] ?? 0) - y) ** 2;
      if (distance <= radius * radius) expected.push(i);
      if (distance < best || (distance === best && (closest === -1 || i < closest))) {
        best = distance;
        closest = i;
      }
    }
    const written = grid.query(x, y, radius, out);
    expect([...out.subarray(0, written)].sort((a, b) => a - b)).toEqual(expected);
    expect(grid.nearest(x, y, radius)).toBe(closest);
  }
});

it('deduplicates collided buckets, truncates output and checks neighbouring rings and ties', () => {
  const grid = createSpatialGrid({ cellSize: 64, buckets: 1, maxItems: 4 });
  grid.rebuild(new Float32Array([60, 65, -1, 65]), new Float32Array(4), 4);
  const out = new Int32Array(4);
  expect(grid.query(63, 0, 100, out)).toBe(4);
  expect(new Set(out).size).toBe(4);
  expect(grid.query(63, 0, 100, new Int32Array(1))).toBe(1);
  expect(grid.query(63, 0, 100, new Int32Array(0))).toBe(0);
  expect(grid.nearest(63, 0, 100)).toBe(1);
  expect(grid.nearest(-1, 0, 0)).toBe(2);
  grid.rebuild(new Float32Array([0, 64.1]), new Float32Array([0, 0]), 2);
  expect(grid.nearest(63.9, 0, 100)).toBe(1);
});

it('handles huge finite coordinates, squared overflow/underflow and tiny cells without unbounded loops', () => {
  for (const cellSize of [64, 1e-308]) {
    const grid = createSpatialGrid({ cellSize, buckets: 4, maxItems: 1 });
    grid.rebuild(new Float32Array([0]), new Float32Array([0]), 1);
    const out = new Int32Array(1);
    for (const [x, radius, expected] of [
      [1e30, 0, 0],
      [Number.MAX_SAFE_INTEGER * 64, 64, 0],
      [1e300, 1e200, 0],
      [1e300, 1e301, 1],
      [1e-200, 0, 0],
      [1e-200, 1e-250, 0],
      [1e-250, 1e-200, 1],
    ]) {
      if (x === undefined || radius === undefined || expected === undefined)
        throw new Error('Invalid test');
      expect(grid.query(x, 0, radius, out)).toBe(expected);
      expect(grid.nearest(x, 0, radius)).toBe(expected ? 0 : -1);
    }
  }
});

it('rebuild drops old items and validates construction and input bounds', () => {
  const grid = createSpatialGrid({ cellSize: 64, buckets: 4, maxItems: 1 });
  const out = new Int32Array(1);
  expect(grid.query(0, 0, 1, out)).toBe(0);
  grid.rebuild(new Float32Array([0]), new Float32Array([0]), 1);
  grid.rebuild(new Float32Array(0), new Float32Array(0), 0);
  expect(grid.nearest(0, 0, 10)).toBe(-1);
  expect(() => {
    grid.rebuild(new Float32Array(1), new Float32Array(1), 2);
  }).toThrow();
  expect(() => grid.query(0, 0, -1, out)).toThrow();
  expect(() => createSpatialGrid({ cellSize: 64, buckets: 3, maxItems: 1 })).toThrow();
});
