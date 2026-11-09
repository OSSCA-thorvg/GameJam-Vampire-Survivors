// The portrait hint (#149): the logical view is a fixed 1280×720 landscape area (ADR 0004), so portrait is not played.
// In touch mode, a portrait window shows a full-screen "rotate" message instead; the text is set with `textContent`.
import { h } from './dom';

/** What the hint needs of `matchMedia('(orientation: portrait)')`. */
export interface OrientationQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface RotateHint {
  /** Re-reads the touch mode and the orientation (call when the input mode changes). */
  refresh(): void;
  readonly shown: boolean;
  unmount(): void;
}

export const ROTATE_TEXT = 'Rotate your device to landscape';

/**
 * Mounts `#rotate-hint` into `root`, shown while `isTouch()` and the portrait query match. `onPortrait` is called each
 * time it appears, so the caller can pause a single-player run (the hidden-tab pause); versus keeps running (ADR 0005).
 */
export function mountRotateHint(
  root: HTMLElement,
  portrait: OrientationQuery,
  isTouch: () => boolean,
  onPortrait: () => void,
): RotateHint {
  const el = h('div', { id: 'rotate-hint', role: 'alert' }, [h('p', { text: ROTATE_TEXT })]);
  el.hidden = true;
  const refresh = (): void => {
    const show = isTouch() && portrait.matches;
    if (show === !el.hidden) return;
    el.hidden = !show;
    if (show) onPortrait();
  };
  portrait.addEventListener('change', refresh);
  root.append(el);
  refresh();
  return {
    refresh,
    get shown() {
      return !el.hidden;
    },
    unmount() {
      portrait.removeEventListener('change', refresh);
      el.remove();
    },
  };
}
