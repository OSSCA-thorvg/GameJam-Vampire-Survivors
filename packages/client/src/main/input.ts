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

/**
 * Keyboard → direction (ADR 0004). Tracks the pressed movement keys and calls `send` only when the resulting
 * direction changes. Blur and hiding the tab release every key. The worker normalizes diagonals.
 */
export function createInput(
  target: Pick<Document, 'addEventListener'>,
  win: Pick<Window, 'addEventListener'>,
  send: (dx: Axis, dy: Axis) => void,
): void {
  const pressed = new Set<string>();
  let lastDx: Axis = 0;
  let lastDy: Axis = 0;

  const held = (direction: Direction): number => {
    for (const code of pressed) if (KEY_DIRECTIONS[code] === direction) return 1;
    return 0;
  };

  const update = (): void => {
    const dx = (held('right') - held('left')) as Axis;
    const dy = (held('down') - held('up')) as Axis;
    if (dx === lastDx && dy === lastDy) return;
    lastDx = dx;
    lastDy = dy;
    send(dx, dy);
  };

  const releaseAll = (): void => {
    pressed.clear();
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
}
