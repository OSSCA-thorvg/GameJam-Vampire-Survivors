/**
 * Seeded PRNG (ADR 0004): every random decision in the game draws from an `Rng`, never `Math.random()`, so runs can
 * be reproduced. Based on mulberry32. Use `fork(label)` to give each system (waves, drops, interference) its own
 * stream, so one system's draws never shift another's sequence.
 */
export interface Rng {
  /** A float in `[0, 1)`. */
  next(): number;
  /** A float in `[a, b)`. */
  range(a: number, b: number): number;
  /** An integer in `[0, n)`. */
  int(n: number): number;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** An independent stream derived from this stream's seed and a hash of `label`. Does not advance this stream. */
  fork(label: string): Rng;
}

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
function hashLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes two 32-bit values into a well-distributed 32-bit seed (murmur3 finalizer). */
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number): Rng {
  const origin = seed >>> 0;
  let state = origin;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('Rng.pick: empty array');
      return arr[Math.floor(next() * arr.length)] as T;
    },
    fork: (label) => createRng(mix(origin, hashLabel(label))),
  };
}
