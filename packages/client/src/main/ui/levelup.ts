import type { LevelUpOption } from '../../protocol/worker-messages';
import type { AssetUrl } from './asset-url';
import { h, menuKeys, type Screen } from './dom';

export interface LevelUpProps {
  /** The level being reached. */
  level: number;
  options: readonly LevelUpOption[];
  /** Icon URLs (`loadAssetUrls`); `null` draws a magenta box. */
  iconUrl: AssetUrl;
  onChoose: (index: number) => void;
}

const DIGITS: Readonly<Record<string, number>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
};

function tagText(option: LevelUpOption): string {
  switch (option.kind) {
    case 'newWeapon':
      return 'NEW';
    case 'upgradeWeapon':
      return `Lv ${String(option.toLevel - 1)} → ${String(option.toLevel)}`;
    case 'heal':
      return `+${String(option.amount)} HP`;
    default: {
      const never: never = option;
      return String(never);
    }
  }
}

function icon(option: LevelUpOption, iconUrl: AssetUrl): HTMLElement {
  const url = option.iconId === null ? null : iconUrl(option.iconId);
  if (url) return h('img', { class: 'icon', src: url, alt: '' });
  return h('span', {
    class: option.kind === 'heal' ? 'icon heal' : 'icon missing',
    'aria-hidden': 'true',
  });
}

function card(
  option: LevelUpOption,
  index: number,
  iconUrl: AssetUrl,
  choose: (i: number) => void,
) {
  const name = option.kind === 'heal' ? 'Heal' : option.name;
  return h(
    'button',
    {
      type: 'button',
      class: 'card',
      'data-option': String(index),
      'data-kind': option.kind,
      'on:click': () => {
        choose(index);
      },
    },
    [
      icon(option, iconUrl),
      h('span', { class: 'card-text' }, [
        h('span', { class: 'card-head' }, [
          h('span', { class: 'card-key', text: String(index + 1) }),
          h('strong', { class: 'card-name', text: name }),
          h('span', { class: 'card-tag', text: tagText(option) }),
        ]),
        h('span', { class: 'card-desc', text: option.description }),
      ]),
    ],
  );
}

/**
 * The level-up choice (#11, ADR 0009): a dialog titled "Level n" with one card per option. Up/Down or W/S move the
 * focus (the first card is focused), Enter chooses the focused card, and 1–3 choose directly. Escape does nothing:
 * a choice is required. Every text comes from content data and is set with `textContent` (ADR 0011).
 */
export function mount(root: HTMLElement, props: LevelUpProps): Screen<LevelUpProps> {
  const doc = root.ownerDocument;
  let current = props;
  let done = false;
  const choose = (index: number): void => {
    if (done || index < 0 || index >= current.options.length) return;
    done = true;
    current.onChoose(index);
  };
  const cards = props.options.map((option, i) => card(option, i, props.iconUrl, choose));
  const el = h(
    'section',
    { class: 'screen overlay levelup', role: 'dialog', 'aria-label': 'Level up' },
    [h('h2', { text: `Level ${String(props.level)}` }), h('div', { class: 'menu cards' }, cards)],
  );
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // Chosen here, not by the button's native activation, so one key press is one choice.
      e.preventDefault();
      const focused = cards.findIndex((c) => c === doc.activeElement);
      choose(focused < 0 ? 0 : focused);
      return;
    }
    const digit = DIGITS[e.code];
    if (digit === undefined) return;
    e.preventDefault();
    choose(digit);
  };
  doc.addEventListener('keydown', onKey);
  root.append(el);
  const removeMenuKeys = menuKeys(doc, cards);
  return {
    update(next) {
      current = next;
    },
    unmount() {
      doc.removeEventListener('keydown', onKey);
      removeMenuKeys();
      el.remove();
    },
  };
}
