import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSET_IDS, validateManifest } from './assets';
import { parseCatalog } from './catalog';

const assets = new URL('../../../assets/', import.meta.url);
const json: unknown = JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8'));
const bat = { file: 'enemies/bat.svg', format: 'svg', size: [32, 32], anchor: [0.5, 0.5] };
describe('manifest', () => {
  it('accepts real entries and all referenced files exist', () => {
    const result = validateManifest(json);
    expect(result.errors).toEqual([]);
    expect(Object.keys(result.manifest.assets)).toHaveLength(ASSET_IDS.length);
    expect(result.missing).toEqual([]);
    for (const entry of Object.values(result.manifest.assets))
      expect(existsSync(new URL(entry.file, assets))).toBe(true);
  });
  it('anchors stage.ground at its top-left corner, which the ground tiling relies on (#7)', () => {
    const ground = validateManifest(json).manifest.assets['stage.ground'];
    expect(ground && 'anchor' in ground ? ground.anchor : null).toEqual([0, 0]);
  });
  it('generated IDs and sizes match the source catalog exactly', async () => {
    const { renderAssetIds } = await import('../../../scripts/assets-sync.js');
    const rows = parseCatalog(readFileSync(new URL('CATALOG.md', assets), 'utf8'));
    expect(readFileSync(new URL('./generated/asset-ids.ts', import.meta.url), 'utf8')).toBe(
      await renderAssetIds(rows),
    );
    expect(rows.map((row) => row.id).sort()).toEqual([...ASSET_IDS].sort());
  });
  it.each([
    ['enemy.batt', bat],
    ['enemy.bat', { ...bat, format: 'png' }],
    ['enemy.bat', { ...bat, size: [-1, 32] }],
    ['enemy.bat', { ...bat, anchor: [1.5, 0.5] }],
    ['enemy.bat', { ...bat, file: '../bat.svg' }],
    ['enemy.bat', { ...bat, filter: 'nearest' }],
    ['font.hud', { file: 'fonts/hud.ttf', format: 'ttf', size: [1, 1] }],
  ])('rejects invalid entry %s and names its ID', (id, entry) => {
    expect(validateManifest({ version: 1, assets: { [id]: entry } }).errors[0]).toContain(id);
  });
  it('returns missing IDs separately from errors and handles malformed input', () => {
    const result = validateManifest({ version: 1, assets: {} });
    expect(result.errors).toEqual([]);
    expect(result.missing).toEqual(ASSET_IDS);
    expect(validateManifest(null).errors).toHaveLength(1);
    expect(validateManifest({ version: 2, assets: {} }).manifest.assets).toEqual({});
  });
});

it('accepts versioned filenames while keeping paths inside assets', () => {
  expect(
    validateManifest({ version: 1, assets: { 'enemy.bat': { ...bat, file: 'bat.v2.svg' } } })
      .errors,
  ).toEqual([]);
});

describe('bilinear Lottie filtering (ADR 0020)', () => {
  const splash = {
    file: 'ui/splash.json',
    format: 'lottie',
    size: [1920, 1080],
    anchor: [0.5, 0.5],
    loop: false,
  };
  const levelUp = {
    file: 'fx/level-up.json',
    format: 'lottie',
    size: [96, 96],
    anchor: [0.5, 0.5],
  };
  it('accepts bilinear only on the ui.splash Lottie', () => {
    const ok = validateManifest({
      version: 1,
      assets: { 'ui.splash': { ...splash, filter: 'bilinear' } },
    });
    expect(ok.errors).toEqual([]);
    expect(ok.manifest.assets['ui.splash']).toMatchObject({ filter: 'bilinear' });
  });
  it.each([
    ['fx.levelUp', { ...levelUp, filter: 'bilinear' }],
    ['ui.splash', { ...splash, filter: 'linear' }],
  ])('rejects %s with an unsupported filter', (id, entry) => {
    expect(validateManifest({ version: 1, assets: { [id]: entry } }).errors[0]).toContain(
      'invalid raster filter',
    );
  });
});
