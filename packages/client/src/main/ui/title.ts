import { h, menuKeys, type Screen } from './dom';

export interface TitleProps {
  onStart: () => void;
  /** #19: the 2-player versus flow. */
  onMultiplayer: () => void;
  /** #143: the personal records screen. */
  onRecords: () => void;
}

/**
 * The title screen (#9): the game title, "Start" (focused on mount; Enter starts), "Multiplayer" (#19) and "Records"
 * (#143).
 */
export function mount(root: HTMLElement, props: TitleProps): Screen<TitleProps> {
  let current = props;
  const start = h('button', {
    type: 'button',
    text: 'Start',
    'on:click': () => {
      current.onStart();
    },
  });
  const multiplayer = h('button', {
    type: 'button',
    text: 'Multiplayer',
    'on:click': () => {
      current.onMultiplayer();
    },
  });
  const records = h('button', {
    type: 'button',
    text: 'Records',
    'on:click': () => {
      current.onRecords();
    },
  });
  const el = h('section', { class: 'screen', 'aria-labelledby': 'title-heading' }, [
    h('h1', { id: 'title-heading', text: 'Crimson Vigil' }),
    h('p', { class: 'hint', text: 'Arrow keys or WASD move. Escape pauses.' }),
    h('div', { class: 'menu' }, [start, multiplayer, records]),
  ]);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [start, multiplayer, records]);
  return {
    update(next) {
      current = next;
    },
    unmount() {
      removeKeys();
      el.remove();
    },
  };
}
