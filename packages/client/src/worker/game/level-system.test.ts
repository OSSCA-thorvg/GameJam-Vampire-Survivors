import { xpToNext } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import type { WorkerToMain } from '../../protocol/worker-messages';
import { FX_ASSETS } from './fx';
import { createLevelUpFlow, levelSystem, xpForNextLevel } from './level';
import { addWeapon } from './weapons/owned';
import { createWorld } from './world';

function setup() {
  const world = createWorld({ seed: 3 });
  world.weapons.length = 0;
  const posted: Extract<WorkerToMain, { type: 'levelUp' }>[] = [];
  const pause = vi.fn();
  const resume = vi.fn();
  const flow = createLevelUpFlow({ post: (m) => posted.push(m), pause, resume });
  return { world, posted, pause, resume, flow };
}

it('turns 100 XP at level 1 into several queued level-ups, presented one after another', () => {
  const { world, posted, pause, resume, flow } = setup();
  world.player.xp = 100;
  levelSystem(world);
  // 5 + 15 + 25 + 35 = 80 ≤ 100 < 80 + 45: level 5 with 20 XP left.
  expect(world.player.level).toBe(5);
  expect(world.player.xp).toBe(20);
  expect(world.pendingLevelUps).toBe(4);
  expect(world.stats.level).toBe(5);
  // One level-up ring for the whole gain.
  expect(world.fx.count).toBe(1);
  expect(world.fx.cols.ttl[0]).toBe(1);

  flow.afterStep(world);
  flow.afterStep(world);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(posted.map((m) => m.level)).toEqual([2]);
  for (const level of [3, 4, 5]) {
    flow.choose(world, 0);
    expect(posted.at(-1)?.level).toBe(level);
    expect(resume).not.toHaveBeenCalled();
  }
  flow.choose(world, 0);
  expect(world.pendingLevelUps).toBe(0);
  expect(flow.open).toBe(false);
  expect(resume).toHaveBeenCalledTimes(1);
  expect(posted).toHaveLength(4);
  // Each choice was applied: four options taken from two weapons (new, then upgrades).
  expect(world.weapons.reduce((sum, w) => sum + w.level, 0)).toBe(4);
});

it('freezes the world while a level-up is pending, and steps again after the choice with no time jump', () => {
  const { world, flow } = setup();
  world.player.xp = xpForNextLevel(world);
  world.step(1 / 60);
  flow.afterStep(world);
  expect(world.pendingLevelUps).toBe(1);
  const time = world.time;
  const enemies = Float32Array.from(world.enemies.cols.x);
  for (let i = 0; i < 120; i++) world.step(1 / 60);
  expect(world.time).toBe(time);
  expect(world.enemies.cols.x).toEqual(enemies);
  flow.choose(world, 0);
  world.step(1 / 60);
  expect(world.time).toBeCloseTo(time + 1 / 60, 9);
});

it('ignores an out-of-range choice and keeps the screen open', () => {
  const { world, posted, flow } = setup();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  world.pendingLevelUps = 1;
  flow.afterStep(world);
  flow.choose(world, 7);
  flow.choose(world, -1);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(world.pendingLevelUps).toBe(1);
  expect(posted).toHaveLength(1);
  expect(flow.open).toBe(true);
  flow.reset();
  expect(flow.open).toBe(false);
  warn.mockRestore();
});

it('heals by LEVELUP_HEAL, capped at maxHp, when the heal is the only option', () => {
  const { world, posted, flow } = setup();
  addWeapon(world, 'whip');
  addWeapon(world, 'magicWand');
  for (const w of world.weapons) w.level = w.def.maxLevel;
  world.pendingLevelUps = 1;
  world.player.hp = 90;
  flow.afterStep(world);
  expect(posted[0]?.options.map((o) => o.kind)).toEqual(['heal']);
  flow.choose(world, 0);
  expect(world.player.hp).toBe(world.player.maxHp);
});

it('grants exactly the XP missing for the next level (the L debug key)', () => {
  const { world } = setup();
  world.player.xp = 2;
  expect(xpForNextLevel(world)).toBe(xpToNext(1) - 2);
  world.player.xp += xpForNextLevel(world);
  levelSystem(world);
  expect(world.player.level).toBe(2);
  expect(world.player.xp).toBe(0);
  expect(world.pendingLevelUps).toBe(1);
  expect(FX_ASSETS).toContain('fx.levelUp');
});
