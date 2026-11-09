import { NativePlayback } from './playback';
import type { MotionState } from '@vs/shared';
import type { LottieAnimation, Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import {
  ASSET_IDS,
  ASSET_SIZES,
  lottieProfile,
  type AssetEntry,
  type DrawableAssetEntry,
  type DrawableAssetId,
  type ManifestValidation,
} from '@vs/shared';
import {
  createCachedLottie,
  preloadLottie,
  readImageBytes,
  validatePngDecode,
  type CachedLottie,
} from './image-lottie';

export interface AssetInstance {
  paint: Paint;
  offsetX: number;
  offsetY: number;
  lottie?: LottieAnimation;
}
type PlaybackClock = 'simulation' | 'presentation';

export type AssetSource = Pick<AssetLibrary, 'create'> &
  Partial<
    Pick<
      AssetLibrary,
      | 'setPlaybackActive'
      | 'tickPresentation'
      | 'resetPlayback'
      | 'setMotionState'
      | 'setHitFeedback'
      | 'setHitFlash'
      | 'setPlaybackDuration'
      | 'restart'
    >
  >;
interface StaticMaster {
  kind: 'static';
  paint: Paint;
  entry: DrawableAssetEntry;
}
interface AnimatedMaster {
  kind: 'lottie';
  source: CachedLottie;
  entry: DrawableAssetEntry;
  fps: number;
  frames: number;
}
type Master = StaticMaster | AnimatedMaster;

export function isDrawableId(id: string): id is DrawableAssetId {
  return ASSET_IDS.some((known) => known === id) && !id.startsWith('font.');
}

function fallback(
  TVG: ThorVGNamespace,
  id: DrawableAssetId,
  entry?: DrawableAssetEntry,
): StaticMaster {
  const [width, height] = entry?.size ?? ASSET_SIZES[id];
  const scene = new TVG.Scene();
  scene.add(new TVG.Shape().appendRect(0, 0, width, height).fill(255, 0, 255, 255));
  scene.add(
    new TVG.Shape()
      .moveTo(0, 0)
      .lineTo(width * 0.12, 0)
      .lineTo(width, height * 0.88)
      .lineTo(width, height)
      .lineTo(width * 0.88, height)
      .lineTo(0, height * 0.12)
      .close()
      .fill(26, 26, 26, 255),
  );
  return {
    kind: 'static',
    paint: scene,
    entry: entry ?? { file: '', format: 'svg', size: [width, height], anchor: [0.5, 0.5] },
  };
}

async function loadMaster(
  TVG: ThorVGNamespace,
  baseUrl: string,
  entry: DrawableAssetEntry,
  id: DrawableAssetId,
  onResolve: () => void,
): Promise<Master> {
  const response = await fetch(new URL(entry.file, baseUrl));
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  if (entry.format === 'lottie') {
    const json = await response.text();
    const source = await preloadLottie(json, entry.file, baseUrl, lottieProfile(id));
    const animation = createCachedLottie(TVG, source, onResolve, entry.filter ?? 'nearest');
    try {
      const info = animation.info();
      const size = animation.picture?.size();
      if (
        !info ||
        !Number.isFinite(info.totalFrames) ||
        info.totalFrames <= 0 ||
        source.definition.width !== entry.size[0] ||
        source.definition.height !== entry.size[1] ||
        !Number.isFinite(info.fps) ||
        info.fps <= 0 ||
        !Number.isFinite(info.duration) ||
        info.duration <= 0 ||
        !size ||
        !Number.isFinite(size.width) ||
        size.width <= 0 ||
        !Number.isFinite(size.height) ||
        size.height <= 0
      )
        throw new Error('invalid Lottie animation');
      return { kind: 'lottie', source, entry, fps: info.fps, frames: info.totalFrames };
    } finally {
      animation.dispose();
    }
  }
  const picture = new TVG.Picture();
  try {
    if (entry.format === 'svg') {
      const svg = await response.text();
      if (!/<svg(?:\s|>)/i.test(svg)) throw new Error('response is not an SVG');
      picture.load(svg, { type: 'svg' });
    } else if (entry.format === 'png') {
      const bytes = await readImageBytes(response);
      await validatePngDecode(bytes);
      picture.load(bytes, { type: 'png' });
    } else picture.load(new Uint8Array(await response.arrayBuffer()), { type: entry.format });
    const size = picture.size();
    if (size.width <= 0 || size.height <= 0) throw new Error('picture has zero size');
    picture.size(...entry.size);
    if (entry.format === 'png' || entry.format === 'webp')
      picture.filter(
        entry.filter === 'nearest' ? TVG.FilterMethod.Nearest : TVG.FilterMethod.Bilinear,
      );
    return { kind: 'static', paint: picture, entry };
  } catch (error) {
    picture.dispose();
    throw error;
  }
}

export class AssetLibrary {
  private readonly placeholderIds: DrawableAssetId[] = [];
  get placeholders(): readonly DrawableAssetId[] {
    return this.placeholderIds;
  }
  private readonly masters = new Map<DrawableAssetId, Master>();
  private readonly live = new Map<AssetInstance, NativePlayback>();
  private readonly active = new Set<NativePlayback>();
  private readonly presentation = new Set<NativePlayback>();
  private readonly eventClips = new WeakSet<AssetInstance>();
  private created = 0;
  private readonly counters = {
    frameCalls: 0,
    resolverCalls: 0,
    segmentChanges: 0,
    slotApplications: 0,
  };
  private readonly noteResolver = (): void => {
    this.counters.resolverCalls++;
  };
  private constructor(private readonly TVG: ThorVGNamespace) {}

  private baseUrl = '';
  private validated: ManifestValidation | null = null;
  private onProgress: (loaded: number, total: number) => void = () => undefined;
  private loaded = 0;
  private total = 0;
  /** Entries already loaded (or loading) by `loadFirst`; `loadRest` skips them. */
  private readonly started = new Set<string>();

  /** Loads every manifest entry in parallel (#3); the same as `begin` followed by `loadRest`. */
  static async load(
    TVG: ThorVGNamespace,
    baseUrl: string,
    onProgress: (loaded: number, total: number) => void,
    validated: ManifestValidation,
  ): Promise<AssetLibrary> {
    const library = AssetLibrary.begin(TVG, baseUrl, validated, onProgress);
    await library.loadRest();
    return library;
  }

  /** #126: an empty library over the manifest; reports the initial progress (fonts count as loaded). */
  static begin(
    TVG: ThorVGNamespace,
    baseUrl: string,
    validated: ManifestValidation,
    onProgress: (loaded: number, total: number) => void,
  ): AssetLibrary {
    const library = new AssetLibrary(TVG);
    library.baseUrl = baseUrl;
    library.validated = validated;
    library.onProgress = onProgress;
    const entries = Object.values(validated.manifest.assets);
    library.total = entries.length;
    library.loaded = entries.filter((entry) => entry.format === 'ttf').length;
    onProgress(library.loaded, library.total);
    return library;
  }

  private async loadEntry(id: string, entry: AssetEntry): Promise<void> {
    if (entry.format === 'ttf' || !isDrawableId(id) || this.started.has(id)) return;
    this.started.add(id);
    try {
      this.masters.set(id, await loadMaster(this.TVG, this.baseUrl, entry, id, this.noteResolver));
    } catch (error) {
      console.warn(
        `[assets] ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.masters.set(id, fallback(this.TVG, id, entry));
      this.placeholderIds.push(id);
    } finally {
      this.onProgress(++this.loaded, this.total);
    }
  }

  /** #126: loads one entry ahead of the rest (the boot splash); a failure leaves its magenta placeholder. */
  async loadFirst(id: DrawableAssetId): Promise<void> {
    const entry = this.validated?.manifest.assets[id];
    if (entry) await this.loadEntry(id, entry);
  }

  /** Loads every entry `loadFirst` did not, then the fallbacks for catalog IDs without a manifest entry. */
  async loadRest(): Promise<void> {
    const validated = this.validated;
    if (!validated) return;
    await Promise.all(
      Object.entries(validated.manifest.assets).map(([id, entry]) => this.loadEntry(id, entry)),
    );
    const missing = ASSET_IDS.filter(isDrawableId).filter((id) => !this.masters.has(id));
    for (const id of missing) {
      this.masters.set(id, fallback(this.TVG, id));
      this.placeholderIds.push(id);
    }
    const unreported = missing.filter(
      (id) => !validated.errors.some((error) => error.startsWith(id + ':')),
    );
    if (unreported.length) console.warn(`[assets] missing catalog art: ${unreported.join(', ')}`);
    this.placeholderIds.sort();
  }

  /** A Lottie master's native timeline, `null` for a static master or an unknown ID. */
  timeline(id: DrawableAssetId): { fps: number; frames: number } | null {
    const master = this.masters.get(id);
    return master?.kind === 'lottie' ? { fps: master.fps, frames: master.frames } : null;
  }

  create(id: DrawableAssetId): AssetInstance {
    const master = this.masters.get(id);
    if (!master) throw new Error(`Unknown drawable asset ${id}`);
    const { size, anchor } = master.entry;
    const offsetX = -anchor[0] * size[0];
    const offsetY = -anchor[1] * size[1];
    if (master.kind === 'static') return { paint: master.paint.duplicate(), offsetX, offsetY };
    const lottie = createCachedLottie(
      this.TVG,
      master.source,
      this.noteResolver,
      master.entry.filter ?? 'nearest',
    );
    const paint = lottie.picture;
    if (!paint) {
      lottie.dispose();
      throw new Error(`Lottie picture missing: ${id}`);
    }
    paint.size(...size);
    const instance = { paint, offsetX, offsetY, lottie };
    const playback = new NativePlayback({
      animation: lottie,
      fps: master.fps,
      frames: master.frames,
      loop: master.entry.loop !== false,
      motion: master.source.definition.motion,
      counters: this.counters,
    });
    this.created++;
    if (id.startsWith('fx.') || id.startsWith('weapon.')) this.eventClips.add(instance);
    this.live.set(instance, playback);
    this.active.add(playback);
    return instance;
  }

  tick(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('Invalid playback step');
    if (dtSec === 0) return;
    for (const playback of this.active) playback.tick(dtSec);
  }
  /** Advances display-only actors from the visible opponent pane's clock. */
  tickPresentation(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('Invalid playback step');
    if (dtSec === 0) return;
    for (const playback of this.presentation) playback.tick(dtSec);
  }

  setPlaybackActive(
    instance: AssetInstance,
    active: boolean,
    clock: PlaybackClock = 'simulation',
  ): void {
    const playback = this.live.get(instance);
    if (!playback) return;
    playback.setActive(active);
    if (active && clock === 'simulation') this.active.add(playback);
    else this.active.delete(playback);
    if (active && clock === 'presentation') this.presentation.add(playback);
    else this.presentation.delete(playback);
  }
  resetPlayback(instance: AssetInstance): void {
    this.live.get(instance)?.reset();
  }
  setMotionState(instance: AssetInstance, state: MotionState): void {
    this.live.get(instance)?.setMotion(state);
  }
  setHitFeedback(instance: AssetInstance, remaining: number): boolean {
    return this.live.get(instance)?.setFeedback(remaining) ?? false;
  }
  setHitFlash(instance: AssetInstance, shown: boolean): boolean {
    return this.live.get(instance)?.setFlash(shown) ?? false;
  }
  setPlaybackDuration(instance: AssetInstance, duration: number): void {
    const playback = this.live.get(instance);
    if (!playback) return;
    if (!this.eventClips.has(instance))
      throw new Error('Duration fitting requires a flat effect or weapon');
    playback.setDuration(duration);
  }
  motionSnapshot() {
    return {
      created: this.created,
      active: this.active.size + this.presentation.size,
      ...this.counters,
    };
  }
  /** Restarts a Lottie instance's playback at frame 0 (a pooled one-shot effect being reused, #11). */
  restart(instance: AssetInstance): void {
    this.resetPlayback(instance);
  }

  release(instance: AssetInstance): void {
    this.setPlaybackActive(instance, false);
    this.live.delete(instance);
  }
  isPlaceholder(id: DrawableAssetId): boolean {
    return this.placeholders.includes(id);
  }
}
