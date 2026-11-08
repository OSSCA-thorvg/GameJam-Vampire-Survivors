import { ENEMIES } from '@vs/shared';
import { expect, it } from 'vitest';
import { spawnEnemy } from '../enemies';
import { createWorld } from '../world';
import { enemyMovementSystem } from './enemy-movement';

it('spreads 50 enemies spawned at one point until no pair is closer than 1.5 × radius after 2 s', () => {
  const world = createWorld({ seed: 1 });
  // Far enough from the player at the origin that the bats (140 units/s) do not reach it in the 2 s.
  for (let i = 0; i < 50; i++) spawnEnemy(world, 'bat', 900, 600);
  for (let i = 0; i < 120; i++) enemyMovementSystem(world, 1 / 60);
  const { x, y } = world.enemies.cols;
  let closest = Infinity;
  for (let i = 0; i < 50; i++)
    for (let j = i + 1; j < 50; j++)
      closest = Math.min(closest, Math.hypot((x[i] ?? 0) - (x[j] ?? 0), (y[i] ?? 0) - (y[j] ?? 0)));
  expect(closest).toBeGreaterThanOrEqual(1.5 * ENEMIES.bat.radius);
});

it('chases the player at its speed when alone, and faces its walking direction', () => {
  const world = createWorld({ seed: 1 });
  const slot = spawnEnemy(world, 'ghoul', 1000, 0);
  enemyMovementSystem(world, 1);
  expect(world.enemies.cols.x[slot]).toBeCloseTo(1000 - ENEMIES.ghoul.speed);
  expect(world.enemies.cols.flip[slot]).toBe(1);
});

it('follows the knockback velocity while kbTime > 0', () => {
  const world = createWorld({ seed: 1 });
  const slot = spawnEnemy(world, 'bat', 100, 0);
  const { kbX, kbY, kbTime, x } = world.enemies.cols;
  kbX[slot] = 300;
  kbY[slot] = 0;
  kbTime[slot] = 0.1;
  enemyMovementSystem(world, 0.05);
  expect(x[slot]).toBeCloseTo(115);
  expect(kbTime[slot]).toBeCloseTo(0.05);
});
