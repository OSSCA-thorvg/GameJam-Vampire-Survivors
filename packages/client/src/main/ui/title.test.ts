// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from './title';

afterEach(() => {
  document.body.replaceChildren();
});

it('shows Start, Multiplayer and Records in order with Start focused, each firing its callback', () => {
  const props = { onStart: vi.fn(), onMultiplayer: vi.fn(), onRecords: vi.fn() };
  mount(document.body, props);
  const buttons = Array.from(document.querySelectorAll('button'));
  expect(buttons.map((b) => b.textContent)).toEqual(['Start', 'Multiplayer', 'Records']);
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0]?.click();
  buttons[1]?.click();
  buttons[2]?.click();
  expect(props.onStart).toHaveBeenCalledTimes(1);
  expect(props.onMultiplayer).toHaveBeenCalledTimes(1);
  expect(props.onRecords).toHaveBeenCalledTimes(1);
});

it('reaches Records with two ArrowDown presses', () => {
  mount(document.body, { onStart: vi.fn(), onMultiplayer: vi.fn(), onRecords: vi.fn() });
  const down = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
  down();
  down();
  expect(document.activeElement?.textContent).toBe('Records');
});
