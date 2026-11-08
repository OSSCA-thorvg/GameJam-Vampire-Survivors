import { h, menuKeys, type Screen } from './dom';

export interface TitleProps {
  onStart: () => void;
}

/** The title screen (#9): the game title and "Start", focused on mount; Enter starts. */
export function mount(root: HTMLElement, props: TitleProps): Screen<TitleProps> {
  let current = props;
  const start = h('button', {
    type: 'button',
    text: 'Start',
    'on:click': () => {
      current.onStart();
    },
  });
  const el = h('section', { class: 'screen', 'aria-labelledby': 'title-heading' }, [
    h('h1', { id: 'title-heading', text: 'Vampire Survivors: ThorVG' }),
    h('p', { class: 'hint', text: 'Arrow keys or WASD move. Escape pauses.' }),
    h('div', { class: 'menu' }, [start]),
  ]);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [start]);
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
