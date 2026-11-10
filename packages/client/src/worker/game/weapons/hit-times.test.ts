import { BASE_STATS, MAX_WEAPON_SLOTS } from '@vs/shared';
import { expect, it } from 'vitest';
import { indexEnemies, target } from '../combat-test-helpers';
import { NEVER_HIT } from '../enemies';
import { armed, DT, effectiveLevel } from './arm-test-helpers';
import { kingBible } from './patterns/kingBible';

it('keeps one hit-time column per weapon slot, NEVER_HIT on spawn', () => {
  const { world } = armed('kingBible');
  expect(world.enemyHitTimes).toHaveLength(MAX_WEAPON_SLOTS);
  const slot = target(world, 'bat', 0, 0);
  for (const hitT of world.enemyHitTimes) expect(hitT[slot]).toBe(NEVER_HIT);
});

it('moves hit times with their enemy through a swap-remove of another enemy', () => {
  // One book hit: the L1 damage 10 after BASE_STATS.might (#148), stored in the float32 HP column.
  const once = Math.fround(1000 - 10 * BASE_STATS.might);
  const twice = Math.fround(once - 10 * BASE_STATS.might);
  const { world, w } = armed('kingBible');
  const lv = { ...effectiveLevel(world, w), speed: 0 };
  w.activeLeft = 10;
  const hitT = world.enemyHitTimes[w.slot];
  if (!hitT) throw new Error('no column');
  // Slot 0: an enemy far from the book; slot 1: a ghoul under the still book at (75, 0).
  const other = target(world, 'bat', -500, 0);
  const ghoul = target(world, 'ghoul', 75, 0);
  const ghoulUid = world.enemies.uid[ghoul] ?? -1;
  world.time = 10;
  indexEnemies(world);
  kingBible.update?.(world.weaponContext, w, lv, DT);
  expect(world.enemies.cols.hp[ghoul]).toBe(once);
  expect(hitT[ghoul]).toBe(10);
  // Removing slot 0 moves the ghoul into it; its hit time moves along, so the book does not hit it again yet.
  world.enemies.remove(other);
  const moved = world.enemies.indexOf(ghoulUid);
  expect(moved).toBe(0);
  expect(hitT[moved]).toBe(10);
  world.time = 10.25;
  indexEnemies(world);
  kingBible.update?.(world.weaponContext, w, lv, DT);
  expect(world.enemies.cols.hp[moved]).toBe(once);
  // A new enemy in the freed slot 1 starts unhit, so the book hits it at once.
  const fresh = target(world, 'ghoul', 75, 0);
  expect(fresh).toBe(1);
  expect(hitT[fresh]).toBe(NEVER_HIT);
  indexEnemies(world);
  kingBible.update?.(world.weaponContext, w, lv, DT);
  expect(world.enemies.cols.hp[fresh]).toBe(once);
  expect(world.enemies.cols.hp[moved]).toBe(once);
  world.time = 10.5;
  indexEnemies(world);
  kingBible.update?.(world.weaponContext, w, lv, DT);
  expect(world.enemies.cols.hp[moved]).toBe(twice);
});
