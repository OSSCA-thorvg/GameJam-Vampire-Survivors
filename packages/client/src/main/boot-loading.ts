/** Top edge of the held loading text, in logical units of the 720-high view: just under the splash wordmark (#126). */
export const SPLASH_LOADING_TOP = 610;
/** Its font size, in logical units. */
export const SPLASH_LOADING_FONT = 24;

export interface BootLoading {
  progress(loaded: number, total: number): void;
  /** The worker's `splashEnded`: shows the progress, centred under the logo when the animation `played`. */
  splashEnded(played: boolean): void;
  assetsReady(): void;
  /** Places the held text for a canvas `cssHeight` CSS pixels high, centred in the window. */
  place(cssHeight: number): void;
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
    place(cssHeight) {
      el.style.setProperty(
        '--splash-top',
        `calc(50% + ${String(cssHeight * (SPLASH_LOADING_TOP / 720 - 0.5))}px)`,
      );
      el.style.setProperty('--splash-font', `${String((cssHeight * SPLASH_LOADING_FONT) / 720)}px`);
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
