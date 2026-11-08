import { expect, it } from 'vitest';
import { ELITE } from './chests.js';
import { MAX_ENEMY_RADIUS, PLAYER_RADIUS } from './constants.js';
import { ENEMIES, ENEMY_LIST } from './enemies.js';

it('keeps elite-scaled and boss radii within MAX_ENEMY_RADIUS, so the contact and weapon queries reach every enemy', () => {
  for (const id of ENEMY_LIST) {
    const def = ENEMIES[id];
    expect(def.radius, id).toBeGreaterThan(0);
    const largest = def.boss ? def.radius : def.radius * ELITE.scale;
    expect(largest, id).toBeLessThanOrEqual(MAX_ENEMY_RADIUS);
  }
  // reaper10's and Death's radius; the largest elite, a wraith, is 36.
  expect(MAX_ENEMY_RADIUS).toBe(48);
  expect(PLAYER_RADIUS).toBeGreaterThan(0);
});

it('makes reaper5, reaper10 and Death bosses that always drop a chest', () => {
  for (const id of ['reaper5', 'reaper10', 'death'] as const) {
    expect(ENEMIES[id].boss, id).toEqual({ tether: true, dropsChest: 'always' });
    expect(ENEMIES[id].assetId, id).toBe(`boss.${id}`);
  }
  expect(ENEMIES.bat.boss).toBeUndefined();
  expect(ENEMIES.ghoul.boss).toBeUndefined();
});
