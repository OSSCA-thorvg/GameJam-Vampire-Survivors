import { expect, it } from 'vitest';
import { formatClock } from './clock.js';

it.each([
  [0, '00:00'],
  [0.99, '00:00'],
  [59.999, '00:59'],
  [60, '01:00'],
  [61.5, '01:01'],
  [899.9, '14:59'],
  [4500, '75:00'],
  [-3, '00:00'],
  [Number.NaN, '00:00'],
])('formats %d s as %s', (seconds, text) => {
  expect(formatClock(seconds)).toBe(text);
});
