import type { LottieAnimation, Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import {
  ASSET_IDS,
  ASSET_SIZES,
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
interface Playback {
  animation: LottieAnimation;
  time: number;
  fps: number;
  frames: number;
  loop: boolean;
}

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
): Promise<Master> {
  const response = await fetch(new URL(entry.file, baseUrl));
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  if (entry.format === 'lottie') {
    const json = await response.text();
    const source = await preloadLottie(json, entry.file, baseUrl);
    const animation = createCachedLottie(TVG, source);
    try {
      const info = animation.info();
      const size = animation.picture?.size();
      if (
        !info ||
        !Number.isFinite(info.totalFrames) ||
        info.totalFrames <= 0 ||
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
  private readonly live = new Map<AssetInstance, Playback>();
  private constructor(private readonly TVG: ThorVGNamespace) {}

  static async load(
    TVG: ThorVGNamespace,
    baseUrl: string,
    onProgress: (loaded: number, total: number) => void,
    validated: ManifestValidation,
  ): Promise<AssetLibrary> {
    const library = new AssetLibrary(TVG);
    const entries = Object.entries(validated.manifest.assets);
    const total = entries.length;
    let loaded = entries.filter(([, entry]) => entry.format === 'ttf').length;
    onProgress(loaded, total);
    await Promise.all(
      entries.map(async ([id, entry]) => {
        if (entry.format === 'ttf' || !isDrawableId(id)) return;
        try {
          library.masters.set(id, await loadMaster(TVG, baseUrl, entry));
        } catch (error) {
          console.warn(
            `[assets] ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          library.masters.set(id, fallback(TVG, id, entry));
          library.placeholderIds.push(id);
        } finally {
          onProgress(++loaded, total);
        }
      }),
    );
    const missing = ASSET_IDS.filter(isDrawableId).filter((id) => !library.masters.has(id));
    for (const id of missing) {
      library.masters.set(id, fallback(TVG, id));
      library.placeholderIds.push(id);
    }
    const unreported = missing.filter(
      (id) => !validated.errors.some((error) => error.startsWith(id + ':')),
    );
    if (unreported.length) console.warn(`[assets] missing catalog art: ${unreported.join(', ')}`);
    library.placeholderIds.sort();
    return library;
  }

  create(id: DrawableAssetId): AssetInstance {
    const master = this.masters.get(id);
    if (!master) throw new Error(`Unknown drawable asset ${id}`);
    const { size, anchor } = master.entry;
    const offsetX = -anchor[0] * size[0];
    const offsetY = -anchor[1] * size[1];
    if (master.kind === 'static') return { paint: master.paint.duplicate(), offsetX, offsetY };
    const lottie = createCachedLottie(this.TVG, master.source);
    const paint = lottie.picture;
    if (!paint) {
      lottie.dispose();
      throw new Error(`Lottie picture missing: ${id}`);
    }
    paint.size(...size);
    const instance = { paint, offsetX, offsetY, lottie };
    this.live.set(instance, {
      animation: lottie,
      time: 0,
      fps: master.fps,
      frames: master.frames,
      loop: master.entry.loop !== false,
    });
    return instance;
  }

  tick(dtSec: number): void {
    for (const playback of this.live.values()) {
      playback.time += dtSec;
      const frame = playback.time * playback.fps;
      playback.animation.frame(
        playback.loop ? frame % playback.frames : Math.min(frame, Math.max(0, playback.frames - 1)),
      );
    }
  }
  /** Restarts a Lottie instance's playback at frame 0 (a pooled one-shot effect being reused, #11). */
  restart(instance: AssetInstance): void {
    const playback = this.live.get(instance);
    if (!playback) return;
    playback.time = 0;
    playback.animation.frame(0);
  }
  release(instance: AssetInstance): void {
    this.live.delete(instance);
  }
  isPlaceholder(id: DrawableAssetId): boolean {
    return this.placeholders.includes(id);
  }
}
