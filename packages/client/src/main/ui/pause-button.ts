// The touch pause button (#149): Escape for touch. Fixed top-right under the safe-area insets and outside menu focus
// (`tabindex="-1"`), like the corner sound toggle; the CSS shows it only in touch mode.
import { h } from './dom';

export interface PauseButton {
  /** Shown only while a single-player run is being played (not paused, not in a dialog, never in versus). */
  setVisible(visible: boolean): void;
  readonly visible: boolean;
}

export function mountPauseButton(root: HTMLElement, onPause: () => void): PauseButton {
  const el = h('button', {
    id: 'pause-button',
    type: 'button',
    text: 'Pause',
    'aria-label': 'Pause',
    'on:click': () => {
      onPause();
    },
  });
  el.tabIndex = -1;
  el.hidden = true;
  root.append(el);
  return {
    setVisible(visible) {
      el.hidden = !visible;
    },
    get visible() {
      return !el.hidden;
    },
  };
}
