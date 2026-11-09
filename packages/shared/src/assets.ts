import { ASSET_IDS } from './generated/asset-ids.js';
import { EXTENDED_LOTTIE_IDS } from './lottie-motion.js';
export { ASSET_IDS, ASSET_SIZES } from './generated/asset-ids.js';
export type AssetId = (typeof ASSET_IDS)[number];
/** ADR 0021: synthesized sound effects and music loops, never drawn. */
export type AudioAssetId = Extract<AssetId, `sfx.${string}` | `music.${string}`>;
export type DrawableAssetId = Exclude<
  AssetId,
  `font.${string}` | `sfx.${string}` | `music.${string}`
>;
export type DrawableAssetFormat = 'svg' | 'lottie' | 'png' | 'webp';
export type AssetFormat = DrawableAssetFormat | 'ttf' | 'mp3';
export interface DrawableAssetEntry {
  file: string;
  format: DrawableAssetFormat;
  size: [number, number];
  anchor: [number, number];
  filter?: 'nearest' | 'bilinear';
  loop?: boolean;
}
export interface FontAssetEntry {
  file: string;
  format: 'ttf';
}
/** ADR 0021: mono 44.1 kHz MP3; `samples` is the decoded frame count, `loop` is true exactly for `music.*`. */
export interface AudioAssetEntry {
  file: string;
  format: 'mp3';
  samples: number;
  loop: boolean;
}
export type AssetEntry = DrawableAssetEntry | FontAssetEntry | AudioAssetEntry;
/** ADR 0021: at most 70 s at 44.1 kHz. */
export const MAX_AUDIO_SAMPLES = 70 * 44100;
const AUDIO_NAMESPACE = /^(?:sfx|music)\./;

export function isAudioEntry(entry: AssetEntry): entry is AudioAssetEntry {
  return entry.format === 'mp3';
}
export interface AssetManifest {
  version: 1;
  assets: Record<string, AssetEntry>;
}
export interface ManifestValidation {
  manifest: AssetManifest;
  errors: string[];
  missing: AssetId[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function pair(value: unknown, valid: (n: number) => boolean): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && valid(n))
  );
}
function parseEntry(id: string, value: unknown): AssetEntry {
  if (!record(value)) throw new Error('entry must be an object');
  const { file, format, size, anchor, filter, loop, samples } = value;
  if (
    typeof file !== 'string' ||
    !/^[\w.-]+(?:\/[\w.-]+)*\.[a-z][a-z0-9]*$/.test(file) ||
    file.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('file must be a relative asset path');
  const extensions: Record<string, string> = {
    svg: 'svg',
    json: 'lottie',
    png: 'png',
    webp: 'webp',
    ttf: 'ttf',
    mp3: 'mp3',
  };
  if (extensions[file.split('.').pop() ?? ''] !== format)
    throw new Error('format does not match extension');
  if ((format === 'ttf') !== id.startsWith('font.')) throw new Error('font namespace requires ttf');
  if ((format === 'mp3') !== AUDIO_NAMESPACE.test(id))
    throw new Error('sfx and music namespaces require mp3');
  if (format === 'mp3') {
    if (size !== undefined || anchor !== undefined || filter !== undefined)
      throw new Error('audio has no drawable fields');
    if (typeof samples !== 'number' || !Number.isInteger(samples) || samples < 1)
      throw new Error('audio samples must be a positive integer');
    if (samples > MAX_AUDIO_SAMPLES) throw new Error('audio exceeds 70 s');
    if (loop !== id.startsWith('music.')) throw new Error('loop must be true exactly for music');
    return { file, format, samples, loop };
  }
  if (samples !== undefined) throw new Error('samples belongs to audio only');
  if (format === 'ttf') {
    if (size !== undefined || anchor !== undefined || filter !== undefined || loop !== undefined)
      throw new Error('font has no drawable fields');
    return { file, format };
  }
  if (format !== 'svg' && format !== 'lottie' && format !== 'png' && format !== 'webp')
    throw new Error('unsupported format');
  if (!pair(size, (n) => n > 0)) throw new Error('size requires two positive numbers');
  if (!pair(anchor, (n) => n >= 0 && n <= 1)) throw new Error('anchor must be within 0..1');
  if (
    filter !== undefined &&
    ((format !== 'png' &&
      format !== 'webp' &&
      !(format === 'lottie' && EXTENDED_LOTTIE_IDS.includes(id))) ||
      (filter !== 'nearest' && filter !== 'bilinear'))
  )
    throw new Error('invalid raster filter');
  if (loop !== undefined && (format !== 'lottie' || typeof loop !== 'boolean'))
    throw new Error('invalid Lottie loop');
  return {
    file,
    format,
    size,
    anchor,
    ...(filter === undefined ? {} : { filter }),
    ...(loop === undefined ? {} : { loop }),
  };
}

export function validateManifest(json: unknown): ManifestValidation {
  const manifest: AssetManifest = { version: 1, assets: {} };
  const errors: string[] = [];
  if (!record(json) || json.version !== 1 || !record(json.assets))
    errors.push('manifest: expected version 1 and an assets object');
  else
    for (const [id, value] of Object.entries(json.assets)) {
      try {
        if (!ASSET_IDS.some((known) => known === id)) throw new Error('unknown catalog ID');
        manifest.assets[id] = parseEntry(id, value);
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  return { manifest, errors, missing: ASSET_IDS.filter((id) => !(id in manifest.assets)) };
}
