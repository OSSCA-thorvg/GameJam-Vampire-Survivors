import { MAX_IMAGE_AXIS, MAX_IMAGE_DECODED_BYTES } from './png.js';

export const MAX_LOTTIE_IMAGES = 64;
export const MAX_LOTTIE_DECODED_BYTES = 32 * 1024 * 1024;
export interface LottieImage {
  id: string;
  path: string;
  width: number;
  height: number;
}
export interface ValidatedLottie {
  images: readonly LottieImage[];
  width: number;
  height: number;
  fps: number;
  firstFrame: number;
  lastFrame: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function scan(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('Lottie nesting exceeds budget');
  if (Array.isArray(value)) {
    for (const child of value) scan(child, depth + 1);
  } else if (record(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'x' && typeof child === 'string')
        throw new Error('Lottie expressions are forbidden');
      if (['fonts', 'chars', 'audio', 'sounds'].includes(key))
        throw new Error('Lottie text/audio resources are forbidden');
      scan(child, depth + 1);
    }
  } else if (typeof value === 'string' && /^(?:[a-z][a-z\d+.-]*:|\/\/|\\)/i.test(value)) {
    throw new Error('Lottie external and embedded resource URLs are forbidden');
  }
}

/** Only shape layers and same-owner image layers are admitted before native code sees the JSON. */
export function validateLottie(value: unknown, ownerFile: string): ValidatedLottie {
  if (
    !record(value) ||
    typeof value.v !== 'string' ||
    !positive(value.fr) ||
    !positive(value.w) ||
    !positive(value.h) ||
    value.w > MAX_IMAGE_AXIS ||
    value.h > MAX_IMAGE_AXIS ||
    typeof value.ip !== 'number' ||
    !Number.isFinite(value.ip) ||
    typeof value.op !== 'number' ||
    !Number.isFinite(value.op) ||
    value.op <= value.ip ||
    !Array.isArray(value.layers)
  )
    throw new Error('Invalid Lottie composition');
  const fps = Math.fround(value.fr);
  const first = Math.fround(value.ip);
  const last = Math.fround(value.op);
  const frames = Math.fround(last - first);
  const duration = Math.fround(frames / fps);
  if (
    !Number.isFinite(fps) ||
    fps <= 0 ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    !Number.isFinite(frames) ||
    frames <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error('Lottie timeline is outside the native float range');
  if (value.layers.length > 64) throw new Error('Lottie layer count exceeds budget');
  if (!/^[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(ownerFile))
    throw new Error('Invalid Lottie owner path');
  const stem = ownerFile.split('/').pop()?.slice(0, -5) ?? '';
  scan(value);
  const assets = value.assets ?? [];
  if (!Array.isArray(assets) || assets.length > MAX_LOTTIE_IMAGES)
    throw new Error('Lottie resource count exceeds budget');
  const images: LottieImage[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  let decodedBytes = 0;
  for (const asset of assets) {
    if (
      !record(asset) ||
      typeof asset.id !== 'string' ||
      !/^[\w-]{1,64}$/.test(asset.id) ||
      ids.has(asset.id) ||
      asset.u !== '' ||
      typeof asset.p !== 'string' ||
      !asset.p.startsWith(stem + '/') ||
      !/^[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(asset.p) ||
      paths.has(asset.p) ||
      (asset.e !== undefined && asset.e !== 0) ||
      !positive(asset.w) ||
      !Number.isInteger(asset.w) ||
      !positive(asset.h) ||
      !Number.isInteger(asset.h) ||
      asset.w > MAX_IMAGE_AXIS ||
      asset.h > MAX_IMAGE_AXIS ||
      asset.w * asset.h * 4 > MAX_IMAGE_DECODED_BYTES ||
      'layers' in asset
    )
      throw new Error('Invalid same-owner Lottie image resource');
    decodedBytes += asset.w * asset.h * 4;
    if (decodedBytes > MAX_LOTTIE_DECODED_BYTES)
      throw new Error('Lottie decoded resource set exceeds budget');
    ids.add(asset.id);
    paths.add(asset.p);
    images.push({ id: asset.id, path: asset.p, width: asset.w, height: asset.h });
  }
  const referenced = new Set<string>();
  for (const layer of value.layers) {
    if (
      !record(layer) ||
      (layer.ty !== 2 && layer.ty !== 4) ||
      !record(layer.ks) ||
      'masksProperties' in layer ||
      'tt' in layer
    )
      throw new Error('Unsupported Lottie layer');
    if (layer.ty === 2) {
      if (typeof layer.refId !== 'string' || !ids.has(layer.refId))
        throw new Error('Unknown Lottie image reference');
      referenced.add(layer.refId);
    } else if (!Array.isArray(layer.shapes) || 'refId' in layer)
      throw new Error('Invalid Lottie shape layer');
  }
  if (images.some((image) => !referenced.has(image.id)))
    throw new Error('Unused Lottie image resource');
  return {
    images,
    width: value.w,
    height: value.h,
    fps: value.fr,
    firstFrame: value.ip,
    lastFrame: value.op,
  };
}
