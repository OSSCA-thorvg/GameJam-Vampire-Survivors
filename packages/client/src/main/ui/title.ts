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
 * (#143). In touch mode (#149) its hint speaks of the joystick, and a "Fullscreen" button appears where the browser
 * supports it.
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
  const doc = root.ownerDocument;
  const el = h('section', { class: 'screen', 'aria-labelledby': 'title-heading' }, [
    h('h1', { id: 'title-heading', text: 'Crimson Vigil' }),
    h('p', { class: 'hint keys-only', text: 'Arrow keys or WASD move. Escape pauses.' }),
    h('p', { class: 'hint touch-only', text: 'Drag anywhere to move. Tap Pause to pause.' }),
    h('div', { class: 'menu' }, [start, multiplayer, records]),
  ]);
  // #149: Android Chrome can hide its browser bars; iOS Safari has no Fullscreen API, so no button there. The button
  // shows only in touch mode (CSS) and stays out of the menu keys.
  if (doc.fullscreenEnabled)
    el.append(
      h('button', {
        type: 'button',
        id: 'fullscreen',
        class: 'touch-only',
        text: 'Fullscreen',
        'on:click': () => {
          doc.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
            // Refused (no gesture, or the browser said no): the game keeps running in the page.
          });
        },
      }),
    );
  root.append(el);
  const removeKeys = menuKeys(doc, [start, multiplayer, records]);
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
