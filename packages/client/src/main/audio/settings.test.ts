import { DEFAULT_AUDIO_SETTINGS } from '@vs/shared';
import { expect, it } from 'vitest';
import { loadAudioSettings, parseAudioSettings, saveAudioSettings, stepVolume } from './settings';

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k) => map.get(k) ?? null,
    key: () => null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

it('defaults to unmuted, music 5 and effects 7', () => {
  expect(DEFAULT_AUDIO_SETTINGS).toEqual({ muted: false, music: 5, sfx: 7 });
  expect(loadAudioSettings(memory)).toEqual(DEFAULT_AUDIO_SETTINGS);
});

it('round-trips the settings under vs.audio', () => {
  const store = memory();
  saveAudioSettings({ muted: true, music: 0, sfx: 10 }, () => store);
  expect(store.getItem('vs.audio')).toBe('{"v":1,"muted":true,"music":0,"sfx":10}');
  expect(loadAudioSettings(() => store)).toEqual({ muted: true, music: 0, sfx: 10 });
});

it('gives the defaults for garbage, wrong versions, out-of-range or oversized values', () => {
  for (const raw of [
    'not json',
    'null',
    '[]',
    '{"v":2,"muted":false,"music":5,"sfx":7}',
    '{"v":1,"muted":"no","music":5,"sfx":7}',
    '{"v":1,"muted":false,"music":11,"sfx":7}',
    '{"v":1,"muted":false,"music":5,"sfx":-1}',
    '{"v":1,"muted":false,"music":2.5,"sfx":7}',
    `{"v":1,"muted":false,"music":5,"sfx":7,"x":"${'a'.repeat(200)}"}`,
  ])
    expect(parseAudioSettings(raw)).toEqual(DEFAULT_AUDIO_SETTINGS);
});

it('survives storage that throws', () => {
  const broken = (): Storage => {
    throw new Error('SecurityError');
  };
  expect(loadAudioSettings(broken)).toEqual(DEFAULT_AUDIO_SETTINGS);
  expect(() => {
    saveAudioSettings({ muted: true, music: 1, sfx: 1 }, broken);
  }).not.toThrow();
});

it('steps volumes within 0..10', () => {
  expect(stepVolume(10, 1)).toBe(10);
  expect(stepVolume(0, -1)).toBe(0);
  expect(stepVolume(5, 1)).toBe(6);
});
