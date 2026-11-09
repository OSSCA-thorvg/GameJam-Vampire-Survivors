import { GEM_CAP, xpToNext } from '@vs/shared';
import { expect, it } from 'vitest';
import { gemDropSystem, gemSystem, GEM_ASSETS, NO_GEM } from './gems';
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

it('conserves gem value past GEM_CAP: further drops only grow one red merge gem', () => {
  const world = createWorld({ seed: 1 });
  kill(world, GEM_CAP, 1);
  expect(world.gems.count).toBe(GEM_CAP);
  expect(world.mergeGemUid).toBe(NO_GEM);
  let dropped = GEM_CAP;
  for (const xp of [1, 5, 2, 40, 1, 1, 7]) {
    kill(world, 3, xp);
    dropped += 3 * xp;
    expect(world.gems.count).toBe(GEM_CAP + 1);
    expect(onGround(world)).toBe(dropped);
  }
  const merge = world.gems.indexOf(world.mergeGemUid);
  expect(merge).toBeGreaterThanOrEqual(0);
  expect(world.gems.cols.tier[merge]).toBe(GEM_ASSETS.indexOf('gem.red'));
  expect(world.gems.cols.value[merge]).toBe(dropped - GEM_CAP);
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
  const world = createWorld({ seed: 1 });
  kill(world, GEM_CAP, 1, 5000, 5000);
  kill(world, 2, 3, 0, 0);
  const firstUid = world.mergeGemUid;
  const first = world.gems.indexOf(firstUid);
  expect(world.gems.cols.x[first]).toBe(0);
  expect(world.gems.cols.value[first]).toBe(6);
  // The player stands at the origin: the merge gem flies in and is collected.
  world.player.x = 0;
  world.player.y = 0;
  for (let i = 0; i < 60 && world.mergeGemUid !== NO_GEM; i++) gemSystem(world, 1 / 60);
  expect(world.mergeGemUid).toBe(NO_GEM);
  expect(world.player.xp).toBe(6 * world.player.stats.growth);
  expect(world.gems.count).toBe(GEM_CAP);
  kill(world, 1, 4, 300, 0);
  expect(world.mergeGemUid).not.toBe(NO_GEM);
  expect(world.mergeGemUid).not.toBe(firstUid);
  expect(world.gems.cols.value[world.gems.indexOf(world.mergeGemUid)]).toBe(4);
  expect(world.gems.count).toBe(GEM_CAP + 1);
});

it('reports live gems as [uid, tier, x, y, value] with rounded positions (the gemPositions field)', () => {
  const world = createWorld({ seed: 1 });
  kill(world, 1, 12, 10.4, -3.6);
  expect(readGemPositions(world)).toEqual([[world.gems.uid[0], 2, 10, -4, 12]]);
});
