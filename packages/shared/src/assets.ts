import { ASSET_IDS } from './generated/asset-ids.js';
import { EXTENDED_LOTTIE_IDS } from './lottie-motion.js';
export { ASSET_IDS, ASSET_SIZES } from './generated/asset-ids.js';
export type AssetId = (typeof ASSET_IDS)[number];
export type DrawableAssetId = Exclude<AssetId, `font.${string}`>;
export type DrawableAssetFormat = 'svg' | 'lottie' | 'png' | 'webp';
export type AssetFormat = DrawableAssetFormat | 'ttf';
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
export type AssetEntry = DrawableAssetEntry | FontAssetEntry;
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
  const { file, format, size, anchor, filter, loop } = value;
  if (
    typeof file !== 'string' ||
    !/^[\w.-]+(?:\/[\w.-]+)*\.[a-z]+$/.test(file) ||
    file.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('file must be a relative asset path');
  const extensions: Record<string, string> = {
    svg: 'svg',
    json: 'lottie',
    png: 'png',
    webp: 'webp',
    ttf: 'ttf',
  };
  if (extensions[file.split('.').pop() ?? ''] !== format)
    throw new Error('format does not match extension');
  if ((format === 'ttf') !== id.startsWith('font.')) throw new Error('font namespace requires ttf');
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
