import { h } from './dom';
import type { AssetUrl } from './asset-url';
import './versus.css';

/** How long one banner shows (#21); the CSS fade (`versus.css`) fits inside it. */
export const BANNER_MS = 3_000;
/** Banners shown at once; a new one beyond it removes the oldest. */
export const MAX_BANNERS = 3;

export interface InterferenceBannerOptions {
  /** Resolves `fx.warning` for the icon; `null` draws no icon. */
  iconUrl: AssetUrl;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

/** The target's notice of an incoming interference (#21, ADR 0005): "<nickname> sent <label>!". */
export interface InterferenceBanner {
  show(nickname: string, label: string): void;
  /** The texts shown now, oldest first (the `banners` snapshot field). */
  texts(): string[];
  unmount(): void;
}

/**
 * Banners at the top centre of the screen (#21). DOM, not ThorVG, because nicknames may hold Hangul, which the HUD
 * font cannot draw (ADR 0013). The server-normalized nickname is set with `textContent` only (ADR 0011).
 */
export function mount(root: HTMLElement, opts: InterferenceBannerOptions): InterferenceBanner {
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    opts.clearTimer ??
    ((id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    });
  const stack = h('div', { class: 'interference-banners', role: 'status', 'aria-live': 'polite' });
  root.append(stack);
  const shown: { el: HTMLElement; text: string; timer: ReturnType<typeof setTimeout> }[] = [];

  const drop = (entry: (typeof shown)[number]): void => {
    const i = shown.indexOf(entry);
    if (i < 0) return;
    shown.splice(i, 1);
    clearTimer(entry.timer);
    entry.el.remove();
  };

  return {
    show(nickname, label) {
      while (shown.length >= MAX_BANNERS) {
        const oldest = shown[0];
        if (!oldest) break;
        drop(oldest);
      }
      const text = `${nickname} sent ${label}!`;
      const src = opts.iconUrl('fx.warning');
      const el = h('p', { class: 'interference-banner' }, [
        ...(src ? [h('img', { src, alt: '' })] : []),
        h('span', { text }),
      ]);
      stack.append(el);
      const entry = {
        el,
        text,
        timer: setTimer(() => {
          drop(entry);
        }, BANNER_MS),
      };
      shown.push(entry);
    },
    texts() {
      return shown.map((e) => e.text);
    },
    unmount() {
      for (const entry of [...shown]) drop(entry);
      stack.remove();
    },
  };
}
