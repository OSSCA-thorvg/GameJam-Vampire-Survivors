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
