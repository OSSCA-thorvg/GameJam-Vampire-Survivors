import {
  ENEMY_CAP,
  PICKUPS,
  VIEW_ENEMY_MAX,
  VIEW_GEM_MAX,
  VIEW_MAX_BYTES,
  VIEW_QUANT,
  VIEW_REL_MAX,
  isPlayerView,
  parseClientMessage,
} from '@vs/shared';
import { describe, expect, it } from 'vitest';
import type { WorkerView } from '../../protocol/worker-messages';
import { ENEMY_FLAG_ELITE, spawnEnemy } from './enemies';
import { dropGem, GEM_SWEEP_MARGIN, GEM_FLYING } from './gems';
import { PICKUP_FAMILY_INTERFERENCE, PICKUP_FAMILY_LIGHT, spawnPickup } from './pickups';
import {
  createViewEmitter,
  createViewScratch,
  readView,
  selectNearest,
  summarizeView,
  VIEW_INTERVAL_SEC,
} from './view-stream';
import { createWorld, type World } from './world';

const DT = 1 / 60;
const RANGE = VIEW_REL_MAX * VIEW_QUANT;

/** A versus world with no enemies, gems or pickups, the player at (px, py). */
function emptyWorld(px = 0, py = 0, mode: 'single' | 'versus' = 'versus'): World {
  const world = createWorld({ seed: 3, mode, characterId: 'swift' });
  world.enemies.clear();
  world.gems.clear();
  world.pickups.clear();
  world.player.x = px;
  world.player.y = py;
  return world;
}

const triples = (list: number[]): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < list.length; i += 3)
    out.push([list[i] ?? NaN, list[i + 1] ?? NaN, list[i + 2] ?? NaN]);
  return out;
};

describe('readView (#114, ADR 0018)', () => {
  it('quantizes positions relative to the player, rounds to whole units and encodes the player', () => {
    const world = emptyWorld(100.4, -50.6);
    world.player.facingX = -1;
    world.player.hp = world.player.maxHp / 4;
    world.time = 12.3456;
    spawnEnemy(world, 'ghoul', 100.4 + 10, -50.6 - 6); // dx 2.5 → 3 (round half up), dy -1.5 → -1
    const view = readView(world, createViewScratch());
    expect(isPlayerView(view)).toBe(true);
    expect(view).toMatchObject({ t: 12346, x: 100, y: -51, f: 1, c: 2, h: 250 });
    expect(triples(view.e)).toEqual([[1 * 2, 3, -1]]);
  });

  it('sets the elite bit in the enemy kind', () => {
    const world = emptyWorld();
    const slot = spawnEnemy(world, 'skeleton', 40, 0);
    world.enemies.cols.flags[slot] = (world.enemies.cols.flags[slot] ?? 0) | ENEMY_FLAG_ELITE;
    spawnEnemy(world, 'bat', -40, 0);
    const view = readView(world, createViewScratch());
    expect(triples(view.e)).toEqual([
      [4 * 2 + 1, 10, 0],
      [0, -10, 0],
    ]);
    expect(summarizeView(view)).toMatchObject({ enemies: 2, elites: 1 });
  });

  it('keeps the nearest 160 of 300 enemies in range', () => {
    const world = emptyWorld();
    // 300 enemies on a spiral, at distinct distances 10, 12, …, 608 units.
    for (let i = 0; i < 300; i++) {
      const r = 10 + i * 2;
      const a = i * 2.4;
      spawnEnemy(world, 'bat', Math.cos(a) * r, Math.sin(a) * r);
    }
    const view = readView(world, createViewScratch());
    expect(view.e.length / 3).toBe(VIEW_ENEMY_MAX);
    const far = Math.max(
      ...triples(view.e).map(([, dx, dy]) => Math.hypot(dx * VIEW_QUANT, dy * VIEW_QUANT)),
    );
    // The 160th nearest is at 10 + 159 * 2 = 328 units; quantization moves it by at most 2√2.
    expect(far).toBeLessThan(328 + 3);
  });

  it('selectNearest puts the k smallest first for any input order', () => {
    const scratch = createViewScratch();
    const n = 257;
    const values = Array.from({ length: n }, (_, i) => (i * 7919) % 263);
    for (let i = 0; i < n; i++) {
      scratch.idx[i] = i;
      scratch.dist[i] = values[i] ?? 0;
    }
    selectNearest(scratch, n, 40);
    const first = Array.from(scratch.dist.slice(0, 40)).sort((a, b) => a - b);
    expect(first).toEqual([...values].sort((a, b) => a - b).slice(0, 40));
    expect(scratch.idx.length).toBe(ENEMY_CAP);
  });

  it('skips enemies, gems and pickups out of range and flying gems, and caps gems', () => {
    const world = emptyWorld();
    spawnEnemy(world, 'bat', RANGE + 4, 0);
    spawnEnemy(world, 'bat', 0, -RANGE - 4);
    spawnEnemy(world, 'bat', RANGE, -RANGE); // the corner is in range
    for (let i = 0; i < VIEW_GEM_MAX + 10; i++)
      dropGem(
        world,
        i,
        8,
        1,
        world.player.x,
        world.player.y,
        world.camera.viewRect(GEM_SWEEP_MARGIN),
      );
    dropGem(
      world,
      RANGE + 10,
      0,
      1,
      world.player.x,
      world.player.y,
      world.camera.viewRect(GEM_SWEEP_MARGIN),
    );
    world.gems.cols.state[0] = GEM_FLYING;
    spawnPickup(world, PICKUP_FAMILY_LIGHT, 1, 0, 20);
    spawnPickup(world, PICKUP_FAMILY_INTERFERENCE, 2, -20, 0);
    spawnPickup(world, PICKUP_FAMILY_LIGHT, 0, 0, RANGE + 40);
    const view = readView(world, createViewScratch());
    expect(triples(view.e)).toEqual([[0, VIEW_REL_MAX, -VIEW_REL_MAX]]);
    expect(view.g.length / 3).toBe(VIEW_GEM_MAX);
    expect(triples(view.g)[0]).toEqual([0, 0, 2]); // the flying gem at x 0 is skipped: the first is the gem at x 1
    expect(triples(view.p)).toEqual([
      [1, 0, 5],
      [PICKUPS.length + 2, -5, 0],
    ]);
  });

  it('a full world still encodes under VIEW_MAX_BYTES and passes the protocol validator', () => {
    const world = emptyWorld(-999_999.4, 999_999.6);
    for (let i = 0; i < ENEMY_CAP; i++)
      spawnEnemy(world, 'brute', world.player.x - RANGE, world.player.y - RANGE);
    for (let i = 0; i < 100; i++)
      dropGem(
        world,
        world.player.x - RANGE,
        world.player.y,
        30,
        world.player.x,
        world.player.y,
        world.camera.viewRect(GEM_SWEEP_MARGIN),
      );
    world.time = 899.999;
    const view = readView(world, createViewScratch());
    const message = JSON.stringify({ type: 'view', view });
    expect(new TextEncoder().encode(message).length).toBeLessThanOrEqual(VIEW_MAX_BYTES);
    expect(parseClientMessage(JSON.parse(message))).not.toBeNull();
  });
});

describe('view emitter (#114)', () => {
  function run(mode: 'single' | 'versus', steps: number, hiddenAt?: (i: number) => boolean) {
    const posted: WorkerView[] = [];
    const emitter = createViewEmitter((m) => posted.push(m));
    const world = createWorld({ seed: 7, mode });
    world.debugInvulnerable = true;
    const postedAt: number[] = [];
    for (let i = 0; i < steps; i++) {
      world.step(DT);
      const before = posted.length;
      emitter.afterStep(world, DT, hiddenAt?.(i) ?? false);
      if (posted.length > before) postedAt.push(i);
      world.pendingLevelUps = 0;
    }
    return { posted, postedAt, emitter, world };
  }

  it('posts once per 0.1 s of simulated time: 10 in 60 steps', () => {
    expect(VIEW_INTERVAL_SEC).toBe(0.1);
    const { posted, postedAt, emitter } = run('versus', 60);
    expect(posted).toHaveLength(10);
    expect(postedAt).toEqual([5, 11, 17, 23, 29, 35, 41, 47, 53, 59]);
    expect(posted.every((m) => isPlayerView(m.view))).toBe(true);
    expect(emitter.sent).toBe(10);
    expect(emitter.last).toBe(posted[9]?.view);
  });

  it('posts nothing in a single-player run', () => {
    const { posted, emitter } = run('single', 120);
    expect(posted).toEqual([]);
    expect(emitter.last).toBeNull();
  });

  it('posts nothing while hidden and posts on the first visible step after', () => {
    const { postedAt } = run('versus', 120, (i) => i >= 20 && i < 80);
    expect(postedAt.filter((i) => i >= 20 && i < 80)).toEqual([]);
    expect(postedAt).toContain(80);
    // No burst after showing: one every 6 steps again.
    expect(postedAt.filter((i) => i >= 80)).toEqual([80, 86, 92, 98, 104, 110, 116]);
  });

  it('posts nothing once the world is dead, and reset forgets the last view', () => {
    const posted: WorkerView[] = [];
    const emitter = createViewEmitter((m) => posted.push(m));
    const world = createWorld({ seed: 7, mode: 'versus' });
    emitter.afterStep(world, VIEW_INTERVAL_SEC, false);
    expect(posted).toHaveLength(1);
    world.state = 'dead';
    emitter.afterStep(world, VIEW_INTERVAL_SEC, false);
    expect(posted).toHaveLength(1);
    emitter.reset();
    expect(emitter.last).toBeNull();
    expect(emitter.sent).toBe(0);
  });
});
