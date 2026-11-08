import { expect, it } from 'vitest';
import { cameraSystem } from '../camera';
import { ENEMY_FLAG_BOSS, spawnEnemy } from '../enemies';
import { createWorld } from '../world';
import { enemyRelocateSystem, RELOCATE_DISTANCE } from './enemy-relocate';

function setup() {
  const world = createWorld({ seed: 21 });
  world.player.x = 5000;
  world.player.y = 0;
  world.player.dirX = 1;
  world.player.dirY = 0;
  cameraSystem(world);
  return world;
}

it('moves an enemy 2000 units behind a player moving right to the spawn ring ahead of it', () => {
  for (let skip = 0; skip < 20; skip++) {
    const world = setup();
    for (let s = 0; s < skip; s++) world.relocateRng.next();
    const slot = spawnEnemy(world, 'ghoul', 3000, 0);
    world.enemies.cols.hp[slot] = 7;
    enemyRelocateSystem(world, 1 / 60);
    const { x, y, hp, type } = world.enemies.cols;
    // `viewRect` returns one shared object, so copy each result before the next call.
    const view = { ...world.camera.viewRect(0) };
    const ring = { ...world.camera.viewRect(64) };
    const px = x[slot] ?? NaN;
    const py = y[slot] ?? NaN;
    expect(px).toBeGreaterThan(world.player.x);
    expect(px > view.right || py < view.top || py > view.bottom).toBe(true);
    expect(px).toBeLessThanOrEqual(ring.right + 1e-3);
    expect(hp[slot]).toBe(7);
    expect(type[slot]).toBe(1);
  }
});

it('leaves near enemies and bosses alone, and runs every 0.5 s', () => {
  const world = setup();
  const near = spawnEnemy(world, 'bat', 5000 - RELOCATE_DISTANCE + 10, 0);
  const boss = spawnEnemy(world, 'bat', 0, 0);
  world.enemies.cols.flags[boss] = ENEMY_FLAG_BOSS;
  enemyRelocateSystem(world, 1 / 60);
  expect(world.enemies.cols.x[near]).toBe(5000 - RELOCATE_DISTANCE + 10);
  expect(world.enemies.cols.x[boss]).toBe(0);
  const far = spawnEnemy(world, 'bat', 0, 100);
  for (let i = 0; i < 29; i++) enemyRelocateSystem(world, 1 / 60);
  expect(world.enemies.cols.x[far]).toBe(0);
  enemyRelocateSystem(world, 1 / 60);
  expect(world.enemies.cols.x[far]).toBeGreaterThan(4000);
});
