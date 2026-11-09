// @vitest-environment happy-dom
import type { AudioSettings } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import { mount, type PauseProps } from './pause';

function setup(audio: AudioSettings = { muted: false, music: 5, sfx: 7 }) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const changes: AudioSettings[] = [];
  const props: PauseProps = {
    onResume: vi.fn(),
    onQuit: vi.fn(),
    audio,
    onAudio: (s) => changes.push(s),
  };
  const screen = mount(root, props);
  const byText = (text: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
    if (!found) throw new Error(`no button ${text}`);
    return found;
  };
  const value = (kind: string) => root.querySelector(`[data-volume="${kind}"]`)?.textContent;
  return { root, screen, props, changes, byText, value };
}

it('keeps Resume focused first and Quit to title', () => {
  const { byText, props } = setup();
  expect(document.activeElement).toBe(byText('Resume'));
  byText('Quit to title').click();
  expect(props.onQuit).toHaveBeenCalledTimes(1);
});

it('shows the volumes and steps them by 1 within 0..10', () => {
  const { byText, value, changes, screen, props } = setup({ muted: false, music: 10, sfx: 0 });
  expect(value('music')).toBe('10');
  expect(value('sfx')).toBe('0');
  byText('Music +').click();
  byText('Music -').click();
  byText('Effects -').click();
  byText('Effects +').click();
  expect(changes).toEqual([
    { muted: false, music: 10, sfx: 0 },
    { muted: false, music: 9, sfx: 0 },
    { muted: false, music: 10, sfx: 0 },
    { muted: false, music: 10, sfx: 1 },
  ]);
  screen.update({ ...props, audio: { muted: true, music: 3, sfx: 4 } });
  expect(value('music')).toBe('3');
  expect(value('sfx')).toBe('4');
  expect(byText('Sound: off').getAttribute('aria-pressed')).toBe('true');
});

it('toggles mute and moves focus through the sound buttons with the arrows', () => {
  const { byText, changes } = setup();
  byText('Sound: on').click();
  expect(changes.at(-1)).toEqual({ muted: true, music: 5, sfx: 7 });
  for (let i = 0; i < 2; i++)
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(byText('Music -'));
});
