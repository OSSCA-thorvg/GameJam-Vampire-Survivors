// DOM helpers for the screens (ADR 0009). Text is only ever set with `textContent`, never parsed as markup (ADR 0011).

/** What `h()` accepts: an id, a class, a button type, plain text, a role, `aria-*` and `data-*` attributes, and `on:<event>` listeners. */
export interface Attrs {
  id?: string;
  class?: string;
  /** Set with `textContent`: markup in it is shown as text. */
  text?: string;
  role?: string;
  type?: string;
  [aria: `aria-${string}`]: string | undefined;
  [data: `data-${string}`]: string | undefined;
  [listener: `on:${string}`]: ((event: Event) => void) | undefined;
}

export type Child = Node | string;

/**
 * Builds an element. String children become text nodes; `text` sets `textContent`. Attribute values go through
 * `setAttribute`, so nothing is ever interpreted as HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === 'text') el.textContent = value as string;
    else if (key.startsWith('on:'))
      el.addEventListener(key.slice(3), value as (event: Event) => void);
    else if (['id', 'class', 'role', 'type'].includes(key) || /^(aria|data)-[a-z-]+$/.test(key))
      el.setAttribute(key, value as string);
    else throw new Error(`h(): unsupported attribute '${key}'`);
  }
  for (const child of children)
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return el;
}

/** A mounted screen (ADR 0009): `app.ts` is the only code that mounts and unmounts them. */
export interface Screen<P> {
  update(props: P): void;
  unmount(): void;
}

const NEXT = new Set(['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD']);
const PREVIOUS = new Set(['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA']);

/**
 * Keyboard-first menus (ADR 0009): arrows and WASD move focus between `buttons` (wrapping), Tab moves natively, and
 * Enter activates the focused button, or the first one when focus is elsewhere. Focuses the first button. Returns
 * the function that removes the listener.
 */
export function menuKeys(doc: Document, buttons: readonly HTMLButtonElement[]): () => void {
  const focused = (): number => buttons.findIndex((b) => b === doc.activeElement);
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // A focused button activates itself natively on Enter.
      if (focused() >= 0) return;
      e.preventDefault();
      buttons[0]?.click();
      return;
    }
    const step = NEXT.has(e.code) ? 1 : PREVIOUS.has(e.code) ? -1 : 0;
    if (step === 0 || buttons.length === 0) return;
    e.preventDefault();
    const from = focused();
    const to = from < 0 ? 0 : (from + step + buttons.length) % buttons.length;
    buttons[to]?.focus();
  };
  doc.addEventListener('keydown', onKey);
  buttons[0]?.focus();
  return () => {
    doc.removeEventListener('keydown', onKey);
  };
}
