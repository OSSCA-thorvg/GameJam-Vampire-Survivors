// The opponent's latest views (#114, ADR 0018), received through the main thread's `opponentView`. Display data only:
// the worker never simulates them. The split-pane view (#115) draws from `entries()`.
import type { PlayerView } from '@vs/shared';
import { summarizeView } from './view-stream';

/** Views kept: enough to interpolate between the two that bracket a render time slightly in the past. */
export const OPPONENT_FEED_SIZE = 3;

export interface FeedEntry {
  view: PlayerView;
  /** `performance.now()` when the view reached the worker. */
  atMs: number;
}

export interface OpponentFeed {
  push(view: PlayerView, atMs: number): void;
  /** Forgets every view (a new run, or back to the title); `received` restarts at 0. */
  clear(): void;
  /** The newest entry, or `null` before the first. */
  latest(): FeedEntry | null;
  /** The kept entries, oldest first. The same array every call: read it, never keep or change it. */
  entries(): readonly FeedEntry[];
  /** Views pushed since the last `clear`. */
  readonly received: number;
}

export function createOpponentFeed(): OpponentFeed {
  // A ring of reusable entry records plus one ordered list, rebuilt in place on push (no allocation per view).
  const ring: FeedEntry[] = [];
  const ordered: FeedEntry[] = [];
  let head = 0;
  let received = 0;
  return {
    push(view, atMs) {
      if (ring.length < OPPONENT_FEED_SIZE) {
        ring.push({ view, atMs });
        head = ring.length % OPPONENT_FEED_SIZE;
      } else {
        const slot = ring[head];
        if (slot) {
          slot.view = view;
          slot.atMs = atMs;
        }
        head = (head + 1) % OPPONENT_FEED_SIZE;
      }
      received++;
      ordered.length = 0;
      const start = ring.length < OPPONENT_FEED_SIZE ? 0 : head;
      for (let i = 0; i < ring.length; i++) {
        const entry = ring[(start + i) % ring.length];
        if (entry) ordered.push(entry);
      }
    },
    clear() {
      ring.length = 0;
      ordered.length = 0;
      head = 0;
      received = 0;
    },
    latest() {
      return ordered[ordered.length - 1] ?? null;
    },
    entries() {
      return ordered;
    },
    get received() {
      return received;
    },
  };
}

/** The `opponentFeed` snapshot field (dev and e2e builds): the newest view's numbers, or `null` before the first. */
export function readOpponentFeed(feed: OpponentFeed): {
  t: number;
  x: number;
  y: number;
  facing: 0 | 1;
  character: number;
  hpPermille: number;
  enemies: number;
  elites: number;
  gems: number;
  pickups: number;
  received: number;
} | null {
  const entry = feed.latest();
  if (!entry) return null;
  const { view } = entry;
  return {
    ...summarizeView(view),
    facing: view.f,
    character: view.c,
    hpPermille: view.h,
    received: feed.received,
  };
}
