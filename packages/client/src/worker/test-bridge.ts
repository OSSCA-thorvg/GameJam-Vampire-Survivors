// Test bridge, worker side (dev and e2e builds only). Every call into this module is wrapped in
// `if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') { … }`, and the module has no top-level side effects, so
// production builds drop it (`scripts/verify/check-prod-bundle.mjs` greps the bundle for `testSnapshot`). It only
// reads state; it never sets gameplay state. Later issues add fields with `registerSnapshotField` and never edit it.
import type { WorkerSnapshot } from '../protocol/worker-messages';

const fields = new Map<string, () => unknown>();

/** Frames counted in the current one-second window, for the snapshot's `fps`. */
let frames = 0;
let windowStart = -1;
let fps = 0;

/**
 * Adds `name` at the top level of every snapshot, read when the snapshot is taken. It replaces a base field of the
 * same name (for example #7's `timeS`). Registering the same name twice logs a warning and keeps the first.
 */
export function registerSnapshotField(name: string, read: () => unknown): void {
  if (fields.has(name)) {
    console.warn(`[test] snapshot field '${name}' is already registered; ignored`);
    return;
  }
  fields.set(name, read);
}

/** Call once per rendered frame; keeps the frames-per-second figure of the last full second. */
export function noteFrame(now: number): void {
  if (windowStart < 0) windowStart = now;
  frames++;
  const elapsed = now - windowStart;
  if (elapsed >= 1000) {
    fps = (frames * 1000) / elapsed;
    frames = 0;
    windowStart = now;
  }
}

/** The base state the worker reports; `fps` is filled in by `takeSnapshot`. */
export type SnapshotBase = Pick<
  WorkerSnapshot,
  'renderer' | 'timeS' | 'steps' | 'paused' | 'hidden' | 'backgroundPolicy' | 'perfOverlay'
>;

/** Builds the snapshot: the base fields, then every registered field on top. */
export function takeSnapshot(base: SnapshotBase): WorkerSnapshot {
  const snapshot: WorkerSnapshot = { ...base, fps };
  for (const [name, read] of fields) snapshot[name] = read();
  return snapshot;
}
