import { expect, it } from 'vitest';
import { createCamera, snapToPixel } from './camera';
import { createWorld } from './world';

it('viewRect(0) is the 1280 × 720 view centred on the player', () => {
  const world = createWorld({ seed: 1 });
  world.input = { dx: -1, dy: 1 };
  for (let i = 0; i < 90; i++) world.step(1 / 60);
  expect([world.camera.x, world.camera.y]).toEqual([world.player.x, world.player.y]);
  const rect = world.camera.viewRect(0);
  expect(rect.right - rect.left).toBeCloseTo(1280, 9);
  expect(rect.bottom - rect.top).toBeCloseTo(720, 9);
  expect((rect.left + rect.right) / 2).toBeCloseTo(world.player.x, 9);
  expect((rect.top + rect.bottom) / 2).toBeCloseTo(world.player.y, 9);
});

it('viewRect expands by the margin on each side and reuses one object', () => {
  const camera = createCamera();
  const a = camera.viewRect(100);
  expect(a).toEqual({ left: -740, top: -460, right: 740, bottom: 460 });
  expect(camera.viewRect(0)).toBe(a);
});

it('snaps to whole device pixels', () => {
  expect(snapToPixel(10.3, 2)).toBe(10.5);
  expect(snapToPixel(-3.26, 1.5) * 1.5).toBeCloseTo(Math.round(-3.26 * 1.5), 9);
});
