import { describe, expect, it } from 'vitest';
import { PerfSeries } from './stats';

describe('PerfSeries', () => {
  it('reports the nearest-rank median and p95 of known inputs', () => {
    const series = new PerfSeries(120);
    expect(series.median()).toBe(0);
    for (let i = 100; i >= 1; i--) series.push(i);
    expect(series.count).toBe(100);
    expect(series.median()).toBe(50);
    expect(series.p95()).toBe(95);
    expect(series.max).toBe(100);
    expect(series.mean()).toBe(50.5);
  });

  it('keeps only the last capacity samples and its peak', () => {
    const series = new PerfSeries(4);
    for (const value of [50, 1, 2, 3, 4]) series.push(value);
    expect(series.count).toBe(4);
    expect(series.median()).toBe(2);
    expect(series.p95()).toBe(4);
    expect(series.max).toBe(50);
    series.clear();
    expect(series.count).toBe(0);
    expect(series.max).toBe(0);
  });

  it('reuses the same backing arrays across 1000 pushes and queries', () => {
    const series = new PerfSeries(120);
    const [values, scratch] = series.buffers;
    for (let i = 0; i < 1000; i++) {
      series.push(i % 17);
      series.median();
      series.p95();
    }
    expect(series.buffers[0]).toBe(values);
    expect(series.buffers[1]).toBe(scratch);
    expect(series.count).toBe(120);
  });
});
