import { describe, expect, it } from 'vitest';
import { createRng } from './random.js';

const draw = (rng: { next(): number }, n: number): number[] =>
  Array.from({ length: n }, () => rng.next());

describe('createRng', () => {
  it('keeps int(n) within [0, n)', () => {
    const rng = createRng(42);
    for (const n of [1, 2, 7, 100]) {
      for (let i = 0; i < 2000; i++) {
        const v = rng.int(n);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
      }
    }
  });

  it('keeps next() in [0, 1) and range(a, b) in [a, b)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const r = rng.range(-3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
    }
  });

  it('yields the same sequence for the same seed', () => {
    expect(draw(createRng(123), 50)).toEqual(draw(createRng(123), 50));
    expect(draw(createRng(123), 50)).not.toEqual(draw(createRng(124), 50));
  });

  it('gives forks that differ from each other and from the parent', () => {
    const parent = draw(createRng(99), 20);
    const a = draw(createRng(99).fork('a'), 20);
    const b = draw(createRng(99).fork('b'), 20);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(parent);
    expect(b).not.toEqual(parent);
    expect(draw(createRng(99).fork('a'), 20)).toEqual(a);
  });

  it('does not change the parent when drawing from a fork', () => {
    const untouched = createRng(5);
    const forked = createRng(5);
    const child = forked.fork('waves');
    draw(child, 100);
    expect(forked.next()).toBe(untouched.next());
  });

  it('picks only elements of the array and rejects an empty one', () => {
    const rng = createRng(1);
    const items = ['x', 'y', 'z'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });
});
