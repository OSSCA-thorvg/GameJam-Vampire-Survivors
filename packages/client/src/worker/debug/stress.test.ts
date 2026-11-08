import { expect, it, vi } from 'vitest';
import { fakePaintLibrary } from '../render/pool-test-helpers';
import { createStressScene, parseStressCount } from './stress';

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
