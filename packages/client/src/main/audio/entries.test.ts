import { afterEach, expect, it, vi } from 'vitest';
import { loadAudioEntries } from './entries';

const manifest = {
  version: 1,
  assets: {
    'sfx.hitWhip': { file: 'audio/sfx/hit-whip.mp3', format: 'mp3', samples: 6624, loop: false },
    'music.stage': { file: 'audio/music/stage.mp3', format: 'mp3', samples: 3000000, loop: true },
    'enemy.bat': { file: 'enemies/bat.svg', format: 'svg', size: [32, 32], anchor: [0.5, 0.5] },
    // Invalid entries are dropped by the manifest validation.
    'music.title': { file: 'audio/music/title.mp3', format: 'mp3', samples: 10, loop: false },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps only the valid audio entries of the manifest', async () => {
  const entries = await loadAudioEntries('http://localhost/', () => Promise.resolve(manifest));
  expect(Object.keys(entries).sort()).toEqual(['music.stage', 'sfx.hitWhip']);
  expect(entries['music.stage']).toMatchObject({ format: 'mp3', loop: true });
  expect(entries['sfx.hitWhip']?.samples).toBeGreaterThan(0);
});

it('returns no entries and warns once when the manifest fails', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const entries = await loadAudioEntries('http://localhost/', () => Promise.reject(new Error('x')));
  expect(entries).toEqual({});
  expect(warn).toHaveBeenCalledTimes(1);
});
