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

it('#149: offers Fullscreen only where the browser supports it, outside the menu keys', () => {
  const enabled = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenEnabled');
  const request = vi.fn(() => Promise.resolve());
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
  mount(document.body, { onStart: vi.fn(), onMultiplayer: vi.fn(), onRecords: vi.fn() });
  expect(document.getElementById('fullscreen')).toBeNull();
  document.body.replaceChildren();
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  document.documentElement.requestFullscreen = request;
  mount(document.body, { onStart: vi.fn(), onMultiplayer: vi.fn(), onRecords: vi.fn() });
  const full = document.getElementById('fullscreen') as HTMLButtonElement;
  expect(full.classList.contains('touch-only')).toBe(true);
  full.click();
  expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' });
  const up = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
  up();
  expect(document.activeElement?.textContent).toBe('Records');
  delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
  if (enabled) Object.defineProperty(Document.prototype, 'fullscreenEnabled', enabled);
});
