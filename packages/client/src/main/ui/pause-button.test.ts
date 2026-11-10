// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { mountPauseButton } from './pause-button';

it('mounts a hidden Pause button outside menu focus that reports taps', () => {
  document.body.replaceChildren();
  const onPause = vi.fn();
  const button = mountPauseButton(document.body, onPause);
  const el = document.getElementById('pause-button') as HTMLButtonElement;
  expect(el.textContent).toBe('Pause');
  expect(el.tabIndex).toBe(-1);
  expect(el.hidden).toBe(true);
  expect(button.visible).toBe(false);
  button.setVisible(true);
  expect(el.hidden).toBe(false);
  el.click();
  expect(onPause).toHaveBeenCalledOnce();
  button.setVisible(false);
  expect(button.visible).toBe(false);
});
