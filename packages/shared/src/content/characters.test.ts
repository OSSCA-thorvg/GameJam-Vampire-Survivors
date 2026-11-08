import { expect, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { CHARACTERS, findCharacter } from './characters.js';
import { BASE_MOVE_SPEED } from './constants.js';
import { ENEMIES } from './enemies.js';
import { BASE_STATS, STAT_IDS, formatModifier } from './stats.js';
import { WEAPONS } from './weapons.js';

const ids: readonly string[] = ASSET_IDS;

it('defines the four characters with unique ids, distinct starting weapons and cataloged art', () => {
  expect(CHARACTERS.map((c) => c.id)).toEqual(['warden', 'ember', 'swift', 'aurelia']);
  expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
  expect(new Set(CHARACTERS.map((c) => c.startingWeaponId)).size).toBe(CHARACTERS.length);
  for (const c of CHARACTERS) {
    expect(WEAPONS[c.startingWeaponId], c.id).toBeDefined();
    expect(c.spriteId, c.id).toBe(`player.${c.id}`);
    expect(c.portraitId, c.id).toBe(`portrait.${c.id}`);
    expect(ids, c.id).toContain(c.spriteId);
    expect(ids, c.id).toContain(c.portraitId);
    expect(c.displayName, c.id).not.toBe('');
    expect(c.description, c.id).not.toBe('');
    expect(c.modifiers.length, c.id).toBeGreaterThan(0);
    for (const m of c.modifiers) {
      expect(STAT_IDS, c.id).toContain(m.stat);
      expect(Number.isFinite(m.add) && m.add !== 0, c.id).toBe(true);
    }
  }
});

it('starts every character faster than a bat, so an attentive player can outrun bats (#105)', () => {
  for (const c of CHARACTERS) {
    const factor = c.modifiers
      .filter((m) => m.stat === 'moveSpeed')
      .reduce((sum, m) => sum + m.add, BASE_STATS.moveSpeed);
    expect(BASE_MOVE_SPEED * factor, c.id).toBeGreaterThan(ENEMIES.bat.speed);
  }
  // 0.85 × BASE_MOVE_SPEED (initial value, untuned); the slowest character, Warden, moves 133.
  expect(ENEMIES.bat.speed).toBe(Math.round(0.85 * BASE_MOVE_SPEED));
});

it('finds a character by id and returns undefined for an unknown id', () => {
  expect(findCharacter('ember')?.startingWeaponId).toBe('fireWand');
  expect(findCharacter('nobody')).toBeUndefined();
});

it('formats flat stats as signed numbers and factor stats as signed percents', () => {
  expect(formatModifier({ stat: 'maxHp', add: 20 })).toBe('+20 Max HP');
  expect(formatModifier({ stat: 'maxHp', add: -10 })).toBe('−10 Max HP');
  expect(formatModifier({ stat: 'armor', add: 1 })).toBe('+1 Armor');
  expect(formatModifier({ stat: 'recovery', add: 0.2 })).toBe('+0.2 Recovery');
  expect(formatModifier({ stat: 'moveSpeed', add: -0.05 })).toBe('−5% Move speed');
  expect(formatModifier({ stat: 'moveSpeed', add: 0.15 })).toBe('+15% Move speed');
  expect(formatModifier({ stat: 'might', add: 0.1 })).toBe('+10% Might');
  expect(formatModifier({ stat: 'speed', add: 0.3 })).toBe('+30% Projectile speed');
});
