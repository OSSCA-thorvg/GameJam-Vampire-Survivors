import type { LottieAnimation, ThorVGNamespace } from '@thorvg/webcanvas';
import { inspectPng, MAX_IMAGE_ENCODED_BYTES } from '@vs/shared';
import { validateLottie } from '@vs/shared';

export interface CachedLottie {
  json: string;
  images: ReadonlyMap<string, Uint8Array>;
}

/** Bounded reads apply to static PNGs and same-owner Lottie image resources. */
export async function readImageBytes(response: Response): Promise<Uint8Array> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${String(response.status)}`);
  }
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_ENCODED_BYTES) {
    await response.body?.cancel();
    throw new Error('Image encoded byte budget exceeded');
  }
  if (!response.body) throw new Error('Image response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
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
      if (size > MAX_IMAGE_ENCODED_BYTES) throw new Error('Image encoded byte budget exceeded');
      chunks.push(result.value);
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Validate native decoder success before native Lottie can synchronously request any image. */
export async function validatePngDecode(
  bytes: Uint8Array,
  expected?: readonly [number, number],
): Promise<void> {
  const info = inspectPng(bytes, expected);
  const bitmap = await createImageBitmap(
    new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }),
  );
  try {
    if (bitmap.width !== info.width || bitmap.height !== info.height)
      throw new Error('Decoded PNG dimensions do not match its header');
  } finally {
    bitmap.close();
  }
}

export async function preloadLottie(
  json: string,
  ownerFile: string,
  baseUrl: string,
): Promise<CachedLottie> {
  if (json.length > 2 * 1024 * 1024) throw new Error('Lottie JSON exceeds byte budget');
  const value: unknown = JSON.parse(json);
  const validated = validateLottie(value, ownerFile);
  const images = new Map<string, Uint8Array>();
  const ownerUrl = new URL(ownerFile, baseUrl);
  for (const image of validated.images) {
    const bytes = await readImageBytes(await fetch(new URL(image.path, ownerUrl)));
    await validatePngDecode(bytes, [image.width, image.height]);
    images.set(image.path, bytes);
    // ThorVG 1.1.3 prepends one slash to u='' image sources; only this exact known alias is accepted.
    images.set('/' + image.path, bytes);
  }
  return { json, images };
}

/** Returning false (including wrapper-caught throws) permits native fallback; never return false here. */
export function createCachedLottie(TVG: ThorVGNamespace, source: CachedLottie): LottieAnimation {
  const animation = new TVG.LottieAnimation();
  try {
    const picture = animation.picture;
    if (!picture) throw new Error('Lottie picture missing before load');
    let failure: Error | undefined;
    picture.resolver((paint, path) => {
      try {
        const bytes = source.images.get(path);
        if (!bytes || !(paint instanceof TVG.Picture))
          throw new Error('Unexpected Lottie image resolver source');
        paint.load(bytes, { type: 'png' });
        paint.filter(TVG.FilterMethod.Nearest);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
      return true;
    });
    animation.load(source.json);
    if (failure) throw failure;
    return animation;
  } catch (error) {
    animation.dispose();
    throw error;
  }
}
