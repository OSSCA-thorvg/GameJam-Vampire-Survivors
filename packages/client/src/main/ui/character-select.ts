import { formatModifier, WEAPONS, type CharacterDef, type CharacterId } from '@vs/shared';
import type { AssetUrl } from './asset-url';
import { h, type Screen } from './dom';
import './character-select.css';

export interface CharacterSelectProps {
  characters: readonly CharacterDef[];
  selectedId: CharacterId;
  /** Portrait and weapon icon URLs (`loadAssetUrls`); `null` draws a magenta box. */
  assetUrl: AssetUrl;
  onSelect: (id: CharacterId) => void;
  onConfirm: (id: CharacterId) => void;
  onBack: () => void;
}

const NEXT = new Set(['ArrowRight', 'KeyD']);
const PREVIOUS = new Set(['ArrowLeft', 'KeyA']);

function image(url: string | null, cls: string, alt: string): HTMLElement {
  if (url) return h('img', { class: cls, src: url, alt });
  return alt
    ? h('span', { class: `${cls} missing`, role: 'img', 'aria-label': alt })
    : h('span', { class: `${cls} missing`, 'aria-hidden': 'true' });
}

function card(c: CharacterDef, assetUrl: AssetUrl, events: Record<string, () => void>) {
  const weapon = WEAPONS[c.startingWeaponId];
  return h(
    'button',
    {
      type: 'button',
      class: 'character',
      role: 'option',
      'data-character': c.id,
      'aria-selected': 'false',
      'aria-label': c.displayName,
      ...events,
    },
    [
      image(assetUrl(c.portraitId), 'portrait', c.displayName),
      h('strong', { class: 'character-name', text: c.displayName }),
      h('span', { class: 'character-desc', text: c.description }),
      h('span', { class: 'character-weapon', 'data-weapon': weapon.id }, [
        image(assetUrl(weapon.iconId), 'icon', ''),
        h('span', { text: weapon.name }),
      ]),
      h(
        'ul',
        { class: 'character-mods' },
        c.modifiers.map((m) => h('li', { text: formatModifier(m) })),
      ),
    ],
  );
}

/**
 * The character select (#14, ADR 0009): one card per character in a `role="listbox"`, each with its portrait, name,
 * description, starting weapon and formatted modifiers, all from content data and set with `textContent` (ADR 0011).
 * Left/Right or A/D move the selection (wrapping), Enter confirms, Escape goes back; a click selects a card and a
 * double-click confirms it. The selected card is focused and has `aria-selected="true"`.
 */
export function mount(
  root: HTMLElement,
  props: CharacterSelectProps,
): Screen<CharacterSelectProps> {
  const doc = root.ownerDocument;
  let current = props;
  let done = false;
  const index = (): number =>
    Math.max(
      0,
      current.characters.findIndex((c) => c.id === current.selectedId),
    );
  const confirm = (id: CharacterId): void => {
    if (done) return;
    done = true;
    current.onConfirm(id);
  };
  const cards = props.characters.map((c) =>
    card(c, props.assetUrl, {
      'on:click': () => {
        current.onSelect(c.id);
      },
      'on:dblclick': () => {
        confirm(c.id);
      },
      'on:focus': () => {
        current.onSelect(c.id);
      },
    }),
  );
  const el = h('section', { class: 'screen character-select', 'aria-labelledby': 'cs-heading' }, [
    h('h2', { id: 'cs-heading', text: 'Choose your character' }),
    h('div', { class: 'characters', role: 'listbox', 'aria-labelledby': 'cs-heading' }, cards),
    h('p', { class: 'hint', text: 'Left and Right choose, Enter starts, Escape goes back.' }),
  ]);
  const show = (): void => {
    const selected = index();
    cards.forEach((c, i) => {
      c.setAttribute('aria-selected', String(i === selected));
    });
    if (doc.activeElement !== cards[selected]) cards[selected]?.focus();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // Confirmed here, not by the focused card's native activation, so one press is one confirm.
      e.preventDefault();
      confirm(current.selectedId);
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!done) current.onBack();
      return;
    }
    const step = NEXT.has(e.code) ? 1 : PREVIOUS.has(e.code) ? -1 : 0;
    const n = current.characters.length;
    if (step === 0 || n === 0) return;
    e.preventDefault();
    const next = current.characters[(index() + step + n) % n];
    if (next) current.onSelect(next.id);
  };
  doc.addEventListener('keydown', onKey);
  root.append(el);
  show();
  return {
    update(next) {
      current = next;
      show();
    },
    unmount() {
      doc.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
