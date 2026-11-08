import type { Scene } from '@thorvg/webcanvas';
import type { DrawableAssetId } from '@vs/shared';
import type { AssetInstance, AssetSource } from '../assets/library';

export { RenderBinding } from './binding';

/**
 * Owns live instances for a layer; release hides them without disposing or unregistering Lottie playback. Acquiring a
 * Lottie instance restarts it at frame 0 when the library can (`AssetLibrary.restart`, #11).
 */
export class PaintPool {
  private readonly instances: AssetInstance[] = [];
  private readonly free: number[] = [];
  private readonly active: boolean[] = [];
  private readonly initialRotations: number[] = [];
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
    private readonly library: AssetSource,
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
    if (
      instance.lottie &&
      !this.library.restart &&
      (!this.library.setPlaybackActive || !this.library.resetPlayback)
    )
      throw new Error('Native pooled assets require reversible playback controls');
    this.library.setPlaybackActive?.(instance, false);
    instance.paint.visible(false);
    this.layer.add(instance.paint);
    this.instances.push(instance);
    this.active.push(false);
    this.initialRotations.push(0);
    this.free.push(handle);
  }
  acquire(duration?: number, initialRotation = 0): number {
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
      throw new RangeError('Invalid event duration');
    if (this.free.length === 0) this.grow();
    const handle = this.free.pop();
    if (handle === undefined) throw new Error('Pool growth did not provide a handle');
    this.active[handle] = true;
    this.initialRotations[handle] = initialRotation;
    const instance = this.get(handle);
    if (this.library.resetPlayback) this.library.resetPlayback(instance);
    else if (instance.lottie) this.library.restart?.(instance);
    if (duration !== undefined) this.library.setPlaybackDuration?.(instance, duration);
    this.library.setPlaybackActive?.(instance, true);
    instance.paint.visible(true);
    return handle;
  }
  rotation(handle: number, gameRotation: number): number {
    return this.get(handle).lottie &&
      (this.id === 'weapon.axe' || this.id === 'weapon.cross' || this.id === 'weapon.heavenSword')
      ? (this.initialRotations[handle] ?? 0)
      : gameRotation;
  }
  release(handle: number): void {
    const instance = this.get(handle);
    if (!this.active[handle]) return;
    instance.paint.visible(false);
    this.library.setPlaybackActive?.(instance, false);
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
