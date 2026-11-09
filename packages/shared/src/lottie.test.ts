import { expect, it } from 'vitest';
import { validateLottie } from './lottie';
import { EXTENDED_LOTTIE_IDS, lottieProfile } from './lottie-motion';

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

// ADR 0020: precompositions, alpha track mattes and (in the manifest) bilinear images only for `ui.splash`.
const splashImage = () => ({ id: '2', w: 1080, h: 1350, u: '', p: 'splash/logo.png', e: 0 });
const splashShape = (extra: Record<string, unknown> = {}) => ({
  ty: 4,
  shapes: [],
  ks: {},
  ...extra,
});
const splash = () => ({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 210,
  w: 1920,
  h: 1080,
  assets: [
    splashImage(),
    {
      id: 'logo',
      nm: 'ThorVG logo',
      fr: 30,
      layers: [splashShape(), { ty: 2, refId: '2', ks: {} }],
    },
  ] as Record<string, unknown>[],
  layers: [
    splashShape({ td: 1 }),
    { ty: 0, refId: 'logo', tt: 1, w: 1920, h: 1080, ks: {} },
    splashShape({ tt: 1 }),
  ] as Record<string, unknown>[],
});
const asSplash = (value: unknown) =>
  validateLottie(value, 'ui/splash.json', lottieProfile('ui.splash'));

it('admits the splash structure only under the ui.splash profile', () => {
  expect(EXTENDED_LOTTIE_IDS).toEqual(['ui.splash']);
  expect(asSplash(splash())).toMatchObject({
    images: [{ id: '2', path: 'splash/logo.png' }],
    lastFrame: 210,
  });
  for (const id of ['fx.levelUp', 'enemy.lottieTest'])
    expect(() => validateLottie(splash(), 'ui/splash.json', lottieProfile(id))).toThrow();
  const matteOnly = {
    ...composition(),
    layers: [{ ty: 4, shapes: [], ks: {}, tt: 1 }],
    assets: [],
  };
  expect(() =>
    validateLottie(matteOnly, 'fx/chest-open.json', lottieProfile('fx.chestOpen')),
  ).toThrow(/Unsupported/);
});

it.each<[string, (value: ReturnType<typeof splash>) => void]>([
  [
    'a nested precomposition layer',
    (v) => {
      (v.assets[1]?.layers as unknown[]).push({ ty: 0, refId: 'logo', w: 10, h: 10, ks: {} });
    },
  ],
  ['tt 2', (v) => void Object.assign(v.layers[2] ?? {}, { tt: 2 })],
  ['td 2', (v) => void Object.assign(v.layers[0] ?? {}, { td: 2 })],
  [
    'an unknown precomposition refId',
    (v) => void Object.assign(v.layers[1] ?? {}, { refId: 'nope' }),
  ],
  [
    'an unreferenced precomposition',
    (v) => {
      v.assets.push({ id: 'spare', layers: [] });
    },
  ],
  [
    'a precomposition referenced twice',
    (v) => {
      v.layers.push({ ty: 0, refId: 'logo', w: 1920, h: 1080, ks: {} });
    },
  ],
  [
    'a precomposition asset with p',
    (v) => void Object.assign(v.assets[1] ?? {}, { p: 'splash/x.png' }),
  ],
  [
    '65 layers in total',
    (v) => {
      (v.assets[1]?.layers as unknown[]).push(...Array.from({ length: 61 }, () => splashShape()));
    },
  ],
  ['masksProperties', (v) => void Object.assign(v.layers[0] ?? {}, { masksProperties: [] })],
  ['a layer time remap', (v) => void Object.assign(v.layers[1] ?? {}, { tm: { a: 0, k: 0 } })],
  [
    'a data: image path',
    (v) => void Object.assign(v.assets[0] ?? {}, { p: 'data:image/webp;base64,AAAA', e: 1 }),
  ],
  [
    'nine precompositions',
    (v) => {
      for (let i = 0; i < 8; i++) {
        v.assets.push({ id: `p${String(i)}`, layers: [] });
        v.layers.push({ ty: 0, refId: `p${String(i)}`, w: 8, h: 8, ks: {} });
      }
    },
  ],
])('rejects a splash with %s', (_name, patch) => {
  const value = splash();
  patch(value);
  expect(() => asSplash(value)).toThrow();
});
