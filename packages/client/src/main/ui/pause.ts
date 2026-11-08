import { h, menuKeys, type Screen } from './dom';

export interface PauseProps {
  onResume: () => void;
  onQuit: () => void;
}

/**
 * The pause overlay (#9), shown on Escape and when the tab was hidden: "Resume" (focused) and "Quit to title".
 * Escape resumes; `app.ts` handles that key, since it toggles the pause from either side.
 */
export function mount(root: HTMLElement, props: PauseProps): Screen<PauseProps> {
  let current = props;
  const resume = h('button', {
    type: 'button',
    text: 'Resume',
    'on:click': () => {
      current.onResume();
    },
  });
  const quit = h('button', {
    type: 'button',
    text: 'Quit to title',
    'on:click': () => {
      current.onQuit();
    },
  });
  const el = h('section', { class: 'screen overlay', role: 'dialog', 'aria-label': 'Paused' }, [
    h('h2', { text: 'Paused' }),
    h('div', { class: 'menu' }, [resume, quit]),
  ]);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [resume, quit]);
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
