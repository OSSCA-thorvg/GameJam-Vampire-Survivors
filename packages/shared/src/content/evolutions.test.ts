import { expect, expectTypeOf, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { CHEST_REWARD_KINDS, type ChestReward } from './chests.js';
import { EVOLUTIONS } from './evolutions.js';
import { PASSIVES } from './passives.js';
import { WEAPONS, WEAPON_LIST } from './weapons.js';

const ids: readonly string[] = ASSET_IDS;

it('has the 8 pairs of ADR 0008, each weapon and passive in exactly one', () => {
  expect(EVOLUTIONS).toHaveLength(8);
  const passiveIds = PASSIVES.map((p) => p.id);
  for (const e of EVOLUTIONS) {
    expect(WEAPON_LIST, e.weaponId).toContain(e.weaponId);
    expect(passiveIds, e.passiveId).toContain(e.passiveId);
    expect(WEAPONS[e.intoWeaponId].evolved, e.intoWeaponId).toBe(true);
    expect(WEAPONS[e.intoWeaponId].pattern, e.intoWeaponId).toBe(WEAPONS[e.weaponId].pattern);
  }
  for (const key of ['weaponId', 'passiveId', 'intoWeaponId'] as const)
    expect(new Set(EVOLUTIONS.map((e) => e[key])).size, key).toBe(8);
  expect(EVOLUTIONS.map((e) => `${e.weaponId}+${e.passiveId}=${e.intoWeaponId}`)).toEqual([
    'whip+hollowHeart=bloodyTear',
    'magicWand+emptyTome=holyWand',
    'knife+bracer=thousandEdge',
    'axe+candelabrador=deathSpiral',
    'cross+clover=heavenSword',
    'kingBible+spellbinder=unholyVespers',
    'fireWand+spinach=hellfire',
    'garlic+pummarola=soulEater',
  ]);
});

it('gives every evolved weapon one level, no level text and cataloged art', () => {
  const evolved = Object.values(WEAPONS).filter((w) => w.evolved);
  expect(evolved).toHaveLength(8);
  for (const def of evolved) {
    expect(def.maxLevel, def.id).toBe(1);
    expect(def.levels, def.id).toHaveLength(1);
    expect(def.levelText, def.id).toHaveLength(0);
    expect(WEAPON_LIST, def.id).not.toContain(def.id);
    expect(def.assetId).toBe(`weapon.${def.id}`);
    expect(def.iconId).toBe(`icon.weapon.${def.id}`);
    expect(ids, def.id).toContain(def.assetId);
    expect(ids, def.id).toContain(def.iconId);
  }
});

it("builds each evolution's level from its base's level 8 with the issue's overrides", () => {
  const l8 = (id: keyof typeof WEAPONS) => WEAPONS[id].levels[7];
  const one = (id: keyof typeof WEAPONS) => WEAPONS[id].levels[0];
  expect(one('bloodyTear')).toEqual({ ...l8('whip'), damage: 80, healEveryHits: 10 });
  expect(one('holyWand')).toEqual({ ...l8('magicWand'), cooldownSec: 0.1 });
  expect(one('thousandEdge')).toEqual({ ...l8('knife'), cooldownSec: 0.1, amount: 1 });
  expect(one('deathSpiral')).toEqual({
    ...l8('axe'),
    amount: 9,
    radial: true,
    pierce: Infinity,
    speed: 300,
  });
  expect(one('heavenSword')).toEqual({
    ...l8('cross'),
    damage: 140,
    critChance: 0.2,
    critMultiplier: 2,
  });
  expect(one('unholyVespers')).toEqual({ ...l8('kingBible'), permanent: true });
  expect(one('hellfire')).toEqual({ ...l8('fireWand'), pierce: Infinity, area: 2 });
  expect(one('soulEater')?.area).toBeCloseTo(2.7);
  expect(one('soulEater')?.healEveryHits).toBe(10);
});

it('has no gold reward kind, in the type and at runtime', () => {
  expectTypeOf<Extract<ChestReward['kind'], 'gold'>>().toEqualTypeOf<never>();
  expectTypeOf<ChestReward['kind']>().toEqualTypeOf<(typeof CHEST_REWARD_KINDS)[number]>();
  expect([...CHEST_REWARD_KINDS].sort()).toEqual(['evolve', 'heal', 'levelUp']);
  expect(CHEST_REWARD_KINDS.some((k) => /gold|coin/i.test(k))).toBe(false);
});
