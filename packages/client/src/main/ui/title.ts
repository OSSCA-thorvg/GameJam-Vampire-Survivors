import { h, menuKeys, type Screen } from './dom';

export interface TitleProps {
  onStart: () => void;
  /** #19: the 2-player versus flow. */
  onMultiplayer: () => void;
}

/** The title screen (#9): the game title, "Start" (focused on mount; Enter starts) and "Multiplayer" (#19). */
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
  const el = h('section', { class: 'screen', 'aria-labelledby': 'title-heading' }, [
    h('h1', { id: 'title-heading', text: 'Crimson Vigil' }),
    h('p', { class: 'hint', text: 'Arrow keys or WASD move. Escape pauses.' }),
    h('div', { class: 'menu' }, [start, multiplayer]),
  ]);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [start, multiplayer]);
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
