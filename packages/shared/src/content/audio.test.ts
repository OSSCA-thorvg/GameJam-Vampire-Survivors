import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { isAudioEntry, validateManifest } from '../assets';
import { HIT_SFX, MUSIC_IDS, SFX_IDS, SOUND_RULES, WORLD_SFX } from './audio';
import { WEAPONS } from './weapons';

const manifest = validateManifest(
  JSON.parse(readFileSync(new URL('../../../../assets/manifest.json', import.meta.url), 'utf8')),
).manifest;
const audioIds = Object.entries(manifest.assets)
  .filter(([, entry]) => isAudioEntry(entry))
  .map(([id]) => id);

it('lists exactly the manifest audio IDs', () => {
  expect([...SFX_IDS, ...MUSIC_IDS].sort()).toEqual([...audioIds].sort());
  expect(new Set(SFX_IDS).size).toBe(17);
  for (const id of MUSIC_IDS) expect(manifest.assets[id]).toMatchObject({ loop: true });
});

it('fits the world sounds into a 31-bit mask, each once', () => {
  expect(WORLD_SFX.length).toBeLessThanOrEqual(31);
  expect(new Set(WORLD_SFX).size).toBe(WORLD_SFX.length);
  for (const id of WORLD_SFX) expect(SFX_IDS).toContain(id);
});

it('gives every weapon pattern, base and evolved, a hit sound in the mask', () => {
  for (const def of Object.values(WEAPONS)) expect(WORLD_SFX).toContain(HIT_SFX[def.pattern]);
});

it('has a voice rule for every sound effect', () => {
  expect(Object.keys(SOUND_RULES).sort()).toEqual([...SFX_IDS].sort());
  for (const rule of Object.values(SOUND_RULES)) {
    expect(rule.maxVoices).toBeGreaterThanOrEqual(1);
    expect(rule.gain).toBeGreaterThan(0);
    expect(rule.gain).toBeLessThanOrEqual(1);
  }
});
