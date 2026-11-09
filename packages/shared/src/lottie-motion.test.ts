import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateLottie } from './lottie';
import { lottieProfile, type LottieProfile } from './lottie-motion';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('fixture object');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('fixture list');
  return value;
}
function player() {
  const value: unknown = JSON.parse(
    readFileSync(new URL('./__fixtures__/player-motion.json', import.meta.url), 'utf8'),
  );
  return object(value);
}
const check = (value: unknown, profile: LottieProfile = 'player') =>
  validateLottie(value, 'characters/swift.json', profile);
const parent = (value: Record<string, unknown>) => object(list(value.layers)[0]);

it('selects only the closed actor inventory and validates the bounded native player bank', () => {
  expect(lottieProfile('player.swift')).toBe('player');
  expect(lottieProfile('enemy.wraith')).toBe('actor');
  expect(lottieProfile('boss.death')).toBe('boss');
  expect(lottieProfile('portrait.swift')).toBe('flat');
  expect(lottieProfile('fx.hit')).toBe('flat');
  const value = check(player());
  expect(value.images).toHaveLength(12);
  expect(value.motion).toEqual({
    kind: 'player',
    idle: { start: 0, frames: 600, poseFrames: 75 },
    move: { start: 600, frames: 600, poseFrames: 12.5 },
  });
  expect(() => check(player(), 'flat')).toThrow();
});

it.each([
  [
    'overlapping markers',
    (value: Record<string, unknown>) => {
      object(list(value.markers)[1]).tm = 599;
    },
  ],
  [
    'recursive precomp',
    (value: Record<string, unknown>) => {
      const bank = object(list(value.assets).find((asset) => object(asset).id === 'poses'));
      object(list(bank.layers)[0]).ty = 0;
    },
  ],
  [
    'arbitrary opacity slot',
    (value: Record<string, unknown>) => {
      object(object(parent(value).ks).o).sid = 'other';
    },
  ],
  [
    'slot outside its permitted property',
    (value: Record<string, unknown>) => {
      parent(value).nm = { sid: 'damage' };
    },
  ],
  [
    'interpolated time remap',
    (value: Record<string, unknown>) => {
      object(list(object(parent(value).tm).k)[0]).h = 0;
    },
  ],
  [
    'unbounded time remap',
    (value: Record<string, unknown>) => {
      object(list(object(parent(value).tm).k)[0]).s = [Infinity];
    },
  ],
  [
    'four-times pose resources',
    (value: Record<string, unknown>) => {
      object(list(value.assets)[0]).w = 32;
    },
  ],
  [
    'unvalidated image metadata',
    (value: Record<string, unknown>) => {
      object(list(value.assets)[0]).custom = { sid: 'damage' };
    },
  ],
] as const)('rejects %s before native loading', (_name, mutate) => {
  const value = player();
  mutate(value);
  expect(() => check(value)).toThrow();
});

it('keeps ordinary actor resources within 1MiB while allowing the 4MiB boss profile', () => {
  const value = player();
  const bank = object(list(value.assets).find((asset) => object(asset).id === 'poses'));
  const layers = list(bank.layers).map((item, index) => {
    const layer = object(item);
    const duration = index < 4 ? 6 : 1;
    const start = index < 4 ? index * duration : 24 + index - 4;
    return { ...layer, ip: start, op: start + duration };
  });
  const actor = {
    ...value,
    w: 128,
    h: 128,
    fr: 12,
    op: 32,
    markers: [
      { cm: 'idle', tm: 0, dr: 24 },
      { cm: 'move', tm: 24, dr: 8 },
    ],
    layers: [{ ...parent(value), w: 128, h: 128, op: 32 }],
    assets: [
      ...list(value.assets)
        .filter((item) => object(item).id !== 'poses')
        .map((item) => ({ ...object(item), w: 256, h: 256 })),
      { id: 'poses', w: 128, h: 128, fr: 12, layers },
    ],
  };
  delete object(actor.layers[0]).tm;
  expect(check(actor, 'boss').motion?.kind).toBe('actor');
  expect(() => check(actor, 'actor')).toThrow(/budget/);
});
