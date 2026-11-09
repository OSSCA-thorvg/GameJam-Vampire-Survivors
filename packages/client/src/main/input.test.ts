import { beforeEach, describe, expect, it } from 'vitest';
import type { Axis } from '../protocol/worker-messages';
import { createInput, type Input } from './input';

class StubDocument extends EventTarget {
  hidden = false;
}

const key = (type: 'keydown' | 'keyup', code: string): Event => {
  const e = new Event(type, { cancelable: true });
  return Object.assign(e, { code });
};

describe('createInput', () => {
  let doc: StubDocument;
  let win: EventTarget;
  let sent: [Axis, Axis][];
  let input: Input;

  beforeEach(() => {
    doc = new StubDocument();
    win = new EventTarget();
    sent = [];
    input = createInput(doc, win, (dx, dy) => sent.push([dx, dy]));
  });

  it('maps arrows and WASD to directions', () => {
    doc.dispatchEvent(key('keydown', 'KeyD'));
    doc.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(sent).toEqual([
      [1, 0],
      [1, -1],
    ]);
    doc.dispatchEvent(key('keyup', 'KeyD'));
    doc.dispatchEvent(key('keyup', 'ArrowUp'));
    doc.dispatchEvent(key('keydown', 'KeyA'));
    doc.dispatchEvent(key('keydown', 'KeyS'));
    expect(sent.slice(2)).toEqual([
      [0, -1],
      [0, 0],
      [-1, 0],
      [-1, 1],
    ]);
  });

  it('cancels opposing keys', () => {
    doc.dispatchEvent(key('keydown', 'ArrowLeft'));
    doc.dispatchEvent(key('keydown', 'ArrowRight'));
    doc.dispatchEvent(key('keydown', 'KeyW'));
    doc.dispatchEvent(key('keydown', 'KeyS'));
    expect(sent.at(-1)).toEqual([0, 0]);
  });

  it('calls send only when the direction changes', () => {
    doc.dispatchEvent(key('keydown', 'ArrowRight'));
    doc.dispatchEvent(key('keydown', 'ArrowRight')); // key repeat
    doc.dispatchEvent(key('keydown', 'KeyD')); // same direction, second key
    doc.dispatchEvent(key('keydown', 'KeyQ')); // not a movement key
    doc.dispatchEvent(key('keyup', 'ArrowRight')); // KeyD still held
    expect(sent).toEqual([[1, 0]]);
  });

  it('sends (0, 0) on blur and when the tab is hidden', () => {
    doc.dispatchEvent(key('keydown', 'ArrowDown'));
    win.dispatchEvent(new Event('blur'));
    expect(sent).toEqual([
      [0, 1],
      [0, 0],
    ]);
    doc.dispatchEvent(key('keydown', 'KeyA'));
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(sent.slice(2)).toEqual([
      [-1, 0],
      [0, 0],
    ]);
  });

  it('prevents page scrolling for arrow keys only', () => {
    const arrow = key('keydown', 'ArrowUp');
    const letter = key('keydown', 'KeyW');
    doc.dispatchEvent(arrow);
    doc.dispatchEvent(letter);
    expect(arrow.defaultPrevented).toBe(true);
    expect(letter.defaultPrevented).toBe(false);
  });

  it('sends the touch axis only on change, and only while no movement key is held (#149)', () => {
    input.setTouchAxis(1, 0);
    input.setTouchAxis(1, 0);
    input.setTouchAxis(-1, -1);
    expect(sent).toEqual([
      [1, 0],
      [-1, -1],
    ]);
    // A held key wins over the joystick, even when the keys cancel out.
    doc.dispatchEvent(key('keydown', 'KeyS'));
    input.setTouchAxis(1, 1);
    doc.dispatchEvent(key('keydown', 'KeyW'));
    expect(sent.slice(2)).toEqual([
      [0, 1],
      [0, 0],
    ]);
    // Releasing the keys falls back to the joystick's current direction.
    doc.dispatchEvent(key('keyup', 'KeyS'));
    doc.dispatchEvent(key('keyup', 'KeyW'));
    expect(sent.slice(4)).toEqual([
      [0, -1],
      [1, 1],
    ]);
    input.setTouchAxis(0, 0);
    expect(sent.at(-1)).toEqual([0, 0]);
  });

  it('clears the touch axis on blur and when the tab is hidden (#149)', () => {
    input.setTouchAxis(0, 1);
    win.dispatchEvent(new Event('blur'));
    input.setTouchAxis(-1, 0);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(sent).toEqual([
      [0, 1],
      [0, 0],
      [-1, 0],
      [0, 0],
    ]);
  });
});
