import type { AssetResolver, Paint, ThorVGNamespace } from '@thorvg/webcanvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSET_IDS, inspectPng, validateManifest } from '@vs/shared';
import { AssetLibrary } from './library';
import { Buffer } from 'node:buffer';
const pngBytes = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGGjACGNo3Pn/H5uC6yULsWvckADWy0SpC5hGDWAYDQOGQRAGAw8A6PoGGEpWSQkAAAAASUVORK5CYII=',
    'base64',
  ),
);
const lottieJson = JSON.stringify({ v: '5.7.4', fr: 30, ip: 0, op: 30, w: 96, h: 96, layers: [] });
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
    const info = inspectPng(new Uint8Array(await blob.arrayBuffer()));
    return { width: info.width, height: info.height, close: vi.fn() };
  });
});

const calls = { load: 0, duplicate: 0, filters: [] as number[], animations: 0 };
class FakePaint {
  appendRect() {
    return this;
  }
  fill() {
    return this;
  }
  moveTo() {
    return this;
  }
  lineTo() {
    return this;
  }
  close() {
    return this;
  }
  add() {
    return this;
  }
  duplicate() {
    calls.duplicate++;
    return new FakePaint();
  }
  dispose() {
    /* Fake Paint owns no WASM state. */
  }
}
class FakePicture extends FakePaint {
  resolve: AssetResolver | null = null;
  resolver(callback: AssetResolver | null) {
    this.resolve = callback;
    return this;
  }
  load() {
    calls.load++;
    return this;
  }
  size() {
    return { width: 32, height: 32 };
  }
  filter(method: number) {
    calls.filters.push(method);
    return this;
  }
}
class FakeAnimation {
  picture = new FakePicture();
  current = 0;
  constructor() {
    calls.animations++;
  }
  load(json: string) {
    const data = JSON.parse(json) as { assets?: { p: string }[] };
    for (const asset of data.assets ?? [])
      this.picture.resolve?.(new FakePicture() as unknown as Paint, '/' + asset.p);
    return this;
  }
  info() {
    return { totalFrames: 30, fps: 30, duration: 1 };
  }
  frame(value?: number) {
    if (value !== undefined) this.current = value;
    return this.current;
  }
  dispose() {
    /* Fake animation owns no WASM state. */
  }
}
const TVG = {
  Shape: FakePaint,
  Scene: FakePaint,
  Picture: FakePicture,
  LottieAnimation: FakeAnimation,
  FilterMethod: { Nearest: 0, Bilinear: 1 },
} as unknown as ThorVGNamespace;
const svg = { file: 'enemies/bat.svg', format: 'svg', size: [32, 32], anchor: [0.5, 0.5] };
const manifest = (entries: Record<string, unknown>) =>
  validateManifest({ version: 1, assets: entries });
const fetchOk = () =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>'),
    ),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  calls.load = 0;
  calls.duplicate = 0;
  calls.filters = [];
  calls.animations = 0;
});

describe('AssetLibrary', () => {
  it.each(['svg', 'png', 'webp'])(
    'duplicates 1000 %s instances without fetching or parsing again',
    async (format) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fetch =
        format === 'png'
          ? vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(pngBytes)))
          : fetchOk();
      vi.stubGlobal('fetch', fetch);
      const library = await AssetLibrary.load(
        TVG,
        'https://example.test/game/',
        () => undefined,
        manifest({ 'enemy.bat': { ...svg, file: 'enemies/bat.' + format, format } }),
      );
      expect(calls.load).toBe(1);
      for (let i = 0; i < 1000; i++) library.create('enemy.bat');
      expect(calls.duplicate).toBe(1000);
      expect(calls.load).toBe(1);
      expect(fetch).toHaveBeenCalledOnce();
      expect(library.isPlaceholder('enemy.bat')).toBe(false);
    },
  );
  it('warns once for a failed drawable and creates a usable placeholder', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      () => undefined,
      manifest({ 'enemy.bat': svg }),
    );
    expect(library.isPlaceholder('enemy.bat')).toBe(true);
    expect(
      warn.mock.calls.filter(([message]) => String(message).includes('enemy.bat')),
    ).toHaveLength(1);
    expect(library.create('enemy.bat').offsetX).toBe(-16);
  });
  it('does not fetch fonts and counts their completed attempt in progress', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetch = fetchOk();
    vi.stubGlobal('fetch', fetch);
    const progress = vi.fn();
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      progress,
      manifest({ 'font.hud': { file: 'fonts/hud.ttf', format: 'ttf' } }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(1, 1);
    expect(library.placeholders).toHaveLength(
      ASSET_IDS.filter((id) => !id.startsWith('font.')).length,
    );
    expect(library.placeholders).not.toContain('font.hud');
  });
  it('uses nearest filtering for raster data and clones the cached picture', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(pngBytes)));
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      () => undefined,
      manifest({ 'enemy.bat': { ...svg, file: 'bat.png', format: 'png', filter: 'nearest' } }),
    );
    library.create('enemy.bat');
    expect(calls.filters).toEqual([0]);
    expect(calls.duplicate).toBe(1);
  });
  it('keeps independent Lottie times, wraps loops, holds nonloops and stops released instances', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(lottieJson)));
    vi.stubGlobal('fetch', fetch);
    const entry = {
      file: 'fx/level-up.json',
      format: 'lottie',
      size: [96, 96],
      anchor: [0.5, 0.5],
    };
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      () => undefined,
      manifest({ 'fx.levelUp': entry, 'fx.chestOpen': { ...entry, loop: false } }),
    );
    const first = library.create('fx.levelUp');
    library.tick(0.5);
    const second = library.create('fx.levelUp');
    const held = library.create('fx.chestOpen');
    library.tick(0.75);
    expect(first.lottie?.frame()).toBe(7.5);
    expect(second.lottie?.frame()).toBe(22.5);
    library.release(first);
    library.tick(1);
    expect(first.lottie?.frame()).toBe(7.5);
    expect(held.lottie?.frame()).toBe(29);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('restarts a Lottie instance at frame 0 (#11)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() => Promise.resolve(new Response(lottieJson))),
    );
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      () => undefined,
      manifest({
        'fx.levelUp': {
          file: 'fx/level-up.json',
          format: 'lottie',
          size: [96, 96],
          anchor: [0.5, 0.5],
        },
      }),
    );
    const ring = library.create('fx.levelUp');
    library.tick(0.5);
    expect(ring.lottie?.frame()).toBe(15);
    library.restart(ring);
    expect(ring.lottie?.frame()).toBe(0);
    library.tick(0.1);
    expect(ring.lottie?.frame()).toBeCloseTo(3);
  });
});

it('does not repeat a validation diagnostic in the combined missing warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', fetchOk());
  const library = await AssetLibrary.load(
    TVG,
    'https://example.test/',
    () => undefined,
    manifest({ 'enemy.bat': { ...svg, size: [-1, 32] } }),
  );
  expect(library.isPlaceholder('enemy.bat')).toBe(true);
  expect(warn.mock.calls.some(([message]) => String(message).includes('enemy.bat'))).toBe(false);
});
it.each(['throw', 'zero'])(
  'uses placeholders when Picture.load fails through %s',
  async (failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchOk());
    if (failure === 'throw')
      vi.spyOn(FakePicture.prototype, 'load').mockImplementation(() => {
        throw new Error('invalid picture');
      });
    else vi.spyOn(FakePicture.prototype, 'size').mockReturnValue({ width: 0, height: 0 });
    const library = await AssetLibrary.load(
      TVG,
      'https://example.test/',
      () => undefined,
      manifest({ 'enemy.bat': svg }),
    );
    expect(library.isPlaceholder('enemy.bat')).toBe(true);
  },
);

it('rejects HTML returned with HTTP 200 before invoking Picture.load', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response('<!doctype html><html>missing</html>')),
  );
  const library = await AssetLibrary.load(
    TVG,
    'https://example.test/',
    () => undefined,
    manifest({ 'enemy.bat': svg }),
  );
  expect(library.isPlaceholder('enemy.bat')).toBe(true);
  expect(calls.load).toBe(0);
  expect(warn.mock.calls.filter(([message]) => String(message).includes('enemy.bat'))).toHaveLength(
    1,
  );
});

it.each([
  { totalFrames: Infinity, fps: 30, duration: 1 },
  { totalFrames: 30, fps: NaN, duration: 1 },
  { totalFrames: 30, fps: 30, duration: Infinity },
])('falls back when native Lottie metadata is not finite: %j', async (info) => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(FakeAnimation.prototype, 'info').mockReturnValue(info);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(lottieJson)));
  const library = await AssetLibrary.load(
    TVG,
    'https://example.test/',
    () => undefined,
    manifest({
      'fx.levelUp': {
        file: 'fx/level-up.json',
        format: 'lottie',
        size: [96, 96],
        anchor: [0.5, 0.5],
      },
    }),
  );
  expect(library.isPlaceholder('fx.levelUp')).toBe(true);
  expect(library.create('fx.levelUp').lottie).toBeUndefined();
  expect(() => {
    library.tick(1 / 60);
  }).not.toThrow();
});

it('reuses preloaded image bytes while image-backed instances advance independently', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const json = JSON.stringify({
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 30,
    w: 96,
    h: 96,
    assets: [{ id: 'art', w: 16, h: 16, u: '', p: 'level-up/art.png', e: 0 }],
    layers: [{ ty: 2, refId: 'art', ks: {} }],
  });
  const fetch = vi.fn<typeof globalThis.fetch>((input) =>
    Promise.resolve(
      new Response(
        (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).endsWith('.png')
          ? pngBytes
          : json,
      ),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const library = await AssetLibrary.load(
    TVG,
    'https://example.test/',
    () => undefined,
    manifest({
      'fx.levelUp': {
        file: 'fx/level-up.json',
        format: 'lottie',
        size: [96, 96],
        anchor: [0.5, 0.5],
      },
    }),
  );
  expect(library.isPlaceholder('fx.levelUp')).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  const first = library.create('fx.levelUp');
  library.tick(0.5);
  const second = library.create('fx.levelUp');
  library.tick(0.25);
  expect(first.lottie?.frame()).toBe(22.5);
  expect(second.lottie?.frame()).toBe(7.5);
  expect(first.paint).not.toBe(second.paint);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(calls.filters).toEqual([0, 0, 0]);
});
