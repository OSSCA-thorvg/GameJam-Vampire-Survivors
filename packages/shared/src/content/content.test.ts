import { expect, it } from 'vitest';
import { MAX_ENEMY_RADIUS, PLAYER_RADIUS } from './constants.js';
import { ENEMIES, ENEMY_LIST } from './enemies.js';

it('keeps every enemy radius within MAX_ENEMY_RADIUS, so the contact query reaches every enemy', () => {
  for (const id of ENEMY_LIST) {
    expect(ENEMIES[id].radius, id).toBeGreaterThan(0);
    expect(ENEMIES[id].radius, id).toBeLessThanOrEqual(MAX_ENEMY_RADIUS);
  }
  expect(PLAYER_RADIUS).toBeGreaterThan(0);
});
