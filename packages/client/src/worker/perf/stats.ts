// Frame timing buffers for the perf overlay and the stress scenarios (#22). Production-safe: no debug strings. Every
// array is allocated when the series is created; `push`, `median` and `p95` allocate nothing.

/** A ring buffer of the last `capacity` samples (milliseconds), with allocation-free order statistics. */
export class PerfSeries {
  private readonly values: Float32Array;
  private readonly scratch: Float32Array;
  private next = 0;
  private filled = 0;
  private peak = 0;

  constructor(readonly capacity = 120) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('PerfSeries capacity must be a positive integer');
    this.values = new Float32Array(capacity);
    this.scratch = new Float32Array(capacity);
  }

  /** Samples held, at most `capacity`. */
  get count(): number {
    return this.filled;
  }

  push(value: number): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
    if (value > this.peak) this.peak = value;
  }

  clear(): void {
    this.next = 0;
    this.filled = 0;
    this.peak = 0;
  }

  /** The largest sample pushed since the last `clear`, including ones the ring has overwritten. */
  get max(): number {
    return this.peak;
  }

  /** Mean of the held samples; 0 when empty. Worker clocks are coarse (often 0.1 ms), so sub-ms phases read better as means. */
  mean(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.values[i] ?? 0;
    return sum / this.filled;
  }

  median(): number {
    return this.quantile(0.5);
  }

  p95(): number {
    return this.quantile(0.95);
  }

  /** Nearest-rank quantile (`q` in 0..1) of the held samples; 0 when empty. Sorts a copy in the preallocated scratch. */
  quantile(q: number): number {
    const n = this.filled;
    if (n === 0) return 0;
    // Unfilled slots sort last as +Infinity, so only the first `n` sorted values are read; no view is allocated.
    const sorted = this.scratch;
    sorted.set(this.values);
    sorted.fill(Infinity, n);
    sorted.sort();
    const rank = Math.min(n, Math.max(1, Math.ceil(q * n)));
    return sorted[rank - 1] ?? 0;
  }

  /** The backing arrays, for the test that proves they are reused. */
  get buffers(): readonly [Float32Array, Float32Array] {
    return [this.values, this.scratch];
  }
}

/** The timings one frame records: the frame interval, sim ms per step, and the transform, update and render phases. */
export interface FrameTimings {
  readonly frame: PerfSeries;
  readonly sim: PerfSeries;
  readonly transform: PerfSeries;
  readonly update: PerfSeries;
  readonly render: PerfSeries;
}

export function createFrameTimings(capacity = 120): FrameTimings {
  return {
    frame: new PerfSeries(capacity),
    sim: new PerfSeries(capacity),
    transform: new PerfSeries(capacity),
    update: new PerfSeries(capacity),
    render: new PerfSeries(capacity),
  };
}
