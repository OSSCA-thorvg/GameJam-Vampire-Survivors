// The synthesized audio pack (ADR 0021, #128): every sfx.* and music.* entry is a committed MP3 in the ADR's format
// and budgets, exactly as `scripts/make-audio.sh` recorded it in docs/assets/audio.receipt.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAudioEntry, validateManifest, type AudioAssetEntry } from './assets';
import { audioFile, parseCatalog } from './catalog';

const root = new URL('../../../', import.meta.url);
const assets = new URL('assets/', root);
const read = (file: string, base = assets): string => readFileSync(new URL(file, base), 'utf8');
const manifest = validateManifest(JSON.parse(read('manifest.json'))).manifest;
const audio = Object.entries(manifest.assets).filter((pair): pair is [string, AudioAssetEntry] =>
  isAudioEntry(pair[1]),
);
interface ReceiptSound {
  file: string;
  samples: number;
  bytes: number;
  pcmSha256: string;
  mp3Sha256: string;
}
const receipt = JSON.parse(read('docs/assets/audio.receipt.json', root)) as {
  tools: { zzfx: { version: string }; zzfxm: { commit: string }; lame: string };
  sounds: Record<string, ReceiptSound>;
};
const sounds = JSON.parse(read('scripts/audio/sounds.json', root)) as {
  sfx: Record<string, unknown>;
  music: Record<string, unknown>;
};
const KIB = 1024;
const RATE = 44100;

describe('audio assets (ADR 0021)', () => {
  it('has the 17 sound effects and 2 music loops of sounds.json, and no splash sound', () => {
    const ids = audio.map(([id]) => id).sort();
    expect(ids.filter((id) => id.startsWith('sfx.'))).toHaveLength(17);
    expect(ids.filter((id) => id.startsWith('music.'))).toHaveLength(2);
    expect([...Object.keys(sounds.sfx), ...Object.keys(sounds.music)].sort()).toEqual(ids);
    expect(Object.keys(receipt.sounds).sort()).toEqual(ids);
    expect(ids).not.toContain('sfx.splash');
    expect(existsSync(new URL('audio/sfx/splash.mp3', assets))).toBe(false);
  });

  it('pins the renderer tools in the receipt', () => {
    expect(receipt.tools.zzfx.version).toBe('1.4.0');
    expect(receipt.tools.zzfxm.commit).toBe('cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe');
    expect(receipt.tools.lame).toBe('3.100');
  });

  it.each(audio)(
    '%s is a mono 44.1 kHz 96 kbps MPEG-1 Layer III file matching the receipt',
    (id, entry) => {
      expect(entry.file).toBe(audioFile(id));
      const bytes = readFileSync(new URL(entry.file, assets));
      // Frame header: sync, MPEG-1, Layer III; bitrate index 7 (96 kbps), 44.1 kHz; channel mode 3 (mono).
      expect(bytes[0]).toBe(0xff);
      expect((bytes[1] ?? 0) & 0xfe).toBe(0xfa);
      expect((bytes[2] ?? 0) >> 4).toBe(7);
      expect(((bytes[2] ?? 0) >> 2) & 3).toBe(0);
      expect((bytes[3] ?? 0) >> 6).toBe(3);
      const sealed = receipt.sounds[id];
      expect(sealed).toMatchObject({
        file: entry.file,
        samples: entry.samples,
        bytes: bytes.length,
      });
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sealed?.mp3Sha256);
      if (id.startsWith('sfx.')) {
        expect(entry.loop).toBe(false);
        expect(entry.samples).toBeLessThanOrEqual(2 * RATE);
        expect(bytes.length).toBeLessThanOrEqual(32 * KIB);
      } else {
        expect(entry.loop).toBe(true);
        expect(entry.samples).toBeLessThanOrEqual(70 * RATE);
        expect(bytes.length).toBeLessThanOrEqual(840 * KIB);
      }
    },
  );

  it('keeps all audio within 2 MiB', () => {
    const total = audio.reduce(
      (sum, [, entry]) => sum + readFileSync(new URL(entry.file, assets)).length,
      0,
    );
    expect(total).toBeLessThanOrEqual(2 * KIB * KIB);
  });

  it('loops music on whole rows of its tempo', () => {
    for (const [id, value] of Object.entries(sounds.music)) {
      const { bpm, song } = value as { bpm: number; song: [unknown, number[][][], number[]] };
      const rows = song[2].reduce((sum, index) => sum + (song[1][index]?.[0]?.length ?? 2) - 2, 0);
      expect(manifest.assets[id], id).toMatchObject({ samples: rows * (((RATE / bpm) * 60) >> 2) });
    }
  });

  it('lists every audio ID in the catalog, inside the audio marker block', () => {
    const catalog = read('CATALOG.md');
    const begin = catalog.indexOf('<!-- audio:begin -->');
    const end = catalog.indexOf('<!-- audio:end -->');
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const inside = parseCatalog(catalog.slice(begin, end));
    expect(inside.map((row) => row.id).sort()).toEqual(audio.map(([id]) => id).sort());
    expect(inside.every((row) => row.format === 'mp3' && row.size === null)).toBe(true);
    const outside = parseCatalog(catalog.slice(0, begin) + catalog.slice(end));
    expect(outside.some((row) => row.format === 'mp3')).toBe(false);
  });
});
