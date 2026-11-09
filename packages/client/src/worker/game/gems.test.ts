import { GEM_CAP, xpToNext } from '@vs/shared';
import { expect, it } from 'vitest';
import type { AssetSource } from '../assets/library';
import type { PaintPool } from '../render/pool';
import {
  createGemPools,
  gemDropSystem,
  gemSystem,
  GEM_ASSETS,
  GEM_FLYING,
  GEM_SWEEP_MARGIN,
  NO_GEM,
} from './gems';
import { readGemPositions } from './snapshot';
import { createWorld, type World } from './world';

/** Pushes `n` `enemyKilled` events worth `xp` each at (x, y), as `cleanupSystem` does, and runs the drop system. */
function kill(world: World, n: number, xp: number, x = 500, y = 500): void {
  world.events.clear();
  for (let i = 0; i < n; i++) {
    const e = world.events.push('enemyKilled');
    e.x = x + i;
    e.y = y;
    e.xp = xp;
  }
  gemDropSystem(world);
}

/** Total XP lying on the ground. */
const onGround = (world: World): number => {
  let sum = 0;
  for (let i = 0; i < world.gems.count; i++) sum += world.gems.cols.value[i] ?? 0;
  return sum;
};

it('drops one gem per kill, with its tier from its value', () => {
  const world = createWorld({ seed: 1 });
  kill(world, 10, 1);
  expect(world.gems.count).toBe(10);
  expect([...world.gems.cols.tier.subarray(0, 10)]).toEqual(Array.from({ length: 10 }, () => 0));
  kill(world, 1, 5);
  kill(world, 1, 12);
  expect(world.gems.cols.tier[10]).toBe(GEM_ASSETS.indexOf('gem.green'));
  expect(world.gems.cols.tier[11]).toBe(GEM_ASSETS.indexOf('gem.red'));
  expect(world.gems.cols.x[0]).toBe(500);
  expect(world.mergeGemUid).toBe(NO_GEM);
});

/**
 * A world whose player stands at (px, py) with the camera on him (as `cameraSystem` keeps it), and `GEM_CAP` 1-XP gems
 * in a row from the origin (x 0..399, y 0).
 */
function fullWorld(px: number, py: number, pools?: readonly PaintPool[]): World {
  const world = createWorld({ seed: 1, ...(pools ? { gemPools: pools } : {}) });
  moveTo(world, px, py);
  kill(world, GEM_CAP, 1, 0, 0);
  expect(world.gems.count).toBe(GEM_CAP);
  return world;
}

/** Moves the player and the camera to (x, y). */
function moveTo(world: World, x: number, y: number): void {
  world.player.x = world.camera.x = x;
  world.player.y = world.camera.y = y;
}

/** Slots of live gems at exactly (x, y). */
const gemsAt = (world: World, x: number, y: number): number[] => {
  const found: number[] = [];
  for (let i = 0; i < world.gems.count; i++)
    if (world.gems.cols.x[i] === x && world.gems.cols.y[i] === y) found.push(i);
  return found;
};

/** Live gems other than the merge gem. */
const normalCount = (world: World): number =>
  world.gems.count - (world.gems.indexOf(world.mergeGemUid) >= 0 ? 1 : 0);

const mergeValue = (world: World): number =>
  world.gems.cols.value[world.gems.indexOf(world.mergeGemUid)] ?? 0;

it('past GEM_CAP a kill still drops its gem at the kill site; one pass folds every off-screen gem into the merge gem (#151)', () => {
  const world = fullWorld(2000, 0);
  // Every gem (x 0..399) lies more than GEM_SWEEP_MARGIN beyond the view around x 2000.
  expect(world.camera.viewRect(GEM_SWEEP_MARGIN).left).toBeGreaterThan(399);
  kill(world, 1, 1, 2000, 10);
  const [drop] = gemsAt(world, 2000, 10);
  expect(drop).toBeDefined();
  expect(world.gems.cols.tier[drop ?? -1]).toBe(GEM_ASSETS.indexOf('gem.blue'));
  expect(world.gems.cols.value[drop ?? -1]).toBe(1);
  // The 400 old gems are one red merge gem (the first gem the backward pass met, x 399, turned in place).
  expect(world.gems.count).toBe(2);
  const merge = world.gems.indexOf(world.mergeGemUid);
  expect([world.gems.cols.x[merge], world.gems.cols.y[merge]]).toEqual([399, 0]);
  expect(world.gems.cols.tier[merge]).toBe(GEM_ASSETS.indexOf('gem.red'));
  expect(mergeValue(world)).toBe(GEM_CAP);
  // The room made holds the next drops without folding anything else.
  kill(world, GEM_CAP - 1, 5, 2000, 20);
  expect(mergeValue(world)).toBe(GEM_CAP);
  expect(normalCount(world)).toBe(GEM_CAP);
  expect(world.gems.count).toBe(GEM_CAP + 1);
});

it('when every gem is on screen, folds only the idle gem farthest from the player into the merge gem', () => {
  // Gems x 0..399 all lie within the view around x 100; the farthest from the player is x 399.
  const world = fullWorld(100, 0);
  const farthestUid = world.gems.uid[gemsAt(world, 399, 0)[0] ?? -1];
  kill(world, 1, 1, 100, 10);
  expect(gemsAt(world, 100, 10)).toHaveLength(1);
  // The farthest gem became the merge gem in place.
  expect(world.mergeGemUid).toBe(farthestUid);
  expect(world.gems.cols.tier[world.gems.indexOf(world.mergeGemUid)]).toBe(
    GEM_ASSETS.indexOf('gem.red'),
  );
  expect(mergeValue(world)).toBe(1);
  expect(world.gems.count).toBe(GEM_CAP + 1);
  // The next overflow folds the next farthest (x 398) into it and removes it.
  const nextUid = world.gems.uid[gemsAt(world, 398, 0)[0] ?? -1] ?? -1;
  kill(world, 1, 5, 100, 20);
  expect(world.gems.indexOf(nextUid)).toBe(-1);
  expect(gemsAt(world, 100, 20)).toHaveLength(1);
  expect(mergeValue(world)).toBe(2);
  expect(world.gems.count).toBe(GEM_CAP + 1);
});

it('conserves gem value past GEM_CAP over 2000 drops: one red merge gem, never more than GEM_CAP normal gems', () => {
  const world = fullWorld(0, 0);
  let dropped = GEM_CAP;
  const values = [1, 5, 2, 40, 1, 1, 7, 12];
  for (let n = 0; n < 2000; n++) {
    // The player wanders and some gems are flying, as in a run.
    moveTo(world, Math.sin(n / 50) * 3000, Math.cos(n / 70) * 2000);
    if (n % 97 === 0) world.gems.cols.state[n % world.gems.count] = GEM_FLYING;
    const xp = values[n % values.length] ?? 1;
    kill(world, 1, xp, world.player.x + 30, world.player.y - 20);
    dropped += xp;
    expect(normalCount(world)).toBeLessThanOrEqual(GEM_CAP);
    expect(world.gems.count).toBeLessThanOrEqual(GEM_CAP + 1);
    expect(onGround(world)).toBe(dropped);
    // Every drop lands at its kill site.
    expect(
      gemsAt(world, Math.fround(world.player.x + 30), Math.fround(world.player.y - 20)).length,
    ).toBeGreaterThan(0);
  }
  const merge = world.gems.indexOf(world.mergeGemUid);
  expect(merge).toBeGreaterThanOrEqual(0);
  expect(world.gems.cols.tier[merge]).toBe(GEM_ASSETS.indexOf('gem.red'));
  let merges = 0;
  for (let i = 0; i < world.gems.count; i++) if (world.gems.uid[i] === world.mergeGemUid) merges++;
  expect(merges).toBe(1);
});

it('creates no paint when the overflow recycles gems: the gem pools only reuse their prewarmed paints', () => {
  const library = {
    create: () => ({ paint: { visible: () => undefined } }),
  } as unknown as AssetSource;
  const layer = { add: () => undefined } as never;
  const pools = createGemPools(library, layer);
  const created = pools.map((p) => p.created);
  const world = fullWorld(100, 0, pools);
  // Blue, green and red drops, first on screen (farthest-gem folds), then walking away (off-screen sweeps).
  for (let n = 0; n < 2000; n++) {
    if (n === 1000) moveTo(world, 5000, 0);
    kill(world, 1, [1, 5, 12][n % 3] ?? 1, world.player.x + (n % 500), 10);
  }
  expect(pools.map((p) => p.created)).toEqual(created);
  expect(world.gems.cols.poolId[world.gems.indexOf(world.mergeGemUid)]).toBe(
    GEM_ASSETS.indexOf('gem.red'),
  );
  expect(world.gems.count).toBe(GEM_CAP + 1);
});

it('falls back to growing one merge gem at the drop when every gem on the ground is flying', () => {
  const world = fullWorld(2000, 0);
  world.gems.cols.state.fill(GEM_FLYING);
  let dropped = GEM_CAP;
  for (const xp of [3, 1, 5]) {
    kill(world, 1, xp, 2000, 10);
    dropped += xp;
  }
  const merge = world.gems.indexOf(world.mergeGemUid);
  expect([world.gems.cols.x[merge], world.gems.cols.y[merge]]).toEqual([2000, 10]);
  expect(world.gems.cols.tier[merge]).toBe(GEM_ASSETS.indexOf('gem.red'));
  expect(mergeValue(world)).toBe(9);
  expect(world.gems.count).toBe(GEM_CAP + 1);
  expect(onGround(world)).toBe(dropped);
});

it('conserves gem value through a whole run: XP collected plus XP on the ground equals the XP of every kill', () => {
  const world = createWorld({ seed: 7 });
  world.player.hp = world.player.maxHp = 1e9;
  let killed = 0;
  for (let i = 0; i < 60 * 60; i++) {
    world.input = { dx: i % 600 < 300 ? 1 : -1, dy: 0 };
    world.step(1 / 60);
    for (let e = 0; e < world.events.count; e++) {
      const event = world.events.items[e];
      if (event?.kind === 'enemyKilled') killed += event.xp;
    }
    // Answer level-ups by spending the XP they took, so the world keeps stepping.
    while (world.pendingLevelUps > 0) world.pendingLevelUps--;
    let spent = 0;
    for (let l = 1; l < world.player.level; l++) spent += xpToNext(l);
    // Collected gem value became XP times `stats.growth` (1.1 in BASE_STATS since #148); no choice changes it here.
    const collected = (spent + world.player.xp) / world.player.stats.growth;
    expect(collected + onGround(world)).toBeCloseTo(killed, 3);
  }
  expect(killed).toBeGreaterThan(20);
  expect(world.player.level).toBeGreaterThan(1);
}, 30_000);

it('creates a new merge gem at the next overflow after the merge gem was collected', () => {
  const world = fullWorld(2000, 0);
  kill(world, 1, 3, 2000, 10);
  // The sweep folded all 400 gems into the merge gem at x 399.
  const firstUid = world.mergeGemUid;
  expect(world.gems.cols.x[world.gems.indexOf(firstUid)]).toBe(399);
  // The player walks there: the merge gem flies in and is collected.
  moveTo(world, 399, 0);
  for (let i = 0; i < 60 && world.mergeGemUid !== NO_GEM; i++) gemSystem(world, 1 / 60);
  expect(world.mergeGemUid).toBe(NO_GEM);
  expect(world.player.xp).toBe(GEM_CAP * world.player.stats.growth);
  // Fill up to the cap again on screen, then overflow once more: the only off-screen gem, the 3-XP drop left at
  // (2000, 10), becomes the new merge gem.
  kill(world, GEM_CAP - world.gems.count, 1, 600, 100);
  expect(world.gems.count).toBe(GEM_CAP);
  kill(world, 1, 4, 700, 200);
  expect(world.mergeGemUid).not.toBe(NO_GEM);
  expect(world.mergeGemUid).not.toBe(firstUid);
  expect(mergeValue(world)).toBe(3);
  expect(world.gems.cols.x[world.gems.indexOf(world.mergeGemUid)]).toBe(2000);
  expect(gemsAt(world, 700, 200)).toHaveLength(1);
  expect(world.gems.count).toBe(GEM_CAP + 1);
});

it('reports live gems as [uid, tier, x, y, value] with rounded positions (the gemPositions field)', () => {
  const world = createWorld({ seed: 1 });
  kill(world, 1, 12, 10.4, -3.6);
  expect(readGemPositions(world)).toEqual([[world.gems.uid[0], 2, 10, -4, 12]]);
});
