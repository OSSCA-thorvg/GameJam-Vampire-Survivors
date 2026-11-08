import { expect, it } from 'vitest';
import { validateLottie } from './lottie';

const image = () => ({ id: 'art', w: 384, h: 384, u: '', p: 'level-up/art.png', e: 0 });
const composition = () => ({
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 30,
  w: 96,
  h: 96,
  assets: [image()],
  layers: [{ ty: 2, refId: 'art', ks: {} }],
});

it('accepts canonical same-owner PNG images and safe shape-only compositions', () => {
  expect(validateLottie(composition(), 'fx/level-up.json')).toMatchObject({
    images: [{ path: 'level-up/art.png', width: 384 }],
    fps: 30,
    lastFrame: 30,
  });
  expect(
    validateLottie(
      { ...composition(), assets: [], layers: [{ ty: 4, shapes: [], ks: {} }] },
      'fx/level-up.json',
    ).images,
  ).toEqual([]);
});

it.each([
  '../art.png',
  '/level-up/art.png',
  'https://evil.test/art.png',
  '//evil.test/a.png',
  'data:image/png;base64,abc',
  'chest-open/art.png',
  'level-up/../art.png',
  'level-up/a%2epng',
  'level-up/a.png?q=1',
])('rejects resource path %s before native load', (path) => {
  const value = composition();
  value.assets[0] = { ...image(), p: path };
  expect(() => validateLottie(value, 'fx/level-up.json')).toThrow();
});

it('rejects external u, embedded resources, duplicate paths/IDs and unknown image references', () => {
  for (const asset of [
    { ...image(), u: 'https://evil.test/' },
    { ...image(), e: 1 },
  ])
    expect(() =>
      validateLottie({ ...composition(), assets: [asset] }, 'fx/level-up.json'),
    ).toThrow();
  expect(() =>
    validateLottie({ ...composition(), assets: [image(), image()] }, 'fx/level-up.json'),
  ).toThrow();
  expect(() =>
    validateLottie(
      { ...composition(), layers: [{ ty: 2, refId: 'unknown', ks: {} }] },
      'fx/level-up.json',
    ),
  ).toThrow();
});

it('rejects expressions, text/audio, unsupported layers and resource budgets', () => {
  for (const ty of [0, 1, 3, 5, 6, 13])
    expect(() =>
      validateLottie(
        { ...composition(), layers: [{ ty, refId: 'art', ks: {} }] },
        'fx/level-up.json',
      ),
    ).toThrow();
  expect(() =>
    validateLottie(
      { ...composition(), layers: [{ ty: 2, refId: 'art', ks: { o: { x: 'time * 2', k: 100 } } }] },
      'fx/level-up.json',
    ),
  ).toThrow(/expressions/);
  expect(() => validateLottie({ ...composition(), fonts: {} }, 'fx/level-up.json')).toThrow(/text/);
  const assets = Array.from({ length: 65 }, (_, i) => ({
    ...image(),
    id: `image-${String(i)}`,
    p: `level-up/art-${String(i)}.png`,
  }));
  expect(() => validateLottie({ ...composition(), assets }, 'fx/level-up.json')).toThrow(/count/);
  const large = assets.slice(0, 3).map((asset) => ({ ...asset, w: 2048, h: 2048 }));
  expect(() => validateLottie({ ...composition(), assets: large }, 'fx/level-up.json')).toThrow(
    /set exceeds/,
  );
});

it.each([
  { fr: Number.MAX_VALUE },
  { ip: -Number.MAX_VALUE, op: Number.MAX_VALUE },
  { fr: Number.MIN_VALUE },
  { ip: 2 ** 30, op: 2 ** 30 + 1 },
  { fr: 1e-30, op: 1e30 },
  { fr: 1e30, op: 1e-30 },
])('rejects timelines that overflow, underflow or collapse in native floats: %j', (patch) => {
  expect(() => validateLottie({ ...composition(), ...patch }, 'fx/level-up.json')).toThrow(
    /timeline/,
  );
});
