import warningJson from '../../../../../assets/fx/warning.json?raw';
import warningPng from '../../../../../assets/fx/warning/pose-0.png?inline';
import { afterEach, expect, it, vi } from 'vitest';
import { loadAssetUrls } from './asset-url';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const entry = { file: 'icons/weapon-whip.png', format: 'png', size: [32, 32], anchor: [0.5, 0.5] };

it('resolves IDs through the validated manifest against the base URL, and null for IDs without art', async () => {
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          version: 1,
          assets: {
            'icon.weapon.whip': entry,
            'portrait.warden': {
              ...entry,
              file: 'characters/portrait-warden.png',
              size: [128, 128],
            },
            'font.hud': { file: 'fonts/hud.ttf', format: 'ttf' },
            'fx.levelUp': {
              file: 'fx/level-up.json',
              format: 'lottie',
              size: [96, 96],
              anchor: [0.5, 0.5],
            },
            'icon.weapon.knife': { ...entry, file: '../evil.png' },
          },
        }),
      ),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const url = await loadAssetUrls('https://game.test/base/');
  expect(fetch).toHaveBeenCalledOnce();
  expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(
    'https://game.test/base/manifest.json',
  );
  expect(url('icon.weapon.whip')).toBe('https://game.test/base/icons/weapon-whip.png');
  expect(url('portrait.warden')).toBe('https://game.test/base/characters/portrait-warden.png');
  expect(url('font.hud')).toBeNull();
  expect(url('fx.levelUp')).toBeNull();
  expect(url('icon.weapon.knife')).toBeNull();
  expect(url('icon.weapon.axe')).toBeNull();
});

it('resolves every ID to null, with one warning, when the manifest fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
  );
  const url = await loadAssetUrls('https://game.test/');
  expect(url('icon.weapon.whip')).toBeNull();
  expect(warn).toHaveBeenCalledOnce();
});

it('preloads the native warning poster as validated PNG bytes before returning DOM URLs', async () => {
  const fixture = warningFixture();
  const bitmap = { width: 96, height: 96, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve(bitmap)),
  );
  const fetch = warningFetch(fixture);
  vi.stubGlobal('fetch', fetch);
  const url = await loadAssetUrls('https://game.test/base/');
  expect(url('fx.warning')).toMatch(/^data:image\/png;base64,/);
  expect(
    Uint8Array.from(atob(url('fx.warning')?.split(',')[1] ?? ''), (c) => c.charCodeAt(0)),
  ).toEqual(fixture.png);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(fetch.mock.calls.map(([input]) => input.href)).toEqual([
    'https://game.test/base/manifest.json',
    'https://game.test/base/fx/warning.json',
    'https://game.test/base/fx/warning/pose-0.png',
  ]);
  url('fx.warning');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(url('icon.weapon.whip')).toBe('https://game.test/base/icons/weapon-whip.png');
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Invalid fixture object');
  return value;
}
function resource(document: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(document.assets)) throw new Error('Invalid fixture assets');
  return object(document.assets[0]);
}
function warningFixture() {
  const value: unknown = JSON.parse(warningJson);
  return {
    document: object(value),
    png: Uint8Array.from(atob(warningPng.split(',')[1] ?? ''), (c) => c.charCodeAt(0)),
  };
}
function warningFetch(
  fixture: ReturnType<typeof warningFixture>,
  alter?: (url: URL, response: Response) => Response,
) {
  return vi.fn((input: URL) => {
    const path = input.pathname;
    let response: Response;
    if (path.endsWith('manifest.json'))
      response = new Response(
        JSON.stringify({
          version: 1,
          assets: {
            'icon.weapon.whip': entry,
            'fx.warning': {
              file: 'fx/warning.json',
              format: 'lottie',
              size: [48, 48],
              anchor: [0.5, 0.5],
              loop: true,
            },
          },
        }),
      );
    else if (path.endsWith('warning.json'))
      response = new Response(JSON.stringify(fixture.document));
    else response = new Response(Uint8Array.from(fixture.png));
    Object.defineProperty(response, 'url', { value: input.href, configurable: true });
    return Promise.resolve(alter?.(input, response) ?? response);
  });
}

it.each([
  'https://outside.test/a.png',
  '../warning/pose-0.png',
  '/warning/pose-0.png',
  'other/pose-0.png',
])('fails the warning poster closed before fetching an unsafe resource %s', async (path) => {
  const fixture = warningFixture();
  resource(fixture.document).p = path;
  const fetch = warningFetch(fixture);
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const url = await loadAssetUrls('https://game.test/base/');
  expect(url('fx.warning')).toBeNull();
  expect(url('icon.weapon.whip')).toBe('https://game.test/base/icons/weapon-whip.png');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects mismatched PNG dimensions before decoding and preserves other DOM images', async () => {
  const fixture = warningFixture();
  resource(fixture.document).w = 95;
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('fetch', warningFetch(fixture));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const url = await loadAssetUrls('https://game.test/base/');
  expect(url('fx.warning')).toBeNull();
  expect(decode).not.toHaveBeenCalled();
  expect(url('icon.weapon.whip')).toBe('https://game.test/base/icons/weapon-whip.png');
});

it('rejects a PNG decoder failure instead of returning a broken DOM image URL', async () => {
  const fixture = warningFixture();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.reject(new Error('decode rejected'))),
  );
  vi.stubGlobal('fetch', warningFetch(fixture));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  expect((await loadAssetUrls('https://game.test/base/'))('fx.warning')).toBeNull();
});

it.each(['owner', 'image'])(
  'rejects a changed %s response URL despite a fetch implementation following redirects',
  async (target) => {
    const fixture = warningFixture();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetch = warningFetch(fixture, (url, response) => {
      if (
        (target === 'owner' &&
          url.pathname.endsWith('.json') &&
          !url.pathname.endsWith('manifest.json')) ||
        (target === 'image' && url.pathname.endsWith('.png'))
      )
        Object.defineProperty(response, 'url', { value: 'https://outside.test/redirected.png' });
      return response;
    });
    vi.stubGlobal('fetch', fetch);
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const url = await loadAssetUrls('https://game.test/base/');
    expect(url('fx.warning')).toBeNull();
    expect(decode).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(2, new URL('https://game.test/base/fx/warning.json'), {
      redirect: 'error',
    });
    if (target === 'image')
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        new URL('https://game.test/base/fx/warning/pose-0.png'),
        { redirect: 'error' },
      );
  },
);

it.each(['different-size', 'multiple-images', 'invalid-png'])(
  'rejects an unsupported poster contract: %s',
  async (attack) => {
    const fixture = warningFixture();
    if (attack === 'different-size') fixture.document.w = 47;
    if (attack === 'multiple-images') {
      if (!Array.isArray(fixture.document.assets) || !Array.isArray(fixture.document.layers))
        throw new Error('Invalid fixture arrays');
      fixture.document.assets.push({
        ...resource(fixture.document),
        id: 'other',
        p: 'warning/other.png',
      });
      fixture.document.layers.push({ ty: 2, refId: 'other', ks: {} });
    }
    if (attack === 'invalid-png') fixture.png[0] = 0;
    vi.stubGlobal('fetch', warningFetch(fixture));
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const url = await loadAssetUrls('https://game.test/base/');
    expect(url('fx.warning')).toBeNull();
    expect(url('icon.weapon.whip')).toBe('https://game.test/base/icons/weapon-whip.png');
  },
);

it.each(['large-header', 'omitted-header', 'lying-header'])(
  'cancels an oversized composition stream with a %s before consuming the whole response',
  async (mode) => {
    const fixture = warningFixture();
    let produced = 0;
    const cancelled = vi.fn();
    const fetch = warningFetch(fixture, (url, response) => {
      if (!url.pathname.endsWith('/fx/warning.json')) return response;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          produced++;
          controller.enqueue(new Uint8Array(512 * 1024));
          if (produced === 10) controller.close();
        },
        cancel: cancelled,
      });
      const headers =
        mode === 'large-header'
          ? { 'content-length': String(2 * 1024 * 1024 + 1) }
          : mode === 'lying-header'
            ? { 'content-length': '1' }
            : undefined;
      return new Response(body, { headers });
    });
    vi.stubGlobal('fetch', fetch);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const url = await loadAssetUrls('https://game.test/base/');
    expect(url('fx.warning')).toBeNull();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(produced).toBeLessThan(10);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('byte budget'));
  },
);

it('accepts a valid composition exactly at the 2 MiB byte boundary', async () => {
  const fixture = warningFixture();
  const source = JSON.stringify(fixture.document);
  const body = source + ' '.repeat(2 * 1024 * 1024 - new TextEncoder().encode(source).byteLength);
  vi.stubGlobal(
    'fetch',
    warningFetch(fixture, (url, response) =>
      url.pathname.endsWith('/fx/warning.json') ? new Response(body) : response,
    ),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 96, height: 96, close: vi.fn() })),
  );
  const url = await loadAssetUrls('https://game.test/base/');
  expect(url('fx.warning')).toMatch(/^data:image\/png;base64,/);
});
