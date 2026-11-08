/// <reference types="node" />
import { readFileSync } from 'node:fs';
import type { AssetManifest } from '@vs/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_FONT, HUD_FONT, HUD_FONT_NAME, loadHudFont } from './thorvg';

const BASE = 'http://localhost:5173/';
const FONT_URL = 'http://localhost:5173/fonts/hud.ttf';
const manifest: AssetManifest = {
  version: 1,
  assets: { 'font.hud': { file: 'fonts/hud.ttf', format: 'ttf' } },
};
const font = new Uint8Array(
  readFileSync(new URL('../../../../../assets/fonts/hud.ttf', import.meta.url)),
);

function fakeTVG(
  load: (name: string, data: Uint8Array, options?: { type?: string }) => void = () => undefined,
) {
  const calls: { name: string; data: Uint8Array; type: string | undefined }[] = [];
  const TVG = {
    Font: {
      load: (name: string, data: Uint8Array, options?: { type?: string }) => {
        calls.push({ name, data, type: options?.type });
        load(name, data, options);
      },
    },
  } as unknown as Parameters<typeof loadHudFont>[0];
  return { TVG, calls };
}

const okFetch = (bytes: Uint8Array<ArrayBuffer>) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(bytes, { status: 200 })));

describe('loadHudFont', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches fonts/hud.ttf from the asset base, registers it as 'hud' and points HUD_FONT at it", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { TVG, calls } = fakeTVG();
    const fetchFn = okFetch(font);

    await expect(loadHudFont(TVG, BASE, manifest, fetchFn)).resolves.toBe('hud');

    expect(fetchFn).toHaveBeenCalledExactlyOnceWith(FONT_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe(HUD_FONT_NAME);
    expect(calls[0]?.type).toBe('ttf');
    expect(calls[0]?.data).toEqual(font);
    // Live binding: importers of HUD_FONT see the new value.
    expect(HUD_FONT).toBe('hud');
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves the font path against a non-root base URL', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = okFetch(font);
    await loadHudFont(fakeTVG().TVG, 'https://example.test/game/', manifest, fetchFn);
    expect(fetchFn).toHaveBeenCalledExactlyOnceWith('https://example.test/game/fonts/hud.ttf');
  });

  const failures: [string, typeof fetch, (() => void) | undefined][] = [
    [
      'HTML with status 200',
      okFetch(new TextEncoder().encode('<!doctype html><html>missing</html>')),
      undefined,
    ],
    ['invalid font bytes', okFetch(new Uint8Array([1, 2, 3])), undefined],
    [
      'the file is missing (404)',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 404 }))),
      undefined,
    ],
    [
      'fetch rejects (network or CSP)',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
      undefined,
    ],
    [
      'ThorVG rejects the data',
      okFetch(font),
      () => {
        throw new Error('Font.load("hud"): InvalidArguments');
      },
    ],
  ];

  it.each(failures)(
    "falls back to 'default' with exactly one warning when %s",
    async (_label, fetchFn, load) => {
      // Start from a successful load so the test proves the fallback resets HUD_FONT.
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await loadHudFont(fakeTVG().TVG, BASE, manifest, okFetch(font));
      expect(HUD_FONT).toBe('hud');
      vi.restoreAllMocks();

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(loadHudFont(fakeTVG(load).TVG, BASE, manifest, fetchFn)).resolves.toBe(
        FALLBACK_FONT,
      );
      expect(HUD_FONT).toBe('default');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain(FONT_URL);
    },
  );
});

it('resolves the font through a relocated manifest entry', async () => {
  const fetchFn = okFetch(font);
  await loadHudFont(
    fakeTVG().TVG,
    BASE,
    { version: 1, assets: { 'font.hud': { file: 'relocated.ttf', format: 'ttf' } } },
    fetchFn,
  );
  expect(fetchFn).toHaveBeenCalledExactlyOnceWith(BASE + 'relocated.ttf');
});
it('falls back without fetching when font.hud is absent', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const fetchFn = okFetch(font);
  expect(await loadHudFont(fakeTVG().TVG, BASE, { version: 1, assets: {} }, fetchFn)).toBe(
    'default',
  );
  expect(fetchFn).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
