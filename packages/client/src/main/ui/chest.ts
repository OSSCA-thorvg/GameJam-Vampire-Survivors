import { PASSIVES, WEAPONS, type AssetId, type ChestReward, type WeaponId } from '@vs/shared';
import type { AssetUrl } from './asset-url';
import { h, type Screen } from './dom';

export interface ChestProps {
  rewards: readonly ChestReward[];
  /** Icon URLs (`loadAssetUrls`); `null` draws a magenta box. */
  iconUrl: AssetUrl;
  /** Called once, by Enter, a tap or the timer. */
  onClose: () => void;
  /** Milliseconds before it closes by itself; `CHEST_CLOSE_MS` by default. */
  closeAfterMs?: number;
}

/** The overlay closes by itself after this long (#15). */
export const CHEST_CLOSE_MS = 3000;

interface Row {
  iconId: AssetId | null;
  name: string;
  tag: string;
}

const weaponName = (id: WeaponId): string => WEAPONS[id].name;

/** The icon, name and tag of one reward, from content data only. */
function describe(reward: ChestReward): Row {
  switch (reward.kind) {
    case 'levelUp': {
      const def =
        reward.itemKind === 'weapon'
          ? WEAPONS[reward.id as WeaponId]
          : PASSIVES.find((p) => p.id === reward.id);
      return {
        iconId: def?.iconId ?? null,
        name: def?.name ?? reward.id,
        tag: `Lv ${String(reward.newLevel - 1)} → ${String(reward.newLevel)}`,
      };
    }
    case 'evolve':
      return {
        iconId: WEAPONS[reward.intoWeaponId].iconId,
        name: weaponName(reward.fromWeaponId),
        tag: `EVOLVED: ${weaponName(reward.intoWeaponId)}`,
      };
    case 'heal':
      return { iconId: null, name: 'Heal', tag: `+${String(reward.amount)} HP` };
    default: {
      const never: never = reward;
      throw new Error(`Unknown chest reward ${JSON.stringify(never)}`);
    }
  }
}

function row(reward: ChestReward, iconUrl: AssetUrl): HTMLElement {
  const { iconId, name, tag } = describe(reward);
  const url = iconId === null ? null : iconUrl(iconId);
  const icon = url
    ? h('img', { class: 'icon', src: url, alt: '' })
    : h('span', {
        class: reward.kind === 'heal' ? 'icon heal' : 'icon missing',
        'aria-hidden': 'true',
        text: reward.kind === 'heal' ? '♥' : undefined,
      });
  return h('li', { class: 'card', 'data-kind': reward.kind }, [
    icon,
    h('span', { class: 'card-head' }, [
      h('strong', { class: 'card-name', text: name }),
      h('span', { class: 'card-tag', text: tag }),
    ]),
  ]);
}

/**
 * The treasure chest overlay (#15, ADR 0009): a centred panel titled "Treasure" listing the rewards, which the worker
 * has already applied. Enter or a tap on it (#149) closes it, and so does a timer of `closeAfterMs`; any of them calls
 * `onClose` once. Every text
 * comes from content data and is set with `textContent` (ADR 0011).
 */
export function mount(root: HTMLElement, props: ChestProps): Screen<ChestProps> {
  const doc = root.ownerDocument;
  let current = props;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    current.onClose();
  };
  const el = h(
    'section',
    {
      class: 'screen overlay chest',
      role: 'dialog',
      'aria-label': 'Treasure',
      // #149: a tap anywhere on the overlay closes it, like Enter.
      'on:click': close,
    },
    [
      h('h2', { text: 'Treasure' }),
      h(
        'ul',
        { class: 'menu cards rewards' },
        props.rewards.map((r) => row(r, props.iconUrl)),
      ),
      h('p', { class: 'hint keys-only', text: 'Enter to continue' }),
      h('p', { class: 'hint touch-only', text: 'Tap to continue' }),
    ],
  );
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
    e.preventDefault();
    close();
  };
  doc.addEventListener('keydown', onKey);
  const timer = setTimeout(close, props.closeAfterMs ?? CHEST_CLOSE_MS);
  root.append(el);
  return {
    update(next) {
      current = next;
    },
    unmount() {
      clearTimeout(timer);
      doc.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
