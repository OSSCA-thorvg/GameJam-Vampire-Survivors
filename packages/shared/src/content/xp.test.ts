import { describe, expect, it } from 'vitest';
import { gemTier, xpToNext } from './xp.js';

describe('xpToNext', () => {
  it.each([
    [1, 5],
    [2, 15],
    [20, 5 + 19 * 10],
    [21, 5 + 19 * 10 + 13],
    [40, 5 + 19 * 10 + 20 * 13],
    [41, 5 + 19 * 10 + 20 * 13 + 16],
  ])('level %i needs %i', (level, need) => {
    expect(xpToNext(level)).toBe(need);
  });
});

describe('gemTier', () => {
  it.each([
    [1, 'blue'],
    [4, 'blue'],
    [5, 'green'],
    [9, 'green'],
    [10, 'red'],
    [250, 'red'],
  ])('value %i is %s', (value, tier) => {
    expect(gemTier(value)).toBe(tier);
  });
});
