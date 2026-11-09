import { validateActorMotion, type ActorMotion, type LottieProfile } from './lottie-motion.js';
import { MAX_IMAGE_AXIS, MAX_IMAGE_DECODED_BYTES } from './png.js';

export const MAX_LOTTIE_IMAGES = 64;
export const MAX_LOTTIE_DECODED_BYTES = 32 * 1024 * 1024;
/** ADR 0020 (`ui.splash` only): precomposition assets, and root plus precomposition layers together. */
export const MAX_LOTTIE_PRECOMPS = 8;
export const MAX_LOTTIE_LAYERS = 64;
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
  motion: ActorMotion | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function scan(value: unknown, slotOwner: unknown, depth = 0): void {
  if (depth > 32) throw new Error('Lottie nesting exceeds budget');
  if (Array.isArray(value)) {
    for (const child of value) scan(child, slotOwner, depth + 1);
  } else if (record(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'sid' && (value !== slotOwner || child !== 'damage'))
        throw new Error('Arbitrary Lottie slots are forbidden');
      if (key === 'x' && typeof child === 'string')
        throw new Error('Lottie expressions are forbidden');
      if (['fonts', 'chars', 'audio', 'sounds'].includes(key))
        throw new Error('Lottie text/audio resources are forbidden');
      scan(child, slotOwner, depth + 1);
    }
  } else if (typeof value === 'string' && /^(?:[a-z][a-z\d+.-]*:|\/\/|\\)/i.test(value)) {
    throw new Error('Lottie external and embedded resource URLs are forbidden');
  }
}

/**
 * Only shape layers and same-owner image layers are admitted before native code sees the JSON. The `splash` profile
 * (ADR 0020, only `EXTENDED_LOTTIE_IDS`) also admits root precomposition layers over flat precomposition assets and
 * alpha track mattes (`td`/`tt` 1); every other profile behaves exactly as before.
 */
export function validateLottie(
  value: unknown,
  ownerFile: string,
  profile: LottieProfile = 'flat',
): ValidatedLottie {
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
  const extended = profile === 'splash';
  const actor =
    profile === 'flat' || profile === 'splash' ? null : validateActorMotion(value, profile);
  if ((profile === 'flat' || extended) && 'markers' in value)
    throw new Error('Motion markers require an actor profile');
  scan(value, actor?.slotOwner);
  const assets = value.assets ?? [];
  if (!Array.isArray(assets) || assets.length > MAX_LOTTIE_IMAGES)
    throw new Error('Lottie resource count exceeds budget');
  const images: LottieImage[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const precomps = new Map<string, readonly unknown[]>();
  let decodedBytes = 0;
  for (const asset of assets) {
    if (actor && record(asset) && asset.id === 'poses') continue;
    if (extended && record(asset) && 'layers' in asset) {
      if (
        typeof asset.id !== 'string' ||
        !/^[\w-]{1,64}$/.test(asset.id) ||
        ids.has(asset.id) ||
        precomps.has(asset.id) ||
        !Array.isArray(asset.layers) ||
        ['p', 'u', 'e', 'w', 'h'].some((key) => key in asset)
      )
        throw new Error('Invalid Lottie precomposition');
      if (precomps.size >= MAX_LOTTIE_PRECOMPS)
        throw new Error('Lottie precomposition count exceeds budget');
      precomps.set(asset.id, asset.layers);
      continue;
    }
    if (
      actor &&
      record(asset) &&
      Object.keys(asset).some((key) => !['id', 'w', 'h', 'u', 'p', 'e'].includes(key))
    )
      throw new Error('Unexpected actor image field');
    if (
      !record(asset) ||
      typeof asset.id !== 'string' ||
      !/^[\w-]{1,64}$/.test(asset.id) ||
      ids.has(asset.id) ||
      precomps.has(asset.id) ||
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
    if (actor && (asset.w !== value.w * 2 || asset.h !== value.h * 2))
      throw new Error('Actor images require two-times logical dimensions');
    decodedBytes += asset.w * asset.h * 4;
    const budget = !actor ? MAX_LOTTIE_DECODED_BYTES : (profile === 'boss' ? 4 : 1) * 1024 * 1024;
    if (decodedBytes > budget) throw new Error('Lottie decoded resource set exceeds budget');
    ids.add(asset.id);
    paths.add(asset.p);
    images.push({ id: asset.id, path: asset.p, width: asset.w, height: asset.h });
  }
  if (actor && (images.length !== 12 || assets.length !== 13))
    throw new Error('Actor image bank requires exactly twelve owned resources');
  const referenced = new Set<string>();
  const precompUses = new Map<string, number>();
  const checkLayer = (layer: unknown, nested: boolean): void => {
    if (
      !record(layer) ||
      (layer.ty !== 2 && layer.ty !== 4 && !(extended && !nested && layer.ty === 0)) ||
      !record(layer.ks) ||
      'masksProperties' in layer ||
      'tm' in layer ||
      ('tt' in layer && (!extended || layer.tt !== 1)) ||
      ('td' in layer && (!extended || layer.td !== 1))
    )
      throw new Error('Unsupported Lottie layer');
    if (layer.ty === 2) {
      if (typeof layer.refId !== 'string' || !ids.has(layer.refId))
        throw new Error('Unknown Lottie image reference');
      referenced.add(layer.refId);
    } else if (layer.ty === 0) {
      if (
        typeof layer.refId !== 'string' ||
        !precomps.has(layer.refId) ||
        !positive(layer.w) ||
        !Number.isInteger(layer.w) ||
        !positive(layer.h) ||
        !Number.isInteger(layer.h) ||
        layer.w > MAX_IMAGE_AXIS ||
        layer.h > MAX_IMAGE_AXIS ||
        'shapes' in layer
      )
        throw new Error('Invalid Lottie precomposition layer');
      precompUses.set(layer.refId, (precompUses.get(layer.refId) ?? 0) + 1);
    } else if (!Array.isArray(layer.shapes) || 'refId' in layer)
      throw new Error('Invalid Lottie shape layer');
  };
  // Actor profiles validated their own parent precomposition; their bank's image layers are checked here.
  const rootLayers = actor?.layers ?? value.layers;
  let layerCount = rootLayers.length;
  for (const layers of precomps.values()) layerCount += layers.length;
  if (extended && layerCount > MAX_LOTTIE_LAYERS)
    throw new Error('Lottie layer count exceeds budget');
  for (const layer of rootLayers) checkLayer(layer, false);
  for (const layers of precomps.values()) for (const layer of layers) checkLayer(layer, true);
  for (const id of precomps.keys())
    if (precompUses.get(id) !== 1)
      throw new Error('Every Lottie precomposition needs exactly one root layer');
  if (images.some((image) => !referenced.has(image.id)))
    throw new Error('Unused Lottie image resource');
  return {
    images,
    width: value.w,
    height: value.h,
    fps: value.fr,
    firstFrame: value.ip,
    lastFrame: value.op,
    motion: actor?.motion ?? null,
  };
}
