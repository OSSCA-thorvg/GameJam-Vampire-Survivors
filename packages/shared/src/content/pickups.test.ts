import { expect, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { LIGHT_SOURCE, PICKUPS } from './pickups.js';
import { STAT_IDS } from './stats.js';

const ids: readonly string[] = ASSET_IDS;

it('defines exactly the five pickups of ADR 0008 with unique ids', () => {
  expect(PICKUPS.map((p) => p.id)).toEqual([
    'floorChicken',
    'rosary',
    'orologion',
    'vacuum',
    'littleClover',
  ]);
  expect(new Set(PICKUPS.map((p) => p.id)).size).toBe(PICKUPS.length);
});

it('gives every pickup a positive weight, a level gate, a cataloged asset and a valid stat', () => {
  for (const p of PICKUPS) {
    expect(p.weight, p.id).toBeGreaterThan(0);
    expect(Number.isInteger(p.minPlayerLevel) && p.minPlayerLevel >= 1, p.id).toBe(true);
    expect(p.displayName, p.id).not.toBe('');
    expect(p.assetId, p.id).toBe(`pickup.${p.id}`);
    expect(ids, p.id).toContain(p.assetId);
    if (p.effect.kind === 'stat') {
      expect(STAT_IDS, p.id).toContain(p.effect.stat);
      expect(Number.isFinite(p.effect.add) && p.effect.add !== 0, p.id).toBe(true);
    }
  }
});

it('has no gold pickup, name or effect (ADR 0008)', () => {
  expect(JSON.stringify(PICKUPS)).not.toMatch(/gold/i);
});

it('keeps the light source numbers consistent', () => {
  expect(LIGHT_SOURCE.spawnRingMin).toBeLessThan(LIGHT_SOURCE.spawnRingMax);
  expect(LIGHT_SOURCE.spawnRingMax).toBeLessThan(LIGHT_SOURCE.despawnDistance);
  expect(LIGHT_SOURCE.targetCount).toBeLessThanOrEqual(LIGHT_SOURCE.poolSize);
  expect(LIGHT_SOURCE.dropChance).toBeGreaterThan(0);
  expect(LIGHT_SOURCE.dropChance).toBeLessThanOrEqual(1);
});
