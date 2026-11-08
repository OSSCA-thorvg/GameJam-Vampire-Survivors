import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from './catalog';
import { ASSET_IDS } from './assets';

const catalog = readFileSync(new URL('../../../assets/CATALOG.md', import.meta.url), 'utf8');
describe('catalog', () => {
  it('expands icons, retains mass metadata and reads fonts without Size', () => {
    const rows = parseCatalog(catalog);
    expect(rows).toHaveLength(ASSET_IDS.length);
    expect(rows.find((row) => row.id === 'enemy.bat')).toMatchObject({
      size: [32, 32],
      mass: true,
    });
    expect(rows.find((row) => row.id === 'icon.weapon.whip')).toMatchObject({
      size: [32, 32],
      format: 'svg',
    });
    expect(rows.find((row) => row.id === 'font.hud')).toMatchObject({ size: null, format: 'ttf' });
  });
  it('rejects duplicate IDs with a line number', () => {
    expect(() => parseCatalog(catalog.replace('`enemy.ghoul`', '`enemy.bat`'))).toThrow(
      /line \d+:.*duplicate/,
    );
  });
  it('rejects malformed sizes and missing Size outside icons/fonts', () => {
    expect(() => parseCatalog(catalog.replace('48×48', '-48×48'))).toThrow(/line \d+/);
    expect(() => parseCatalog(catalog.replace('| Size |', '| Unknown |'))).toThrow(/Size/);
  });
});
