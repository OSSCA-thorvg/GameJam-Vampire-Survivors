import type { AudioSettings } from '@vs/shared';
import { stepVolume } from '../audio/settings';
import { h, menuKeys, type Attrs, type Screen } from './dom';

export interface PauseProps {
  onResume: () => void;
  onQuit: () => void;
  /** #129: the sound settings shown and stepped here; `onAudio` receives the changed settings. */
  audio: AudioSettings;
  onAudio: (s: AudioSettings) => void;
}

export const soundLabel = (muted: boolean): string => (muted ? 'Sound: off' : 'Sound: on');

/**
 * The pause overlay (#9), shown on Escape and when the tab was hidden: "Resume" (focused) and "Quit to title", then
 * the sound settings (#129): music and effects volume from 0 to 10, and mute. Escape resumes; `app.ts` handles that
 * key, since it toggles the pause from either side.
 */
export function mount(root: HTMLElement, props: PauseProps): Screen<PauseProps> {
  let current = props;
  const button = (text: string, onClick: () => void, attrs: Attrs = {}) =>
    h('button', { type: 'button', text, ...attrs, 'on:click': onClick });
  const change = (patch: Partial<AudioSettings>): void => {
    current.onAudio({ ...current.audio, ...patch });
  };
  const resume = button('Resume', () => {
    current.onResume();
  });
  const quit = button('Quit to title', () => {
    current.onQuit();
  });
  const musicValue = h('span', { class: 'volume-value', 'data-volume': 'music' });
  const sfxValue = h('span', { class: 'volume-value', 'data-volume': 'sfx' });
  const musicDown = button('Music -', () => {
    change({ music: stepVolume(current.audio.music, -1) });
  });
  const musicUp = button('Music +', () => {
    change({ music: stepVolume(current.audio.music, 1) });
  });
  const sfxDown = button('Effects -', () => {
    change({ sfx: stepVolume(current.audio.sfx, -1) });
  });
  const sfxUp = button('Effects +', () => {
    change({ sfx: stepVolume(current.audio.sfx, 1) });
  });
  const sound = button(
    '',
    () => {
      change({ muted: !current.audio.muted });
    },
    { 'data-sound': 'pause' },
  );
  const render = (): void => {
    musicValue.textContent = String(current.audio.music);
    sfxValue.textContent = String(current.audio.sfx);
    sound.textContent = soundLabel(current.audio.muted);
    sound.setAttribute('aria-pressed', String(current.audio.muted));
  };
  render();
  const el = h('section', { class: 'screen overlay', role: 'dialog', 'aria-label': 'Paused' }, [
    h('h2', { text: 'Paused' }),
    h('div', { class: 'menu' }, [resume, quit]),
    h('div', { class: 'sound-settings', role: 'group', 'aria-label': 'Sound' }, [
      h('div', { class: 'volume-row' }, [
        h('span', { text: 'Music' }),
        musicDown,
        musicValue,
        musicUp,
      ]),
      h('div', { class: 'volume-row' }, [h('span', { text: 'Effects' }), sfxDown, sfxValue, sfxUp]),
      sound,
    ]),
  ]);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [
    resume,
    quit,
    musicDown,
    musicUp,
    sfxDown,
    sfxUp,
    sound,
  ]);
  return {
    update(next) {
      current = next;
      render();
    },
    unmount() {
      removeKeys();
      el.remove();
    },
  };
}
