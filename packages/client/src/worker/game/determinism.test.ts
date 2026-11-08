import { expect, it } from 'vitest';
import type { Axis } from '../../protocol/worker-messages';
import { createWorld, type World } from './world';

/** The same scripted input for every world: a few seconds per direction, with idle stretches. */
function script(step: number): { dx: Axis; dy: Axis } {
  const phase = Math.floor(step / 300) % 6;
  const dirs: [Axis, Axis][] = [
    [1, 0],
    [0, 0],
    [1, 1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ];
  const [dx, dy] = dirs[phase] ?? [0, 0];
  return { dx, dy };
}

function run(seed: number, steps: number, noise?: (world: World) => void): World {
  const world = createWorld({ seed });
  for (let i = 0; i < steps; i++) {
    world.input = script(i);
    noise?.(world);
    world.step(1 / 60);
  }
  return world;
}

it('gives the same enemy positions after 60 s for the same seed and input', () => {
  const a = run(1234, 3600);
  const b = run(1234, 3600);
  expect(a.enemies.count).toBeGreaterThan(15);
  expect(b.enemies.count).toBe(a.enemies.count);
  expect(b.enemies.cols.x).toEqual(a.enemies.cols.x);
  expect(b.enemies.cols.y).toEqual(a.enemies.cols.y);
  expect(b.enemies.cols.type).toEqual(a.enemies.cols.type);
});

it("keeps the spawner's draws independent of other systems' random calls", () => {
  const a = run(99, 3600);
  // Another system drawing from the root stream and its own forks every step must not shift the spawn schedule.
  const b = run(99, 3600, (world) => {
    world.rng.next();
    world.rng.fork('drops').next();
    world.rng.fork('interference').int(10);
  });
  expect(b.enemies.count).toBe(a.enemies.count);
  expect(b.enemies.cols.x).toEqual(a.enemies.cols.x);
  expect(b.enemies.cols.y).toEqual(a.enemies.cols.y);
  expect(b.enemies.cols.type).toEqual(a.enemies.cols.type);
});

it('differs for another seed', () => {
  const a = run(1, 600);
  const b = run(2, 600);
  expect(b.enemies.cols.x).not.toEqual(a.enemies.cols.x);
});
