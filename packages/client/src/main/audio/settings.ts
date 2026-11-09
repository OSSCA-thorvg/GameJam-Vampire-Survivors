// The sound settings (#129, user decision 2026-11-09), kept in `localStorage` under `vs.audio`. Storage may be
// unavailable (private mode, disabled storage), so every access is guarded, as in `main/storage.ts`.
import {
  AUDIO_SETTINGS_KEY,
  AUDIO_VOLUME_STEPS,
  DEFAULT_AUDIO_SETTINGS,
  type AudioSettings,
} from '@vs/shared';

/** Longer stored values are not settings this client wrote; they are ignored. */
const STORED_MAX = 128;

const isStep = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= AUDIO_VOLUME_STEPS;

/** The stored settings, or the defaults for anything missing, invalid or oversized. */
export function parseAudioSettings(raw: string | null): AudioSettings {
  if (raw === null || raw.length > STORED_MAX) return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return { ...DEFAULT_AUDIO_SETTINGS };
    const { v, muted, music, sfx } = value as Record<string, unknown>;
    if (v !== 1 || typeof muted !== 'boolean' || !isStep(music) || !isStep(sfx))
      return { ...DEFAULT_AUDIO_SETTINGS };
    return { muted, music, sfx };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function loadAudioSettings(storage: () => Storage = () => localStorage): AudioSettings {
  try {
    return parseAudioSettings(storage().getItem(AUDIO_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(
  s: AudioSettings,
  storage: () => Storage = () => localStorage,
): void {
  try {
    storage().setItem(
      AUDIO_SETTINGS_KEY,
      JSON.stringify({ v: 1, muted: s.muted, music: s.music, sfx: s.sfx }),
    );
  } catch {
    // Best effort.
  }
}

/** One volume step up or down, clamped to 0–10. */
export function stepVolume(value: number, delta: number): number {
  return Math.min(AUDIO_VOLUME_STEPS, Math.max(0, Math.round(value + delta)));
}
