import type { Scene } from '@thorvg/webcanvas';
import type { DrawableAssetId } from '@vs/shared';
import type { AssetInstance, AssetLibrary } from '../assets/library';

export { RenderBinding } from './binding';

/** Owns live instances for a layer; release hides them without disposing or unregistering Lottie playback. */
export class PaintPool {
  private readonly instances: AssetInstance[] = [];
  private readonly free: number[] = [];
  private readonly active: boolean[] = [];
  get created(): number {
    return this.instances.length;
  }
  /** Read only, used by diagnostics; never called from the per-entity frame loop. */
  get visibleCount(): number {
    let count = 0;
    for (const instance of this.instances) if (instance.paint.visible()) count++;
    return count;
  }
  constructor(
    private readonly library: Pick<AssetLibrary, 'create'>,
    private readonly id: DrawableAssetId,
    private readonly layer: Pick<Scene, 'add'>,
    prewarm: number,
  ) {
    if (!Number.isInteger(prewarm) || prewarm < 0)
      throw new RangeError('Pool prewarm must be a nonnegative integer');
    for (let i = 0; i < prewarm; i++) this.grow();
  }
  private grow(): void {
    const handle = this.instances.length;
    const instance = this.library.create(this.id);
    instance.paint.visible(false);
    this.layer.add(instance.paint);
    this.instances.push(instance);
    this.active.push(false);
    this.free.push(handle);
  }
  acquire(): number {
    if (this.free.length === 0) this.grow();
    const handle = this.free.pop();
    if (handle === undefined) throw new Error('Pool growth did not provide a handle');
    this.active[handle] = true;
    this.get(handle).paint.visible(true);
    return handle;
  }
  release(handle: number): void {
    const instance = this.get(handle);
    if (!this.active[handle]) return;
    instance.paint.visible(false);
    this.active[handle] = false;
    this.free.push(handle);
  }
  releaseAll(): void {
    for (let i = 0; i < this.instances.length; i++) this.release(i);
  }
  get(handle: number): AssetInstance {
    const instance = this.instances[handle];
    if (!Number.isInteger(handle) || !instance) throw new RangeError('Unknown paint handle');
    return instance;
  }
}
