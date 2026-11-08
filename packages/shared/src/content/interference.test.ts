import { expect, it } from 'vitest';
import { ASSET_IDS } from '../generated/asset-ids.js';
import { INTERFERENCE_KINDS } from '../protocol.js';
import {
  INTERFERENCE,
  INTERFERENCE_RULES,
  INTERFERENCE_SEND_LIMIT,
  interferenceIndex,
} from './interference.js';

const ids: readonly string[] = ASSET_IDS;

it('defines one interference per InterferenceKind, in protocol order', () => {
  expect(INTERFERENCE.map((d) => d.kind)).toEqual([...INTERFERENCE_KINDS]);
  for (const [i, kind] of INTERFERENCE_KINDS.entries()) expect(interferenceIndex(kind)).toBe(i);
  expect(interferenceIndex('nuke')).toBe(-1);
});

it('gives every interference a positive weight, an ASCII label and a cataloged asset', () => {
  for (const d of INTERFERENCE) {
    expect(d.weight, d.kind).toBeGreaterThan(0);
    expect(d.label, d.kind).toMatch(/^[\x20-\x7e]+$/);
    expect(d.assetId, d.kind).toBe(`pickup.interference.${d.kind}`);
    expect(ids, d.kind).toContain(d.assetId);
  }
});

it('lets the server cap admit every honest burst', () => {
  expect(INTERFERENCE_SEND_LIMIT.burst).toBeGreaterThan(INTERFERENCE_RULES.maxOnGround);
  expect(INTERFERENCE_SEND_LIMIT.perSecond * INTERFERENCE_RULES.minIntervalS).toBeCloseTo(1);
});
