import { BASE_MOVE_SPEED } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import type { Axis } from '../../protocol/worker-messages';
import { createBaseWorld } from './base-world';

function run(dx: Axis, dy: Axis, steps = 60) {
  const world = createBaseWorld({ seed: 1 });
  world.input = { dx, dy };
  for (let i = 0; i < steps; i++) world.step(1 / 60);
  return world;
}

describe('player movement', () => {
  it('moves BASE_MOVE_SPEED (140) units in one second of 60 steps', () => {
    expect(BASE_MOVE_SPEED).toBe(140);
    const world = run(1, 0);
    expect(world.player.x).toBeCloseTo(140, 3);
    expect(world.player.y).toBe(0);
    expect(world.time).toBeCloseTo(1, 9);
  });
  it('moves diagonally at the same speed as straight (140, not 198)', () => {
    const world = run(1, 1);
    expect(Math.hypot(world.player.x, world.player.y)).toBeCloseTo(140, 3);
    expect(world.player.x).toBeCloseTo(world.player.y, 9);
    const left = run(-1, -1);
    expect(Math.hypot(left.player.x, left.player.y)).toBeCloseTo(140, 3);
    expect(left.player.x).toBeLessThan(0);
  });
  it('keeps facingX and lastDir when input turns vertical or stops, and stops immediately', () => {
    const world = createBaseWorld({ seed: 1 });
    world.input = { dx: -1, dy: 0 };
    world.step(1 / 60);
    expect(world.player.facingX).toBe(-1);
    world.input = { dx: 0, dy: 1 };
    world.step(1 / 60);
    expect(world.player.facingX).toBe(-1);
    expect([world.player.lastDirX, world.player.lastDirY]).toEqual([0, 1]);
    world.input = { dx: 0, dy: 0 };
    world.step(1 / 60);
    expect(world.player.facingX).toBe(-1);
    expect([world.player.dirX, world.player.dirY]).toEqual([0, 0]);
    const { x, y } = world.player;
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    expect([world.player.x, world.player.y]).toEqual([x, y]);
    world.input = { dx: 1, dy: -1 };
    world.step(1 / 60);
    expect(world.player.facingX).toBe(1);
  });
  it('starts at the origin facing right with lastDir (1, 0)', () => {
    const { player } = createBaseWorld({ seed: 1 });
    expect(player).toMatchObject({ x: 0, y: 0, facingX: 1, lastDirX: 1, lastDirY: 0 });
  });
});
