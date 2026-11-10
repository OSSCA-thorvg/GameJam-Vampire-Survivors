import { BASE_PICKUP_RANGE, BASE_STATS } from '@vs/shared';
import { expect, it } from 'vitest';
import { dropGem, GEM_SWEEP_MARGIN, gemSystem, GEM_FLYING, GEM_IDLE } from './gems';
import { createWorld } from './world';

/** A value-1 gem is worth `BASE_STATS.growth` XP once collected (#12, 1.1 since #148). */
const world = () => {
  const w = createWorld({ seed: 1 });
  w.player.x = 0;
  w.player.y = 0;
  return w;
};

it('pulls in a gem 50 units away and collects it within 1 s while the player stands still', () => {
  const w = world();
  dropGem(w, 50, 0, 1, w.player.x, w.player.y, w.camera.viewRect(GEM_SWEEP_MARGIN));
  let t = 0;
  while (w.gems.count > 0 && t < 1) {
    gemSystem(w, 1 / 60);
    t += 1 / 60;
  }
  expect(w.gems.count).toBe(0);
  expect(t).toBeLessThan(1);
  expect(w.player.xp).toBe(BASE_STATS.growth);
});

it('leaves a gem 200 units away untouched, idle, forever', () => {
  const w = world();
  dropGem(w, 0, 200, 5, w.player.x, w.player.y, w.camera.viewRect(GEM_SWEEP_MARGIN));
  for (let i = 0; i < 600; i++) gemSystem(w, 1 / 60);
  expect(w.gems.count).toBe(1);
  expect(w.gems.cols.state[0]).toBe(GEM_IDLE);
  expect([w.gems.cols.x[0], w.gems.cols.y[0]]).toEqual([0, 200]);
  expect(w.player.xp).toBe(0);
});

it('keeps chasing the player once flying, even when the player walks out of the magnet range', () => {
  const w = world();
  dropGem(
    w,
    BASE_PICKUP_RANGE - 1,
    0,
    1,
    w.player.x,
    w.player.y,
    w.camera.viewRect(GEM_SWEEP_MARGIN),
  );
  gemSystem(w, 1 / 60);
  expect(w.gems.cols.state[0]).toBe(GEM_FLYING);
  w.player.x = -200;
  for (let i = 0; i < 120 && w.gems.count > 0; i++) gemSystem(w, 1 / 60);
  expect(w.gems.count).toBe(0);
  expect(w.player.xp).toBe(BASE_STATS.growth);
});

it('scales the range by stats.magnet and collected XP by stats.growth (#12)', () => {
  const w = world();
  w.player.stats.magnet = 2;
  w.player.stats.growth = 1.5;
  dropGem(w, 100, 0, 2, w.player.x, w.player.y, w.camera.viewRect(GEM_SWEEP_MARGIN));
  for (let i = 0; i < 120 && w.gems.count > 0; i++) gemSystem(w, 1 / 60);
  expect(w.player.xp).toBe(3);
});
