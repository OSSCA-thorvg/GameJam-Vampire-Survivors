import type { Axis } from '../protocol/worker-messages';

type Direction = 'up' | 'down' | 'left' | 'right';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export interface Input {
  /** #149: the touch joystick's direction, used while no movement key is held. */
  setTouchAxis(dx: Axis, dy: Axis): void;
}

/**
 * Keyboard and touch → direction (ADR 0004). Tracks the pressed movement keys and calls `send` only when the resulting
 * direction changes. While any movement key is held the keys decide; otherwise the touch axis (#149) does. Blur and
 * hiding the tab release every key and the touch axis. The worker normalizes diagonals.
 */
export function createInput(
  target: Pick<Document, 'addEventListener'>,
  win: Pick<Window, 'addEventListener'>,
  send: (dx: Axis, dy: Axis) => void,
): Input {
  const pressed = new Set<string>();
  let lastDx: Axis = 0;
  let lastDy: Axis = 0;
  let touchDx: Axis = 0;
  let touchDy: Axis = 0;

  const held = (direction: Direction): number => {
    for (const code of pressed) if (KEY_DIRECTIONS[code] === direction) return 1;
    return 0;
  };

  const update = (): void => {
    const keys = pressed.size > 0;
    const dx = keys ? ((held('right') - held('left')) as Axis) : touchDx;
    const dy = keys ? ((held('down') - held('up')) as Axis) : touchDy;
    if (dx === lastDx && dy === lastDy) return;
    lastDx = dx;
    lastDy = dy;
    send(dx, dy);
  };

  const releaseAll = (): void => {
    pressed.clear();
    touchDx = 0;
    touchDy = 0;
    update();
  };

  target.addEventListener('keydown', (e) => {
    if (ARROW_KEYS.has(e.code)) e.preventDefault();
    if (!(e.code in KEY_DIRECTIONS)) return;
    pressed.add(e.code);
    update();
  });
  target.addEventListener('keyup', (e) => {
    if (ARROW_KEYS.has(e.code)) e.preventDefault();
    if (!pressed.delete(e.code)) return;
    update();
  });
  win.addEventListener('blur', releaseAll);
  target.addEventListener('visibilitychange', () => {
    if ((target as Partial<Pick<Document, 'hidden'>>).hidden === true) releaseAll();
  });
  return {
    setTouchAxis(dx, dy) {
      touchDx = dx;
      touchDy = dy;
      update();
    },
  };
}
