import { BASE_MAX_HP, BASE_MOVE_SPEED, BASE_STATS, CHARACTERS } from '@vs/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { readWeapons } from './snapshot';
import { createWorld } from './world';

afterEach(() => {
  vi.restoreAllMocks();
});

it('starts Ember with the Fire Wand at level 1, +0.1 might and 10 HP less', () => {
  const world = createWorld({ seed: 1, characterId: 'ember' });
  expect(world.characterId).toBe('ember');
  expect(readWeapons(world)).toEqual([{ id: 'fireWand', level: 1 }]);
  expect(world.player.stats.might).toBeCloseTo(BASE_STATS.might + 0.1, 10);
  expect(world.player.maxHp).toBe(BASE_MAX_HP - 10);
  expect(world.player.hp).toBe(world.player.maxHp);
});

it('starts Warden with +20 HP and +1 armor, Swift at 115% move speed with the Knife, Aurelia with the Cross', () => {
  const warden = createWorld({ seed: 1, characterId: 'warden' });
  expect(readWeapons(warden)).toEqual([{ id: 'whip', level: 1 }]);
  expect([warden.player.hp, warden.player.maxHp, warden.player.armor]).toEqual([
    BASE_MAX_HP + 20,
    BASE_MAX_HP + 20,
    BASE_STATS.armor + 1,
  ]);
  const swift = createWorld({ seed: 1, characterId: 'swift' });
  expect(readWeapons(swift)).toEqual([{ id: 'knife', level: 1 }]);
  expect(swift.player.moveSpeed).toBeCloseTo(BASE_MOVE_SPEED * 1.15, 10);
  const aurelia = createWorld({ seed: 1, characterId: 'aurelia' });
  expect(readWeapons(aurelia)).toEqual([{ id: 'cross', level: 1 }]);
  expect(aurelia.player.stats.recovery).toBeCloseTo(BASE_STATS.recovery + 0.2, 10);
});

it('yields a valid run for any characterId string: unknown ids fall back to the first character with a warning', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const first = CHARACTERS[0];
  for (const id of ['', 'nobody', 'WARDEN', '__proto__', 'constructor', 'toString']) {
    const world = createWorld({ seed: 7, characterId: id });
    expect(world.characterId, id).toBe(first?.id);
    expect(readWeapons(world), id).toEqual([{ id: first?.startingWeaponId, level: 1 }]);
    expect(world.player.hp, id).toBe(world.player.maxHp);
    expect(Number.isFinite(world.player.moveSpeed), id).toBe(true);
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(world.time, id).toBeCloseTo(1, 10);
  }
  expect(warn).toHaveBeenCalledTimes(6);
});

it('starts every character with exactly its own weapon, full HP and its modifiers applied once', () => {
  for (const c of CHARACTERS) {
    const world = createWorld({ seed: 3, characterId: c.id });
    expect(world.characterId).toBe(c.id);
    expect(readWeapons(world)).toEqual([{ id: c.startingWeaponId, level: 1 }]);
    expect(world.player.characterModifiers).toEqual(c.modifiers);
    expect(world.player.hp).toBe(world.player.maxHp);
  }
});
