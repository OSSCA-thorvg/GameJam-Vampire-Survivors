import { afterEach, expect, it, vi } from 'vitest';
import { loadManifest } from './manifest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('fetches and validates one manifest relative to the deployment base', async () => {
  const fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ version: 1, assets: {} }))),
  );
  vi.stubGlobal('fetch', fetch);
  expect((await loadManifest('https://example.test/game/')).errors).toEqual([]);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(new URL('https://example.test/game/manifest.json'));
});
it.each([new Response('html'), new Response('', { status: 404 })])(
  'falls back safely for manifest failures',
  async (response) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', () => Promise.resolve(response));
    expect((await loadManifest('https://example.test/')).manifest.assets).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
  },
);
