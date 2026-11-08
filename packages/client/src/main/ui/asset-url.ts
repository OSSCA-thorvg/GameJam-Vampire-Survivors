import {
  lottieProfile,
  validateLottie,
  validateManifest,
  type AssetId,
  type DrawableAssetEntry,
} from '@vs/shared';
import { readImageBytes, validatePngDecode } from '../../worker/assets/image-lottie';

/** Resolves a drawable DOM image ID to its URL, or null when no supported image is available. */
export type AssetUrl = (id: AssetId) => string | null;

/** The same composition byte budget used by the cached native Lottie loader. */
const MAX_POSTER_JSON_BYTES = 2 * 1024 * 1024;

/** The poster never follows redirects or accepts a response from a different resource. */
async function posterResponse(url: URL): Promise<Response> {
  const response = await fetch(url, { redirect: 'error' });
  if (response.redirected || (response.url !== '' && response.url !== url.href)) {
    await response.body?.cancel();
    throw new Error('Poster response changed its validated resource URL');
  }
  return response;
}

/** Enforces the composition budget while receiving bytes, before JSON parsing. */
async function posterJson(response: Response): Promise<unknown> {
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_POSTER_JSON_BYTES) {
    await response.body?.cancel();
    throw new Error('Poster composition HTTP error or byte budget exceeded');
  }
  if (!response.body) throw new Error('Poster composition has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  let completed = false;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        completed = true;
        break;
      }
      size += result.value.byteLength;
      if (size > MAX_POSTER_JSON_BYTES) throw new Error('Poster composition byte budget exceeded');
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return JSON.parse(chunks.join('') + decoder.decode());
}

/** The warning is the one native asset also used as a static DOM icon (#21). */
async function warningPoster(entry: DrawableAssetEntry, baseUrl: string): Promise<string | null> {
  try {
    const owner = new URL(entry.file, baseUrl);
    const value = await posterJson(await posterResponse(owner));
    const definition = validateLottie(value, entry.file, lottieProfile('fx.warning'));
    // A multi-image animation needs an explicit poster contract instead of an arbitrary pose choice.
    const [image] = definition.images;
    if (
      definition.images.length !== 1 ||
      !image ||
      definition.width !== entry.size[0] ||
      definition.height !== entry.size[1]
    )
      throw new Error('Warning poster requires one owned image and matching logical size');
    const bytes = await readImageBytes(await posterResponse(new URL(image.path, owner)));
    await validatePngDecode(bytes, [image.width, image.height]);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (error) {
    console.warn(
      `[assets] warning poster failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Validates the DOM manifest once. PNG/SVG URLs are unchanged; the warning's validated PNG is eagerly cached before
 * publishing its DOM resolver, so showing a supported poster needs no HTTP asset fetch. Other native assets are not DOM images.
 */
export async function loadAssetUrls(baseUrl: string): Promise<AssetUrl> {
  try {
    const response = await fetch(new URL('manifest.json', baseUrl));
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const { manifest } = validateManifest(await response.json());
    const warning = manifest.assets['fx.warning'];
    const poster = warning?.format === 'lottie' ? await warningPoster(warning, baseUrl) : null;
    return (id) => {
      const entry = manifest.assets[id];
      if (entry?.format === 'lottie') return id === 'fx.warning' ? poster : null;
      return entry?.format === 'png' || entry?.format === 'svg'
        ? new URL(entry.file, baseUrl).href
        : null;
    };
  } catch (error) {
    console.warn(
      `[assets] icon manifest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return () => null;
  }
}
