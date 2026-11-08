import { describe, expect, it, vi } from 'vitest';
import { createEventQueue, EVENT_CAPACITY } from './events';

describe('event queue', () => {
  it('preallocates its records: 2000 pushes in one step allocate none and overflow warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const queue = createEventQueue();
    const items = queue.items;
    const records = [...items];
    for (let i = 0; i < 2000; i++) {
      const event = queue.push(i % 2 ? 'enemyKilled' : 'playerHit');
      event.amount = i;
    }
    expect(queue.items).toBe(items);
    expect(items).toHaveLength(EVENT_CAPACITY);
    expect(items.every((item, i) => item === records[i])).toBe(true);
    expect(queue.count).toBe(EVENT_CAPACITY);
    expect(warn).toHaveBeenCalledTimes(1);
    queue.clear();
    for (let i = 0; i < 2000; i++) queue.push('playerHit');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('resets each record it hands out and clears to zero', () => {
    const queue = createEventQueue(2);
    const a = queue.push('enemyKilled');
    a.enemyId = 'bat';
    a.xp = 3;
    a.flags = 5;
    queue.clear();
    const b = queue.push('playerHit');
    expect(b).toBe(a);
    expect(b).toEqual({
      kind: 'playerHit',
      x: 0,
      y: 0,
      amount: 0,
      enemyId: null,
      xp: 0,
      flags: 0,
    });
    expect(queue.count).toBe(1);
  });
});
