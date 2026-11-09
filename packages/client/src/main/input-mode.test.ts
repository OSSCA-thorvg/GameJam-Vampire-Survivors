// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createInputMode } from './input-mode';

const media = (coarse: boolean): Pick<Window, 'matchMedia'> => ({
  matchMedia: (query: string) =>
    ({ matches: query === '(pointer: coarse)' && coarse }) as MediaQueryList,
});

const pointer = (pointerType: string): Event =>
  Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType });
const key = (code: string): Event =>
  Object.assign(new Event('keydown', { bubbles: true }), { code });

describe('createInputMode', () => {
  beforeEach(() => {
    delete document.body.dataset.input;
  });

  it('starts from the coarse-pointer media query and writes body[data-input]', () => {
    expect(createInputMode(document, media(true)).mode).toBe('touch');
    expect(document.body.dataset.input).toBe('touch');
    expect(createInputMode(document, media(false)).mode).toBe('keys');
    expect(document.body.dataset.input).toBe('keys');
  });

  it('switches to touch on a touch pointer and back on a mouse pointer or a movement key', () => {
    const tracker = createInputMode(document, media(false));
    const seen: string[] = [];
    tracker.on((m) => seen.push(m));
    document.body.dispatchEvent(pointer('touch'));
    expect(tracker.mode).toBe('touch');
    expect(document.body.dataset.input).toBe('touch');
    document.body.dispatchEvent(key('KeyQ')); // not a movement key
    document.body.dispatchEvent(pointer('pen')); // pens keep the mode
    expect(tracker.mode).toBe('touch');
    document.body.dispatchEvent(key('ArrowLeft'));
    expect(tracker.mode).toBe('keys');
    document.body.dispatchEvent(pointer('touch'));
    document.body.dispatchEvent(pointer('mouse'));
    expect(document.body.dataset.input).toBe('keys');
    expect(seen).toEqual(['touch', 'keys', 'touch', 'keys']);
  });

  it('calls listeners only on a change and stops after unsubscribe', () => {
    const tracker = createInputMode(document, media(true));
    const seen: string[] = [];
    const off = tracker.on((m) => seen.push(m));
    document.body.dispatchEvent(pointer('touch'));
    expect(seen).toEqual([]);
    off();
    document.body.dispatchEvent(key('KeyD'));
    expect(seen).toEqual([]);
    expect(tracker.mode).toBe('keys');
  });

  it('ignores movement keys typed into a text field', () => {
    const tracker = createInputMode(document, media(true));
    const field = document.createElement('input');
    document.body.append(field);
    field.dispatchEvent(key('KeyA'));
    field.dispatchEvent(key('KeyW'));
    expect(tracker.mode).toBe('touch');
    field.remove();
  });
});
