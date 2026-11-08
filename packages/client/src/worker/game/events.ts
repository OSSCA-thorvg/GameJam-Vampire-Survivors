import type { EnemyId } from '@vs/shared';

/** `playerHit` (#9, `amount` is the damage), `enemyKilled` (#10 pushes it, #11 reads `xp`). */
export type GameEventKind = 'playerHit' | 'enemyKilled';

export interface GameEvent {
  kind: GameEventKind;
  x: number;
  y: number;
  amount: number;
  enemyId: EnemyId | null;
  xp: number;
}

/** Events of the current step only: `world.step` clears the queue before the first system. */
export interface EventQueue {
  /** Preallocated records; only the first `count` are this step's events. */
  readonly items: readonly GameEvent[];
  count: number;
  /** Returns the next record, reset, for the caller to fill. Never allocates. */
  push(kind: GameEventKind): GameEvent;
  clear(): void;
}

/** Records per step (initial value): more than any step produces; overflow is dropped with one dev warning. */
export const EVENT_CAPACITY = 1024;

const blank = (): GameEvent => ({ kind: 'playerHit', x: 0, y: 0, amount: 0, enemyId: null, xp: 0 });

function reset(event: GameEvent, kind: GameEventKind): GameEvent {
  event.kind = kind;
  event.x = 0;
  event.y = 0;
  event.amount = 0;
  event.enemyId = null;
  event.xp = 0;
  return event;
}

export function createEventQueue(capacity = EVENT_CAPACITY): EventQueue {
  const items = Array.from({ length: capacity }, blank);
  /** Overflowing pushes write here, so callers never need a null check. */
  const scratch = blank();
  let warned = false;
  const queue: EventQueue = {
    items,
    count: 0,
    push(kind) {
      const event = items[queue.count];
      if (!event) {
        if (import.meta.env.DEV && !warned) {
          warned = true;
          console.warn(
            `[events] more than ${String(capacity)} events in one step; extra ones dropped`,
          );
        }
        return reset(scratch, kind);
      }
      queue.count++;
      return reset(event, kind);
    },
    clear() {
      queue.count = 0;
    },
  };
  return queue;
}
