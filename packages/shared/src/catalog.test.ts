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
      format: 'png',
    });
    expect(rows.find((row) => row.id === 'font.hud')).toMatchObject({ size: null, format: 'ttf' });
  });
  it('rejects duplicate IDs with a line number', () => {
    expect(() => parseCatalog(catalog.replace('`enemy.ghoul`', '`enemy.bat`'))).toThrow(
      /line \d+:.*duplicate/,
    );
  });
  it('uses the explicit Icons Format column instead of hardcoding SVG', () => {
    expect(
      parseCatalog(
        '## Icons\n| ID | Format | Status |\n| --- | --- | --- |\n| `icon.weapon.whip` | png | final |',
      ),
    ).toEqual([
      { id: 'icon.weapon.whip', size: [32, 32], format: 'png', mass: false, status: 'final' },
    ]);
  });
  it('rejects malformed sizes and missing Size outside icons/fonts', () => {
    expect(() => parseCatalog(catalog.replace('48×48', '-48×48'))).toThrow(/line \d+/);
    expect(() => parseCatalog(catalog.replace('| Size |', '| Unknown |'))).toThrow(/Size/);
  });
  it('reads Sound sections with a Length and the audio naming rule (ADR 0021)', () => {
    const head =
      '## Sound\n| ID | File | Format | Length | Original role | Used by | Status |\n|---|---|---|---|---|---|---|\n';
    expect(
      parseCatalog(
        head +
          '| `sfx.hitMagicWand` | `audio/sfx/hit-magic-wand.mp3` | mp3 | 0.2 s | zap | #129 | final |',
      ),
    ).toEqual([
      { id: 'sfx.hitMagicWand', size: null, format: 'mp3', mass: false, status: 'final' },
    ]);
    expect(parseCatalog(catalog).find((row) => row.id === 'music.stage')).toMatchObject({
      size: null,
    });
    expect(() =>
      parseCatalog(
        head + '| `sfx.hitWhip` | `audio/sfx/whip.mp3` | mp3 | 0.1 s | crack | #129 | final |',
      ),
    ).toThrow(/audio file must be audio\/sfx\/hit-whip\.mp3/);
    expect(() =>
      parseCatalog(
        head + '| `ui.click` | `audio/ui/click.mp3` | mp3 | 0.1 s | click | #129 | final |',
      ),
    ).toThrow(/audio namespace mismatch/);
    expect(() =>
      parseCatalog(
        head + '| `sfx.hitWhip` | `audio/sfx/hit-whip.mp3` | png | 0.1 s | crack | #129 | final |',
      ),
    ).toThrow(/sound requires mp3/);
  });
});
