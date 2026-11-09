// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { mountRotateHint, ROTATE_TEXT, type OrientationQuery } from './rotate-hint';

class FakeQuery implements OrientationQuery {
  matches = false;
  private listeners = new Set<() => void>();
  addEventListener(_: 'change', fn: () => void): void {
    this.listeners.add(fn);
  }
  removeEventListener(_: 'change', fn: () => void): void {
    this.listeners.delete(fn);
  }
  set(matches: boolean): void {
    this.matches = matches;
    for (const fn of this.listeners) fn();
  }
}

beforeEach(() => {
  document.body.replaceChildren();
});

it('shows the hint in touch mode while portrait, calling onPortrait each time it appears', () => {
  const query = new FakeQuery();
  let touch = true;
  const onPortrait = vi.fn();
  const hint = mountRotateHint(document.body, query, () => touch, onPortrait);
  const el = document.getElementById('rotate-hint') as HTMLDivElement;
  expect(el.textContent).toBe(ROTATE_TEXT);
  expect(el.hidden).toBe(true);
  query.set(true);
  expect(hint.shown).toBe(true);
  expect(el.hidden).toBe(false);
  query.set(true);
  expect(onPortrait).toHaveBeenCalledOnce();
  query.set(false);
  expect(hint.shown).toBe(false);
  query.set(true);
  expect(onPortrait).toHaveBeenCalledTimes(2);
  // A keyboard or mouse never sees it, even in a portrait window.
  touch = false;
  hint.refresh();
  expect(hint.shown).toBe(false);
  touch = true;
  hint.refresh();
  expect(hint.shown).toBe(true);
  hint.unmount();
  expect(document.getElementById('rotate-hint')).toBeNull();
  query.set(false);
  expect(onPortrait).toHaveBeenCalledTimes(3);
});

it('starts shown when mounted in portrait on a touch device', () => {
  const query = new FakeQuery();
  query.matches = true;
  const onPortrait = vi.fn();
  const hint = mountRotateHint(document.body, query, () => true, onPortrait);
  expect(hint.shown).toBe(true);
  expect(onPortrait).toHaveBeenCalledOnce();
});
