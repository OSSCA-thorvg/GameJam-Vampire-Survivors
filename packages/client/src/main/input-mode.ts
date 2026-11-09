// Touch or keyboard (#149): which controls the page shows. The main thread owns input (ADR 0004); the worker never
// learns the mode, it only receives the same `input` axis either way.

import { isTextField } from './ui/dom';

export type InputMode = 'touch' | 'keys';

export interface InputModeTracker {
  readonly mode: InputMode;
  /** Calls `listener` after every change of mode; returns the unsubscribe. */
  on(listener: (mode: InputMode) => void): () => void;
}

/** Keys that switch a touch device back to keyboard controls: the movement keys of `input.ts`. */
const MOVEMENT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

/**
 * Starts in `touch` when the primary pointer is coarse (`(pointer: coarse)`), else in `keys`. A `pointerdown` with
 * `pointerType === 'touch'` switches to `touch`; a movement key (outside a text field) or a mouse `pointerdown` switches
 * to `keys`. Pen pointers keep the mode. Writes the mode to `doc.body.dataset.input`, which the CSS reads to show the touch controls
 * only under `[data-input="touch"]`.
 */
export function createInputMode(doc: Document, win: Pick<Window, 'matchMedia'>): InputModeTracker {
  let mode: InputMode = win.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys';
  const listeners = new Set<(mode: InputMode) => void>();
  doc.body.dataset.input = mode;

  const set = (next: InputMode): void => {
    if (next === mode) return;
    mode = next;
    doc.body.dataset.input = mode;
    for (const fn of listeners) fn(mode);
  };

  // Capture phase: the mode is known before any screen or control handles the same event.
  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') set('touch');
      else if (e.pointerType === 'mouse') set('keys');
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (e) => {
      // Typing a nickname or room code (on a phone's keyboard too) is not a switch to keyboard play.
      if (MOVEMENT_KEYS.has(e.code) && !isTextField(e.target)) set('keys');
    },
    true,
  );

  return {
    get mode() {
      return mode;
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
