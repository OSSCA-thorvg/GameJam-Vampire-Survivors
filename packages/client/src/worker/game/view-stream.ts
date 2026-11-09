// The view stream's encoder (#114, ADR 0018): a quantized snapshot of this player's own world, posted to the main
// thread 10 times per second during a versus run and relayed by the server to the opponent, who only draws it.
import {
  CHARACTERS,
  ENEMY_CAP,
  VIEW_ENEMY_MAX,
  VIEW_GEM_MAX,
  VIEW_PICKUP_MAX,
  VIEW_POS_MAX,
  VIEW_QUANT,
  VIEW_REL_MAX,
  VIEW_TIME_MAX_MS,
  type PlayerView,
} from '@vs/shared';
import type { WorkerView } from '../../protocol/worker-messages';
import { ENEMY_FLAG_DEAD, ENEMY_FLAG_ELITE } from './enemies';
import { GEM_IDLE } from './gems';
import { pickupPoolIndex } from './pickups';
import type { World } from './world';

/** Simulated seconds between two views: 10 per second, above the server's `VIEW_MIN_INTERVAL_MS` once coalesced. */
export const VIEW_INTERVAL_SEC = 0.1;
/** Float drift of summed 1/60 s steps must not delay a view by one step. */
const EPSILON = 1e-9;
/** Largest `|entity - player|` on one axis that still encodes: `VIEW_REL_MAX` steps of `VIEW_QUANT` units. */
const RANGE = VIEW_REL_MAX * VIEW_QUANT;

/** Buffers for the nearest-enemy selection, created once per emitter (never per emission). */
export interface ViewScratch {
  idx: Int32Array;
  dist: Float32Array;
}

export function createViewScratch(): ViewScratch {
  return { idx: new Int32Array(ENEMY_CAP), dist: new Float32Array(ENEMY_CAP) };
}

const clampInt = (v: number, max: number): number => Math.max(-max, Math.min(max, Math.round(v)));
const offset = (d: number): number => clampInt(d / VIEW_QUANT, VIEW_REL_MAX);

function swap(s: ViewScratch, i: number, j: number): void {
  const ti = s.idx[i] ?? 0;
  s.idx[i] = s.idx[j] ?? 0;
  s.idx[j] = ti;
  const td = s.dist[i] ?? 0;
  s.dist[i] = s.dist[j] ?? 0;
  s.dist[j] = td;
}

/**
 * Reorders `s.idx[0..n)` (with `s.dist`) in place so that its first `k` entries are the `k` smallest distances
 * (Hoare quickselect with a middle pivot; no randomness, no allocation).
 */
export function selectNearest(s: ViewScratch, n: number, k: number): void {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const pivot = s.dist[(lo + hi) >> 1] ?? 0;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while ((s.dist[i] ?? 0) < pivot) i++;
      while ((s.dist[j] ?? 0) > pivot) j--;
      if (i <= j) {
        swap(s, i, j);
        i++;
        j--;
      }
    }
    // [lo..j] ≤ pivot ≤ [i..hi]; continue in the part that holds position k - 1.
    if (k - 1 <= j) hi = j;
    else if (k - 1 >= i) lo = i;
    else return;
  }
}

/**
 * The view of `world` now (ADR 0018): the player's whole-unit position, facing, character and HP permille, plus
 * enemies (the nearest `VIEW_ENEMY_MAX` when more are in range), idle gems and pickups within `±RANGE` on both axes,
 * as `[kind, dx, dy]` triples. Allocates the view object and its three arrays only.
 */
export function readView(world: World, scratch: ViewScratch): PlayerView {
  const { player } = world;
  const px = player.x;
  const py = player.y;

  // Enemies in range, as candidates with their squared distance.
  const ec = world.enemies.cols;
  let n = 0;
  for (let i = 0; i < world.enemies.count; i++) {
    const flags = ec.flags[i] ?? 0;
    if ((flags & ENEMY_FLAG_DEAD) !== 0) continue;
    const dx = (ec.x[i] ?? 0) - px;
    const dy = (ec.y[i] ?? 0) - py;
    if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE) continue;
    scratch.idx[n] = i;
    scratch.dist[n] = dx * dx + dy * dy;
    n++;
  }
  const enemyCount = Math.min(n, VIEW_ENEMY_MAX);
  if (n > VIEW_ENEMY_MAX) selectNearest(scratch, n, VIEW_ENEMY_MAX);
  const e = new Array<number>(enemyCount * 3);
  for (let k = 0; k < enemyCount; k++) {
    const i = scratch.idx[k] ?? 0;
    const elite = ((ec.flags[i] ?? 0) & ENEMY_FLAG_ELITE) !== 0 ? 1 : 0;
    e[k * 3] = (ec.type[i] ?? 0) * 2 + elite;
    e[k * 3 + 1] = offset((ec.x[i] ?? 0) - px);
    e[k * 3 + 2] = offset((ec.y[i] ?? 0) - py);
  }

  // Idle gems in range, in store order.
  const gc = world.gems.cols;
  const g: number[] = [];
  for (let i = 0; i < world.gems.count && g.length < VIEW_GEM_MAX * 3; i++) {
    if (gc.state[i] !== GEM_IDLE) continue;
    const dx = (gc.x[i] ?? 0) - px;
    const dy = (gc.y[i] ?? 0) - py;
    if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE) continue;
    g.push(gc.tier[i] ?? 0, offset(dx), offset(dy));
  }

  // Pickups of both families in range, in store order.
  const pc = world.pickups.cols;
  const p: number[] = [];
  for (let i = 0; i < world.pickups.count && p.length < VIEW_PICKUP_MAX * 3; i++) {
    const dx = (pc.x[i] ?? 0) - px;
    const dy = (pc.y[i] ?? 0) - py;
    if (Math.abs(dx) > RANGE || Math.abs(dy) > RANGE) continue;
    p.push(pickupPoolIndex(pc.family[i] ?? 0, pc.defIdx[i] ?? 0), offset(dx), offset(dy));
  }

  const maxHp = player.maxHp > 0 ? player.maxHp : 1;
  return {
    t: Math.max(0, Math.min(VIEW_TIME_MAX_MS, Math.round(world.time * 1000))),
    x: clampInt(px, VIEW_POS_MAX),
    y: clampInt(py, VIEW_POS_MAX),
    f: player.facingX < 0 ? 1 : 0,
    c: Math.max(
      0,
      CHARACTERS.findIndex((def) => def.id === world.characterId),
    ),
    h: Math.max(0, Math.min(1000, Math.round((player.hp / maxHp) * 1000))),
    e,
    g,
    p,
  };
}

/** What the `viewOut` snapshot field shows of the last view posted (dev and e2e builds). */
export interface ViewSummary {
  t: number;
  x: number;
  y: number;
  enemies: number;
  elites: number;
  gems: number;
  pickups: number;
  sent: number;
}

/** Counts of a view's lists: enemies, elites (odd enemy kinds), gems and pickups. */
export function summarizeView(view: PlayerView): Omit<ViewSummary, 'sent'> {
  let elites = 0;
  for (let i = 0; i < view.e.length; i += 3) if (((view.e[i] ?? 0) & 1) === 1) elites++;
  return {
    t: view.t,
    x: view.x,
    y: view.y,
    enemies: view.e.length / 3,
    elites,
    gems: view.g.length / 3,
    pickups: view.p.length / 3,
  };
}

/**
 * Posts a versus run's view (#114) once per `VIEW_INTERVAL_SEC` of simulated time from the worker's fixed step, while
 * the world is running and the tab is visible. Single-player runs never post one.
 */
export interface ViewEmitter {
  afterStep(world: World, dt: number, hidden: boolean): void;
  /** A new run starts its interval from zero and forgets the last view. */
  reset(): void;
  /** The last view posted, for the `viewOut` snapshot field; `null` before the first in this run. */
  readonly last: PlayerView | null;
  /** Views posted this run. */
  readonly sent: number;
}

export function createViewEmitter(post: (message: WorkerView) => void): ViewEmitter {
  const scratch = createViewScratch();
  let acc = 0;
  let last: PlayerView | null = null;
  let sent = 0;
  return {
    afterStep(world, dt, hidden) {
      if (world.mode !== 'versus' || world.state !== 'running') return;
      // While hidden nothing is posted, and the interval does not pile up: the first visible step posts at once.
      acc = Math.min(acc + dt, VIEW_INTERVAL_SEC);
      if (hidden || acc + EPSILON < VIEW_INTERVAL_SEC) return;
      acc = 0;
      last = readView(world, scratch);
      sent++;
      post({ type: 'view', view: last });
    },
    reset() {
      acc = 0;
      last = null;
      sent = 0;
    },
    get last() {
      return last;
    },
    get sent() {
      return sent;
    },
  };
}
