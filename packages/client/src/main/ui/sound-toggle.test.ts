// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { mountSoundToggle } from './sound-toggle';

it('mounts a fixed toggle outside menu focus that reports and shows the mute state', () => {
  document.body.replaceChildren();
  const onToggle = vi.fn();
  const toggle = mountSoundToggle(document.body, { muted: false, onToggle });
  const el = document.getElementById('sound-toggle') as HTMLButtonElement;
  expect(el.textContent).toBe('Sound: on');
  expect(el.tabIndex).toBe(-1);
  expect(el.getAttribute('aria-pressed')).toBe('false');
  el.click();
  expect(onToggle).toHaveBeenCalledTimes(1);
  toggle.update(true);
  expect(el.textContent).toBe('Sound: off');
  expect(el.getAttribute('aria-pressed')).toBe('true');
});
