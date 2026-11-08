import type { Schema, Store } from '../ecs/store';
import type { PaintPool } from './pool';
import { setTransform } from './transform';

const bindingColumns = { poolId: 'u8', paintHandle: 'i32' } as const;
type BindingSchema = Schema & typeof bindingColumns;

/** Slots own handles in their columns, so swap-remove moves the binding together with the entity. */
export class RenderBinding<S extends BindingSchema> {
  static readonly columns = bindingColumns;
  private readonly bound: Uint8Array;
  private readonly boundUid: Uint32Array;
  constructor(
    private readonly store: Store<S>,
    private readonly pools: readonly PaintPool[],
  ) {
    this.bound = new Uint8Array(store.capacity);
    this.boundUid = new Uint32Array(store.capacity);
  }
  private pool(id: number): PaintPool {
    const pool = this.pools[id];
    if (!Number.isInteger(id) || id < 0 || id > 255 || !pool)
      throw new RangeError('Unknown paint pool');
    return pool;
  }
  bind(slot: number, poolId: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.store.count)
      throw new RangeError('Bind needs a live entity slot');
    const uid = this.store.uid[slot] ?? 0;
    const idIndex = uid & 0xfff;
    if (this.bound[idIndex] && this.boundUid[idIndex] === uid)
      throw new Error('Unbind the existing paint before binding or removing its entity');
    const handle = this.pool(poolId).acquire();
    this.store.cols.poolId[slot] = poolId;
    this.store.cols.paintHandle[slot] = handle;
    this.bound[idIndex] = 1;
    this.boundUid[idIndex] = uid;
  }
  unbind(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.store.count)
      throw new RangeError('Unbind needs a live entity slot');
    const uid = this.store.uid[slot] ?? 0;
    const idIndex = uid & 0xfff;
    if (!this.bound[idIndex] || this.boundUid[idIndex] !== uid) return;
    this.pool(this.store.cols.poolId[slot] ?? 0).release(this.store.cols.paintHandle[slot] ?? 0);
    this.bound[idIndex] = 0;
    this.store.cols.paintHandle[slot] = 0;
  }
  sync(
    store: Store<S>,
    xs: Float32Array,
    ys: Float32Array,
    rotations?: Float32Array,
    flips?: Uint8Array,
    scales?: Float32Array,
  ): void {
    if (store !== this.store) throw new Error('A binding can only sync its own store');
    for (let i = 0; i < store.count; i++) {
      const uid = store.uid[i] ?? 0;
      const idIndex = uid & 0xfff;
      if (!this.bound[idIndex] || this.boundUid[idIndex] !== uid) continue;
      const instance = this.pool(store.cols.poolId[i] ?? 0).get(store.cols.paintHandle[i] ?? 0);
      setTransform(
        instance,
        xs[i] ?? 0,
        ys[i] ?? 0,
        rotations?.[i] ?? 0,
        scales?.[i] ?? 1,
        flips?.[i] === 1,
      );
    }
  }
}
