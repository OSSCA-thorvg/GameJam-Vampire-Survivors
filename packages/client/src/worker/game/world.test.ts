import { expect, it } from 'vitest';
import { cameraSystem } from './camera';
import { cleanupSystem } from './combat';
import { fxSystem } from './fx';
import { gemDropSystem, gemSystem } from './gems';
import { levelSystem } from './level';
import { projectileSystem } from './projectiles';
import { playerMovementSystem } from './player';
import { readEnemyPositions, readPlayerSnapshot } from './snapshot';
import { enemyMovementSystem } from './systems/enemy-movement';
import { contactDamageSystem } from './systems/contact-damage';
import { enemyRelocateSystem } from './systems/enemy-relocate';
import { recoverySystem } from './systems/recovery';
import { spawnerSystem } from './systems/spawner';
import { weaponSystem } from './weapons/system';
import { createWorld, inputSystem, SYSTEMS } from './world';

it('runs input, movement, camera, the spawner, enemy movement, relocation, contact damage, recovery, the combat systems, then gems and levels', () => {
  expect(SYSTEMS).toEqual([
    inputSystem,
    playerMovementSystem,
    cameraSystem,
    spawnerSystem,
    enemyMovementSystem,
    enemyRelocateSystem,
    contactDamageSystem,
    recoverySystem,
    weaponSystem,
    projectileSystem,
    fxSystem,
    cleanupSystem,
    gemDropSystem,
    gemSystem,
    levelSystem,
  ]);
});

it('starts the default character with the Whip at level 1 and a weapons stream of its own', () => {
  const world = createWorld({ seed: 42 });
  expect(world.weapons.map((w) => [w.def.id, w.level])).toEqual([['whip', 1]]);
  expect(world.weaponRng.next()).toBe(createWorld({ seed: 42 }).rng.fork('weapons').next());
});

it('stores the seed and character, seeds the root stream and reports the player snapshot', () => {
  const a = createWorld({ seed: 42 });
  const b = createWorld({ seed: 42, characterId: 'swift' });
  expect(a.characterId).toBe('warden');
  expect(b.characterId).toBe('swift');
  expect(a.rng.fork('spawn').next()).toBe(b.rng.fork('spawn').next());
  a.input = { dx: 1, dy: 0 };
  a.step(0.5);
  expect(readPlayerSnapshot(a)).toEqual({
    x: 70,
    y: 0,
    facingX: 1,
    hp: 100,
    maxHp: 100,
    invulnerable: false,
    level: 1,
    xp: 0,
  });
});

it('starts running with full HP, an empty event queue and level-1 stats that mirror the time', () => {
  const world = createWorld({ seed: 5 });
  expect(world.state).toBe('running');
  expect(world.player.hp).toBe(world.player.maxHp);
  expect(world.player.armor).toBe(0);
  expect(world.events.count).toBe(0);
  world.events.push('enemyKilled');
  world.step(0.25);
  // Events live for one step: the step cleared the event pushed before it.
  expect(world.events.count).toBe(0);
  expect(world.stats).toEqual({ timeSec: 0.25, kills: 0, level: 1 });
});

it('reports live enemies as [uid, type, x, y] with rounded positions', () => {
  const world = createWorld({ seed: 3 });
  world.step(1 / 60);
  const rows = readEnemyPositions(world);
  expect(rows).toHaveLength(world.enemies.count);
  expect(rows[0]).toEqual([
    world.enemies.uid[0],
    0,
    Math.round(world.enemies.cols.x[0] ?? NaN),
    Math.round(world.enemies.cols.y[0] ?? NaN),
  ]);
});
