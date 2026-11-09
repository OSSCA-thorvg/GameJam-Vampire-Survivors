import type { PlayerView } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { createOpponentFeed, OPPONENT_FEED_SIZE, readOpponentFeed } from './opponent-feed';

const view = (t: number): PlayerView => ({
  t,
  x: t,
  y: -t,
  f: 1,
  c: 3,
  h: 640,
  e: [0, 1, 1, 9, 2, 2],
  g: [1, 0, 0],
  p: [],
});

describe('opponent feed (#114)', () => {
  it('is empty before the first view', () => {
    const feed = createOpponentFeed();
    expect(feed.latest()).toBeNull();
    expect(feed.entries()).toEqual([]);
    expect(readOpponentFeed(feed)).toBeNull();
  });

  it('keeps the last 3 views oldest first, with their arrival time', () => {
    expect(OPPONENT_FEED_SIZE).toBe(3);
    const feed = createOpponentFeed();
    const list = feed.entries();
    for (let i = 1; i <= 5; i++) feed.push(view(i * 100), i * 1000);
    expect(feed.entries()).toBe(list);
    expect(list.map((e) => [e.view.t, e.atMs])).toEqual([
      [300, 3000],
      [400, 4000],
      [500, 5000],
    ]);
    expect(feed.latest()?.view.t).toBe(500);
    expect(feed.received).toBe(5);
  });

  it('orders a partly filled ring too', () => {
    const feed = createOpponentFeed();
    feed.push(view(1), 1);
    feed.push(view(2), 2);
    expect(feed.entries().map((e) => e.view.t)).toEqual([1, 2]);
  });

  it('clear forgets everything', () => {
    const feed = createOpponentFeed();
    feed.push(view(1), 1);
    feed.clear();
    expect(feed.latest()).toBeNull();
    expect(feed.received).toBe(0);
    feed.push(view(7), 7);
    expect(feed.entries().map((e) => e.view.t)).toEqual([7]);
  });

  it('the snapshot field reads the newest view', () => {
    const feed = createOpponentFeed();
    feed.push(view(1), 1);
    feed.push(view(250), 2);
    expect(readOpponentFeed(feed)).toEqual({
      t: 250,
      x: 250,
      y: -250,
      facing: 1,
      character: 3,
      hpPermille: 640,
      enemies: 2,
      elites: 1,
      gems: 1,
      pickups: 0,
      received: 2,
    });
  });
});
