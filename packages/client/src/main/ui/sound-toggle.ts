import { h } from './dom';
import { soundLabel } from './pause';

export interface SoundToggle {
  update(muted: boolean): void;
}

/**
 * The corner mute button (#129), fixed bottom-left over every screen. It is outside menu focus (`tabindex="-1"`), so
 * the arrows and Enter of the screens never reach it; `M` toggles the same setting.
 */
export function mountSoundToggle(
  root: HTMLElement,
  props: { muted: boolean; onToggle: () => void },
): SoundToggle {
  const el = h('button', {
    id: 'sound-toggle',
    type: 'button',
    'on:click': () => {
      props.onToggle();
    },
  });
  el.tabIndex = -1;
  const update = (muted: boolean): void => {
    el.textContent = soundLabel(muted);
    el.setAttribute('aria-pressed', String(muted));
  };
  update(props.muted);
  root.append(el);
  return { update };
}
