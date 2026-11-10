/** Top edge of the held loading text, in logical units of the 720-high view: just under the splash wordmark (#126). */
export const SPLASH_LOADING_TOP = 610;
/** Its font size, in logical units. */
export const SPLASH_LOADING_FONT = 24;

export interface BootLoading {
  progress(loaded: number, total: number): void;
  /** The worker's `splashEnded`: shows the progress, centred under the logo when the animation `played`. */
  splashEnded(played: boolean): void;
  assetsReady(): void;
  /**
   * Places the held text for a canvas `cssHeight` CSS pixels high, centred in the window, that shows the `visible`
   * part (logical units) of the 720-high view. #171: when the view is cropped (cover fit) the text moves up so that
   * it ends at the visible area's bottom edge at the latest.
   */
  place(cssHeight: number, visible?: { y: number; height: number }): void;
  readonly visible: boolean;
  readonly held: boolean;
  readonly text: string;
}

/**
 * The boot `Loading n/total` line (#126, ADR 0009): hidden while the splash plays, shown when it ends before loading
 * does, removed once the assets are ready. Text is set only through `textContent`.
 */
export function createBootLoading(el: HTMLElement): BootLoading {
  el.hidden = true;
  el.textContent = 'Loading 0/0';
  let done = false;
  let held = false;
  return {
    progress(loaded, total) {
      el.textContent = `Loading ${String(loaded)}/${String(total)}`;
    },
    splashEnded(played) {
      if (done) return;
      el.hidden = false;
      if (played) {
        held = true;
        el.classList.add('splash-hold');
      }
    },
    assetsReady() {
      done = true;
      el.remove();
    },
    place(cssHeight, visible = { y: 0, height: 720 }) {
      // CSS pixels per logical unit; the visible area's centre is the window's centre.
      const unit = cssHeight / visible.height;
      const top = Math.min(SPLASH_LOADING_TOP, visible.y + visible.height - SPLASH_LOADING_FONT);
      el.style.setProperty(
        '--splash-top',
        `calc(50% + ${String(unit * (top - visible.y - visible.height / 2))}px)`,
      );
      el.style.setProperty('--splash-font', `${String(unit * SPLASH_LOADING_FONT)}px`);
    },
    get visible() {
      return !done && !el.hidden;
    },
    get held() {
      return !done && held;
    },
    get text() {
      return el.textContent;
    },
  };
}
