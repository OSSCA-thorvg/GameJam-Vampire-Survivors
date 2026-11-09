import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { fakePaintLibrary } from '../render/pool-test-helpers';
import { createStressScene, parseStress, parseStressCount, STRESS_SCENARIO_NAMES } from './stress';

it('keeps all 3000 paints reused through 600 fixed steps and five churn cycles', () => {
  const library = fakePaintLibrary(false);
  const scene = createStressScene(library, library.layer, 3000, () => 0);
  for (let step = 0; step < 600; step++) {
    scene.step(1 / 60);
    scene.render();
  }
  expect(scene.snapshot()).toMatchObject({
    entities: 3000,
    paintsCreated: 3000,
    visiblePaints: 3000,
    churnCycles: 5,
  });
  expect(library.create).toHaveBeenCalledTimes(3000);
});

it('supports zero/small scenes, caps numeric counts and refuses reserved named scenarios', () => {
  expect(parseStressCount('')).toBeNull();
  expect(parseStressCount('0')).toBe(0);
  expect(parseStressCount('99999')).toBe(4096);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const value of ['named', '-1', '1.5', 'Infinity'])
    expect(parseStressCount(value)).toBeNull();
  expect(warn).toHaveBeenCalledTimes(4);
  warn.mockRestore();
  for (const count of [0, 7]) {
    const library = fakePaintLibrary(false);
    const scene = createStressScene(library, library.layer, count, () => 0);
    for (let step = 0; step < 240; step++) scene.step(1 / 60);
    scene.render();
    expect(scene.snapshot()).toMatchObject({
      entities: count,
      paintsCreated: count,
      visiblePaints: count,
      churnCycles: 2,
    });
  }
});

it('parses the named #22 scenarios before numeric counts', () => {
  expect(parseStress('enemies-800')).toEqual({ scenario: 'enemies-800' });
  expect(parseStress('lottie-enemy-shared')).toEqual({ scenario: 'lottie-enemy-shared' });
  expect(parseStress('300')).toEqual({ count: 300 });
  expect(parseStress('')).toBeNull();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  expect(parseStress('toString')).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('lists every scenario name in the production bundle guard', () => {
  const guard = readFileSync(
    fileURLToPath(new URL('../../../../../scripts/verify/check-prod-bundle.mjs', import.meta.url)),
    'utf8',
  );
  for (const name of STRESS_SCENARIO_NAMES) expect(guard).toContain(`'${name}'`);
});

it('draws a pooled lottie scene without churn when asked', () => {
  const library = fakePaintLibrary(false);
  const scene = createStressScene(library, library.layer, 400, () => 0, {
    assetId: 'enemy.lottieTest',
    churn: false,
  });
  for (let step = 0; step < 240; step++) scene.step(1 / 60);
  expect(scene.snapshot()).toMatchObject({ entities: 400, paintsCreated: 400, churnCycles: 0 });
  expect(library.create).toHaveBeenCalledWith('enemy.lottieTest');
});
