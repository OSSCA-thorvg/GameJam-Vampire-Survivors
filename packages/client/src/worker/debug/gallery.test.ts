import type { ThorVGNamespace } from '@thorvg/webcanvas';
import { ASSET_IDS } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import type { AssetLibrary } from '../assets/library';
import type { ThorVGContext } from '../render/thorvg';
import { buildGallery } from './gallery';

/** A paint whose every method chains, enough for the gallery's scene building. */
function chainable(): object {
  const paint: object = new Proxy(
    {},
    { get: (_target, key) => (key === 'then' ? undefined : () => paint) },
  );
  return paint;
}

it('draws every drawable ID and no audio ID (ADR 0021)', () => {
  const TVG = { Scene: chainable, Shape: chainable, Text: chainable } as unknown as ThorVGNamespace;
  const created: string[] = [];
  const library = {
    create: vi.fn((id: string) => {
      created.push(id);
      return { paint: chainable(), offsetX: 0, offsetY: 0 };
    }),
    setMotionState: vi.fn(),
    setPlaybackActive: vi.fn(),
    resetPlayback: vi.fn(),
  } as unknown as AssetLibrary;
  const gallery = buildGallery({ TVG, root: chainable() } as unknown as ThorVGContext, library);
  const audio = ASSET_IDS.filter((id) => /^(?:sfx|music)\./.test(id));
  expect(audio.length).toBeGreaterThan(0);
  expect(created.filter((id) => audio.some((known) => known === id))).toEqual([]);
  expect(gallery.snapshot().ids.filter((id) => /^(?:sfx|music|font)\./.test(id))).toEqual([]);
  expect([...new Set(created)].sort()).toEqual(
    ASSET_IDS.filter((id) => !/^(?:sfx|music|font)\./.test(id)).sort(),
  );
});
