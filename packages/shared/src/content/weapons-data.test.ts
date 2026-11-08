import { expect, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { WEAPONS, WEAPON_LIST } from './weapons.js';

const ids: readonly string[] = ASSET_IDS;

it('gives every base weapon full stats for levels 1–8, upgrade texts for 2–8 and cataloged art', () => {
  expect(new Set(WEAPON_LIST).size).toBe(WEAPON_LIST.length);
  for (const id of WEAPON_LIST) {
    const def = WEAPONS[id];
    expect(def.id, id).toBe(id);
    expect(def.pattern, id).toBe(id);
    expect(def.maxLevel, id).toBe(8);
    expect(def.levels, id).toHaveLength(def.maxLevel);
    expect(def.levelText, id).toHaveLength(def.maxLevel - 1);
    for (const [i, lv] of def.levels.entries()) {
      const at = `${id} L${String(i + 1)}`;
      expect(lv.cooldownSec, at).toBeGreaterThan(0);
      expect(lv.damage, at).toBeGreaterThan(0);
      expect(lv.amount, at).toBeGreaterThanOrEqual(1);
      expect(lv.pierce, at).toBeGreaterThanOrEqual(1);
      expect(lv.area, at).toBeGreaterThan(0);
      for (const value of Object.values(lv)) expect(Number.isNaN(value), at).toBe(false);
    }
    expect(ids, id).toContain(def.assetId);
    expect(ids, id).toContain(def.iconId);
  }
});

it('matches the issue tables at their corners: Whip L1 and L8, Magic Wand L1 and L8', () => {
  expect(WEAPONS.whip.levels[0]).toEqual({
    damage: 10,
    cooldownSec: 1.35,
    area: 1,
    speed: 0,
    amount: 1,
    durationSec: 0.15,
    pierce: Infinity,
    knockback: 200,
  });
  expect(WEAPONS.whip.levels[7]).toMatchObject({ damage: 40, area: 1.2, amount: 2 });
  expect(WEAPONS.magicWand.levels[0]).toEqual({
    damage: 10,
    cooldownSec: 1.2,
    area: 1,
    speed: 400,
    amount: 1,
    durationSec: 2,
    pierce: 1,
    knockback: 100,
  });
  expect(WEAPONS.magicWand.levels[7]).toMatchObject({
    damage: 30,
    cooldownSec: 1,
    amount: 4,
    pierce: 2,
  });
});

it('expands the #13 tables: flat steps add, percent steps add fractions of L1', () => {
  expect(WEAPON_LIST).toEqual([
    'whip',
    'magicWand',
    'knife',
    'axe',
    'cross',
    'kingBible',
    'fireWand',
    'garlic',
  ]);
  expect(WEAPONS.knife.levels[0]).toEqual({
    damage: 6.5,
    cooldownSec: 1,
    area: 1,
    speed: 500,
    amount: 1,
    durationSec: 2,
    pierce: 1,
    knockback: 50,
    burstIntervalSec: 0.05,
  });
  expect(WEAPONS.knife.levels[7]).toMatchObject({ damage: 16.5, amount: 6, pierce: 3 });
  expect(WEAPONS.axe.levels[7]).toMatchObject({ damage: 80, amount: 3, pierce: 7, gravity: 900 });
  expect(WEAPONS.cross.levels[7]).toMatchObject({
    damage: 70,
    area: 1.2,
    speed: 600,
    amount: 2,
    pierce: Infinity,
    returnAfter: 0.6,
  });
  expect(WEAPONS.kingBible.levels[7]).toMatchObject({
    damage: 30,
    amount: 4,
    speed: 270,
    area: 1.5,
    durationSec: 4,
    orbitRadius: 75,
    hitCooldown: 0.5,
  });
  expect(WEAPONS.fireWand.levels[7]).toMatchObject({ damage: 90, speed: 600, amount: 3 });
  expect(WEAPONS.garlic.levels[7]).toMatchObject({ damage: 9, area: 1.8, cooldownSec: 1.1 });
});
