// Iterate slots below count; iterate backwards when removing. A removal moves the last slot into the hole.
export type FieldKind = 'f32' | 'i32' | 'u32' | 'u8';
export type Schema = Record<string, FieldKind>;
export type Columns<S extends Schema> = {
  [K in keyof S]: S[K] extends 'f32'
    ? Float32Array
    : S[K] extends 'i32'
      ? Int32Array
      : S[K] extends 'u32'
        ? Uint32Array
        : Uint8Array;
};
export interface Store<S extends Schema> {
  readonly capacity: number;
  readonly count: number;
  readonly cols: Columns<S>;
  readonly uid: Uint32Array;
  /** Returns a zeroed slot, or -1 when full or all free ID indices are exhausted. */
  add(): number;
  remove(index: number): void;
  indexOf(uid: number): number;
  onMove?: (from: number, to: number) => void;
  clear(): void;
}

const INDEX_BITS = 12;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const MAX_GENERATION = 0xfffff;
const columnTypes = { f32: Float32Array, i32: Int32Array, u32: Uint32Array, u8: Uint8Array };

export function createStore<const S extends Schema>(schema: S, capacity: number): Store<S> {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096)
    throw new RangeError('Store capacity must be an integer from 1 to 4096');
  const columns: (Float32Array | Int32Array | Uint32Array | Uint8Array)[] = [];
  const entries = Object.entries(schema).map(([key, kind]) => {
    const column = new columnTypes[kind](capacity);
    columns.push(column);
    return [key, column] as const;
  });
  // Each key was constructed with exactly the typed-array constructor described by its schema field.
  const cols = Object.fromEntries(entries) as Columns<S>;
  const uid = new Uint32Array(capacity);
  const slotOfIndex = new Int32Array(capacity).fill(-1);
  const generation = new Uint32Array(capacity);
  const free = Int32Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
  let freeCount = capacity;
  let count = 0;

  const freeIndex = (idIndex: number): void => {
    slotOfIndex[idIndex] = -1;
    const previous = generation[idIndex] ?? 0;
    // Never wrap: reusing a 20-bit generation would revive an old UID. Retire that index instead.
    if (previous === MAX_GENERATION) return;
    generation[idIndex] = previous + 1;
    free[freeCount++] = idIndex;
  };
  const store: Store<S> = {
    capacity,
    get count() {
      return count;
    },
    cols,
    uid,
    add() {
      if (count === capacity || freeCount === 0) return -1;
      const idIndex = free[--freeCount] ?? 0;
      const slot = count++;
      uid[slot] = (((generation[idIndex] ?? 0) << INDEX_BITS) | idIndex) >>> 0;
      slotOfIndex[idIndex] = slot;
      let field = 0;
      while (field < columns.length) {
        const column = columns[field++];
        if (column) column[slot] = 0;
      }
      return slot;
    },
    remove(index) {
      if (!Number.isInteger(index) || index < 0 || index >= count)
        throw new RangeError('Store.remove needs a live slot');
      const removedIndex = (uid[index] ?? 0) & INDEX_MASK;
      const last = count - 1;
      if (index !== last) {
        let field = 0;
        while (field < columns.length) {
          const column = columns[field++];
          if (column) column[index] = column[last] ?? 0;
        }
        const movedUid = uid[last] ?? 0;
        uid[index] = movedUid;
        slotOfIndex[movedUid & INDEX_MASK] = index;
      }
      freeIndex(removedIndex);
      count--;
      if (index !== last) store.onMove?.(last, index);
    },
    indexOf(candidate) {
      if (!Number.isInteger(candidate) || candidate < 0 || candidate > 0xffffffff) return -1;
      const index = candidate & INDEX_MASK;
      const slot = slotOfIndex[index] ?? -1;
      return slot >= 0 && slot < count && uid[slot] === candidate ? slot : -1;
    },
    clear() {
      for (let slot = 0; slot < count; slot++) freeIndex((uid[slot] ?? 0) & INDEX_MASK);
      count = 0;
    },
  };
  return store;
}
