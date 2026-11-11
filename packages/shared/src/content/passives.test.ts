import { expect, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { PASSIVES } from './passives.js';
import {
  BASE_STATS,
  STAT_IDS,
  effAmount,
  effArea,
  effCooldown,
  effDamage,
  effDuration,
  effSpeed,
} from './stats.js';

const ids: readonly string[] = ASSET_IDS;

it('defines the 8 passives of ADR 0008 with unique ids, levels, valid modifiers and cataloged icons', () => {
  expect(PASSIVES.map((p) => p.id)).toEqual([
    'hollowHeart',
    'emptyTome',
    'bracer',
    'candelabrador',
    'clover',
    'spellbinder',
    'spinach',
    'pummarola',
  ]);
  expect(new Set(PASSIVES.map((p) => p.id)).size).toBe(PASSIVES.length);
  for (const p of PASSIVES) {
    expect(p.maxLevel, p.id).toBeGreaterThanOrEqual(1);
    expect(p.name, p.id).not.toBe('');
    expect(p.description, p.id).not.toBe('');
    expect(p.perLevel.length, p.id).toBeGreaterThan(0);
    for (const m of p.perLevel) {
      expect(STAT_IDS, p.id).toContain(m.stat);
      expect(Number.isFinite(m.add) && m.add !== 0, p.id).toBe(true);
    }
    expect(p.iconId, p.id).toBe(`icon.passive.${p.id}`);
    expect(ids, p.id).toContain(p.iconId);
  }
});

it('leaves every base value unchanged at identity stats and clamps the cooldown at 0.05 s', () => {
  expect(STAT_IDS).toHaveLength(13);
  // BASE_STATS carries the built-in PowerUp equivalent since #148 (trimmed in #173); the helpers are checked at
  // identity factors.
  const identity = { ...BASE_STATS, might: 1, cooldown: 1 };
  for (const base of [0.15, 1, 1.35, 10, 400]) {
    expect(effDamage(base, identity)).toBe(base);
    expect(effArea(base, identity)).toBe(base);
    expect(effCooldown(base, identity)).toBe(base);
    expect(effSpeed(base, identity)).toBe(base);
    expect(effDuration(base, identity)).toBe(base);
    expect(effAmount(base, identity)).toBe(base);
    expect(effDamage(base, BASE_STATS)).toBeCloseTo(base * 1.05, 9);
    expect(effCooldown(base, BASE_STATS)).toBe(base);
  }
  expect(effCooldown(1, { ...BASE_STATS, cooldown: 0.01 })).toBe(0.05);
  expect(effAmount(2, { ...BASE_STATS, amount: 1 })).toBe(3);
  expect(effDamage(10, { ...BASE_STATS, might: 1.5 })).toBe(15);
});

it('carries the built-in PowerUp equivalent in BASE_STATS, since there is no meta progression (#148, #173)', () => {
  expect(BASE_STATS).toMatchObject({
    might: 1.05,
    armor: 0,
    maxHp: 110,
    recovery: 0.1,
    cooldown: 1,
    magnet: 1.25,
    growth: 1.1,
    area: 1,
    amount: 0,
    speed: 1,
    duration: 1,
    moveSpeed: 1,
    luck: 1,
  });
});
