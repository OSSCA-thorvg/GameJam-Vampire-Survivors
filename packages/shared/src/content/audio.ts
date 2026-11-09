// Playback data for the synthesized sounds (#129, ADR 0021): which sounds exist, which the worker cues through its
// bitmask, the per-sound voice rules and the mixer constants. All numbers are initial values, tuned by ear.
import type { AssetId } from '../assets.js';
import type { WeaponPattern } from './weapons.js';

export type SfxId = Extract<AssetId, `sfx.${string}`>;
export type MusicId = Extract<AssetId, `music.${string}`>;

/** The 17 sound effects of #128. */
export const SFX_IDS = [
  'sfx.hitWhip',
  'sfx.hitMagicWand',
  'sfx.hitKnife',
  'sfx.hitAxe',
  'sfx.hitCross',
  'sfx.hitKingBible',
  'sfx.hitFireWand',
  'sfx.hitGarlic',
  'sfx.enemyDeath',
  'sfx.gemPickup',
  'sfx.playerHurt',
  'sfx.levelUp',
  'sfx.chestOpen',
  'sfx.playerDeath',
  'sfx.uiSelect',
  'sfx.interferenceSend',
  'sfx.interferenceReceive',
] as const satisfies readonly SfxId[];

/** The two music loops of #128. */
export const MUSIC_IDS = ['music.title', 'music.stage'] as const satisfies readonly MusicId[];

/**
 * The sounds the worker cues (ADR 0004), in the bit order of its `sfx` mask: bit `i` is `WORLD_SFX[i]`. Append only:
 * the worker and the main thread read the same order, and a reordering swaps sounds with no type error.
 */
export const WORLD_SFX = [
  'sfx.hitWhip',
  'sfx.hitMagicWand',
  'sfx.hitKnife',
  'sfx.hitAxe',
  'sfx.hitCross',
  'sfx.hitKingBible',
  'sfx.hitFireWand',
  'sfx.hitGarlic',
  'sfx.enemyDeath',
  'sfx.gemPickup',
  'sfx.playerHurt',
] as const satisfies readonly SfxId[];
export type WorldSfxId = (typeof WORLD_SFX)[number];

/** The hit sound of each weapon pattern; an evolved weapon shares its base's pattern and so its sound. */
export const HIT_SFX: Record<WeaponPattern, WorldSfxId> = {
  whip: 'sfx.hitWhip',
  magicWand: 'sfx.hitMagicWand',
  knife: 'sfx.hitKnife',
  axe: 'sfx.hitAxe',
  cross: 'sfx.hitCross',
  kingBible: 'sfx.hitKingBible',
  fireWand: 'sfx.hitFireWand',
  garlic: 'sfx.hitGarlic',
};

/** How often one sound may start: at most `maxVoices` at once, `minIntervalMs` apart, at `gain`. */
export interface SoundRule {
  maxVoices: number;
  minIntervalMs: number;
  gain: number;
}

const HIT: SoundRule = { maxVoices: 3, minIntervalMs: 60, gain: 0.5 };
const ONCE: SoundRule = { maxVoices: 1, minIntervalMs: 0, gain: 0.8 };

export const SOUND_RULES: Record<SfxId, SoundRule> = {
  'sfx.hitWhip': HIT,
  'sfx.hitMagicWand': HIT,
  'sfx.hitKnife': HIT,
  'sfx.hitAxe': HIT,
  'sfx.hitCross': HIT,
  'sfx.hitKingBible': HIT,
  'sfx.hitFireWand': HIT,
  'sfx.hitGarlic': { maxVoices: 2, minIntervalMs: 200, gain: 0.35 },
  'sfx.enemyDeath': { maxVoices: 4, minIntervalMs: 40, gain: 0.5 },
  'sfx.gemPickup': { maxVoices: 4, minIntervalMs: 50, gain: 0.4 },
  'sfx.playerHurt': { maxVoices: 1, minIntervalMs: 300, gain: 0.8 },
  'sfx.uiSelect': { maxVoices: 2, minIntervalMs: 40, gain: 0.6 },
  'sfx.levelUp': ONCE,
  'sfx.chestOpen': ONCE,
  'sfx.playerDeath': ONCE,
  'sfx.interferenceSend': ONCE,
  'sfx.interferenceReceive': ONCE,
};

/** The music bus's gain at full music volume, under the effects. */
export const MUSIC_GAIN = 0.6;
/** Live sound-effect voices across all IDs; a start beyond it is dropped. */
export const MAX_VOICES = 24;
/** The music's factor under the pause screen and under the level-up and chest dialogs. */
export const DUCK = { pause: 0.3, dialog: 0.5 } as const;
/** Seconds of each music crossfade. */
export const MUSIC_FADE_SEC = 0.5;

/** The player's sound settings (user decision 2026-11-09): volumes are steps 0–10. */
export interface AudioSettings {
  muted: boolean;
  music: number;
  sfx: number;
}
export const AUDIO_SETTINGS_KEY = 'vs.audio';
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = { muted: false, music: 5, sfx: 7 };
/** The highest volume step. */
export const AUDIO_VOLUME_STEPS = 10;
