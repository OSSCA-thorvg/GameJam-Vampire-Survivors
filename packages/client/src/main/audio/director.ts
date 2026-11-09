// The sound director (#129): turns screens, worker messages and gestures into engine calls. It unlocks the engine on
// the first trusted key or pointer gesture (browser autoplay policy), follows the screen with the music and its duck,
// plays the main-thread cues, toggles mute on `M` and suspends the engine while the tab is hidden. In versus it hears
// only this client's own world plus the interference it sends and receives (ADRs 0005, 0018).
import { DUCK, WORLD_SFX, type AudioSettings, type MusicId, type SfxId } from '@vs/shared';
import { assertNever } from '../../protocol/assert-never';
import type { WorkerToMain } from '../../protocol/worker-messages';
import type { AppState } from '../app';
import { isTextField } from '../ui/dom';
import type { AudioEngine } from './engine';
import { saveAudioSettings } from './settings';

/** The boot splash (#126) comes before the app's first state. */
export type SoundScreen = AppState | { name: 'booting' };

/** The worker messages that carry a sound. */
export type SoundMessage = Extract<
  WorkerToMain,
  { type: 'sfx' | 'levelUp' | 'chestOpened' | 'gameOver' | 'interferenceCollected' }
>;

export interface AudioDirector {
  screen(state: SoundScreen): void;
  worker(message: SoundMessage): void;
  cue(id: SfxId): void;
  settings(): AudioSettings;
  setSettings(s: AudioSettings): void;
  /** Calls `fn` after every settings change (the mute key, the toggle, the pause screen). */
  onSettings(fn: (s: AudioSettings) => void): () => void;
}

export interface AudioDirectorOptions {
  engine: AudioEngine;
  doc: Document;
  /** The screens' root: every `button` click under it plays `sfx.uiSelect`. */
  root: HTMLElement;
  initial: AudioSettings;
  save?: (s: AudioSettings) => void;
  /** Whether a gesture may unlock audio; real browsers only trust user input (tests replace it). */
  trusted?: (event: Event) => boolean;
}

/** The music of each screen: the title loop on menus, the stage loop in runs, none on the splash. */
export function musicFor(state: SoundScreen): MusicId | null {
  switch (state.name) {
    case 'booting':
      return null;
    case 'playing':
    case 'levelUp':
    case 'chest':
    case 'versusPlaying':
      return 'music.stage';
    default:
      return 'music.title';
  }
}

/** The music's duck factor: the pause screen, then the level-up and chest dialogs. */
export function duckFor(state: SoundScreen): number {
  if (state.name === 'playing' && state.paused) return DUCK.pause;
  if (state.name === 'levelUp' || state.name === 'chest') return DUCK.dialog;
  if (state.name === 'versusPlaying' && state.overlay !== null) return DUCK.dialog;
  return 1;
}

export function createAudioDirector(opts: AudioDirectorOptions): AudioDirector {
  const { engine, doc, root } = opts;
  const save = opts.save ?? saveAudioSettings;
  const trusted = opts.trusted ?? ((event: Event) => event.isTrusted);
  let settings: AudioSettings = { ...opts.initial };
  const listeners = new Set<(s: AudioSettings) => void>();
  engine.setSettings(settings);

  const setSettings = (s: AudioSettings): void => {
    settings = { muted: s.muted, music: s.music, sfx: s.sfx };
    engine.setSettings(settings);
    save(settings);
    for (const fn of listeners) fn(settings);
  };

  // Every trusted gesture calls `unlock`: the first creates the context, later ones resume one the browser suspended.
  // The capture phase runs it before any screen handles the same key, so the click sound of that key can play.
  const onGesture = (event: Event): void => {
    if (trusted(event)) engine.unlock();
  };
  doc.addEventListener('keydown', onGesture, true);
  doc.addEventListener('pointerdown', onGesture, true);

  doc.addEventListener('keydown', (event) => {
    if (
      event.code !== 'KeyM' ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      isTextField(event.target)
    )
      return;
    setSettings({ ...settings, muted: !settings.muted });
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('button')) engine.play('sfx.uiSelect');
  });

  doc.addEventListener('visibilitychange', () => {
    engine.setHidden(doc.visibilityState === 'hidden');
  });
  if (doc.visibilityState === 'hidden') engine.setHidden(true);

  return {
    screen(state) {
      engine.setDuck(duckFor(state));
      engine.setMusic(musicFor(state));
    },
    worker(message) {
      switch (message.type) {
        case 'sfx':
          for (let i = 0; i < WORLD_SFX.length; i++) {
            const id = WORLD_SFX[i];
            if (id && (message.mask & (1 << i)) !== 0) engine.play(id);
          }
          break;
        case 'levelUp':
          engine.play('sfx.levelUp');
          break;
        case 'chestOpened':
          engine.play('sfx.chestOpen');
          break;
        case 'gameOver':
          if (!message.stats.cleared) engine.play('sfx.playerDeath');
          break;
        case 'interferenceCollected':
          engine.play('sfx.interferenceSend');
          break;
        default:
          assertNever(message);
      }
    },
    cue(id) {
      engine.play(id);
    },
    settings: () => ({ ...settings }),
    setSettings,
    onSettings(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
