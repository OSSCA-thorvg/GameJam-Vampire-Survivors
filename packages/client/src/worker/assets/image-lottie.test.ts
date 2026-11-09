import { Buffer } from 'node:buffer';
import type { AssetResolver, Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectPng, MAX_IMAGE_ENCODED_BYTES } from '@vs/shared';
import { NativePlayback } from './playback';
import { createCachedLottie, preloadLottie, readImageBytes } from './image-lottie';

const bytes = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGGjACGNo3Pn/H5uC6yULsWvckADWy0SpC5hGDWAYDQOGQRAGAw8A6PoGGEpWSQkAAAAASUVORK5CYII=',
    'base64',
  ),
);
const source = (path = 'level-up/art.png') =>
  JSON.stringify({
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 30,
    w: 96,
    h: 96,
    assets: [{ id: 'art', w: 16, h: 16, u: '', p: path }],
    layers: [{ ty: 2, refId: 'art', ks: {} }],
  });
const returned: (boolean | undefined)[] = [];
let nativePath = '/level-up/art.png';
let disposed = 0;
class Picture {
  callback: AssetResolver | null = null;
  resolver(callback: AssetResolver | null) {
    this.callback = callback;
  }
  load = vi.fn();
  filter = vi.fn();
}
class Animation {
  picture = new Picture();
  load() {
    // Emulate the wrapper's dangerous exception=>false fallback behavior.
    let accepted: boolean | undefined;
    try {
      accepted = this.picture.callback?.(new Picture() as unknown as Paint, nativePath);
    } catch {
      accepted = false;
    }
    returned.push(accepted);
  }
  frame(value?: number): number | this {
    if (value === undefined) return 0;
    this.load();
    return this;
  }
  dispose() {
    disposed++;
  }
}
const TVG = {
  Picture,
  LottieAnimation: Animation,
  FilterMethod: { Nearest: 0 },
} as unknown as ThorVGNamespace;

beforeEach(() => {
  returned.length = 0;
  disposed = 0;
  nativePath = '/level-up/art.png';
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const info = inspectPng(new Uint8Array(await blob.arrayBuffer()));
    return { width: info.width, height: info.height, close: vi.fn() };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('preloads one canonical PNG once and reuses only its two exact known aliases for every instance', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(bytes)));
  vi.stubGlobal('fetch', fetch);
  const cached = await preloadLottie(source(), 'fx/level-up.json', 'https://example.test/game/');
  expect(fetch.mock.calls[0]?.[0]).toEqual(
    new URL('https://example.test/game/fx/level-up/art.png'),
  );
  expect(cached.images.get('level-up/art.png')).toBe(cached.images.get('/level-up/art.png'));
  createCachedLottie(TVG, cached);
  nativePath = 'level-up/art.png';
  createCachedLottie(TVG, cached);
  expect(returned).toEqual([true, true]);
  expect(fetch).toHaveBeenCalledOnce();
});

it('returns true for unexpected native sources, then fails after load instead of allowing fallback', () => {
  nativePath = '//evil.test/art.png';
  expect(() => createCachedLottie(TVG, { json: source(), images: new Map() })).toThrow(
    /Unexpected/,
  );
  expect(returned).toEqual([true]);
  expect(disposed).toBe(1);
});

it('catches PNG decoder exceptions inside the resolver and still suppresses native fallback', () => {
  vi.spyOn(Picture.prototype, 'resolver').mockImplementation(function (this: Picture, callback) {
    this.callback = (paint, path) => {
      Object.assign(paint, {
        load: () => {
          throw new Error('native decode failed');
        },
      });
      return callback?.(paint, path) ?? false;
    };
  });
  expect(() =>
    createCachedLottie(TVG, { json: source(), images: new Map([[nativePath, bytes]]) }),
  ).toThrow(/native decode/);
  expect(returned).toEqual([true]);
});

it('rejects invalid resource paths before fetching and malformed PNG bytes before native load', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response('<html>missing</html>')),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    preloadLottie(source('../outside.png'), 'fx/level-up.json', 'https://example.test/'),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    preloadLottie(source(), 'fx/level-up.json', 'https://example.test/'),
  ).rejects.toThrow(/PNG/);
  expect(returned).toEqual([]);
});

it('rejects failed or dimension-mismatched platform decoding before a cache is returned', async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(bytes)));
  vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('decode failed')));
  await expect(
    preloadLottie(source(), 'fx/level-up.json', 'https://example.test/'),
  ).rejects.toThrow(/decode failed/);
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 1, height: 1, close }));
  await expect(
    preloadLottie(source(), 'fx/level-up.json', 'https://example.test/'),
  ).rejects.toThrow(/dimensions/);
  expect(close).toHaveBeenCalledOnce();
});

it('cancels advertised and streamed oversized image bodies', async () => {
  const cancelled = vi.fn();
  const advertised = new Response(new ReadableStream({ cancel: cancelled }), {
    headers: { 'content-length': String(MAX_IMAGE_ENCODED_BYTES + 1) },
  });
  await expect(readImageBytes(advertised)).rejects.toThrow(/budget/);
  expect(cancelled).toHaveBeenCalledOnce();
  const streamed = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_IMAGE_ENCODED_BYTES + 1));
      },
      cancel: cancelled,
    }),
  );
  await expect(readImageBytes(streamed)).rejects.toThrow(/budget/);
  expect(cancelled).toHaveBeenCalledTimes(2);
});

it('suppresses native fallback even when a resolver observer throws', () => {
  expect(() =>
    createCachedLottie(TVG, { json: source(), images: new Map([[nativePath, bytes]]) }, () => {
      throw new Error('observer failed');
    }),
  ).toThrow(/observer failed/);
  expect(returned).toEqual([true]);
});

it('surfaces a later-pose resolver failure from the actual playback adapter without native fallback', () => {
  const animation = createCachedLottie(TVG, {
    json: source(),
    images: new Map([[nativePath, bytes]]),
  });
  const playback = new NativePlayback({
    animation,
    fps: 30,
    frames: 30,
    loop: true,
    motion: null,
    counters: { frameCalls: 0, segmentChanges: 0, slotApplications: 0 },
  });
  nativePath = '//unowned.test/late-pose.png';
  expect(() => {
    playback.tick(1 / 60);
  }).toThrow(/Unexpected Lottie image resolver/);
  expect(returned).toEqual([true, true]);
});
