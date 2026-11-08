// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { h, menuKeys } from './dom';

it('never interprets markup in text, children or attribute values', () => {
  const markup = '<img src=x onerror="globalThis.pwned=1"><b>bold</b>';
  const el = h('div', { text: markup, 'data-x': markup, 'aria-label': markup });
  expect(el.textContent).toBe(markup);
  expect(el.children).toHaveLength(0);
  expect(el.querySelector('img')).toBeNull();
  expect(el.getAttribute('data-x')).toBe(markup);
  const parent = h('p', {}, [markup, h('span', { text: 'x' })]);
  expect(parent.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(parent.querySelector('img, b')).toBeNull();
  expect((globalThis as { pwned?: number }).pwned).toBeUndefined();
});

it('sets class, role, aria-* and data-* attributes and adds on:<event> listeners', () => {
  const onClick = vi.fn();
  const el = h('button', {
    class: 'a b',
    role: 'menuitem',
    'aria-label': 'Go',
    'data-id': '1',
    'on:click': onClick,
  });
  el.click();
  expect(el.className).toBe('a b');
  expect(el.getAttribute('role')).toBe('menuitem');
  expect(el.getAttribute('aria-label')).toBe('Go');
  expect(el.dataset.id).toBe('1');
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('rejects attributes it does not support, such as event-handler attributes', () => {
  expect(() => h('div', { onclick: 'x' } as never)).toThrow(/unsupported attribute 'onclick'/);
});

it('moves focus with arrows and WASD (wrapping), and stops after the remover runs', () => {
  document.body.replaceChildren();
  const buttons = ['A', 'B', 'C'].map((text) => h('button', { text }));
  document.body.append(...buttons);
  const remove = menuKeys(document, buttons);
  const key = (code: string) => document.dispatchEvent(new KeyboardEvent('keydown', { code }));
  expect(document.activeElement).toBe(buttons[0]);
  key('ArrowDown');
  key('KeyD');
  expect(document.activeElement).toBe(buttons[2]);
  key('ArrowRight');
  expect(document.activeElement).toBe(buttons[0]);
  key('ArrowUp');
  expect(document.activeElement).toBe(buttons[2]);
  key('KeyA');
  expect(document.activeElement).toBe(buttons[1]);
  remove();
  key('ArrowDown');
  expect(document.activeElement).toBe(buttons[1]);
});
