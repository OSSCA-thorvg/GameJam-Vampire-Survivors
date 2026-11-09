import { BASE_MAX_HP, BASE_STATS } from '@vs/shared';
import { expect, it } from 'vitest';
import { cameraSystem } from './camera';
import { chestDropSystem } from './chests';
import { cleanupSystem } from './combat';
import { fxSystem } from './fx';
import { gemDropSystem, gemSystem } from './gems';
import { levelSystem } from './level';
import { projectileSystem } from './projectiles';
import { playerMovementSystem } from './player';
import { readEnemyPositions, readPlayerSnapshot } from './snapshot';
import { bossTetherSystem } from './systems/bosses';
import { chestOpenSystem } from './systems/chest-open';
import { enemyMovementSystem } from './systems/enemy-movement';
import { contactDamageSystem } from './systems/contact-damage';
import { enemyRelocateSystem } from './systems/enemy-relocate';
import { recoverySystem } from './systems/recovery';
import { lightSourceSystem } from './systems/light-sources';
import { pickupSystem } from './systems/pickups';
import { finaleSystem } from './systems/finale';
import { spawnerSystem } from './systems/spawner';
import { stageEventSystem } from './systems/stage-events';
import { weaponSystem } from './weapons/system';
import {
  interferenceApplySystem,
  interferenceCollectSystem,
  interferenceDropSystem,
} from './systems/interference';
import { inputSystem, SYSTEMS } from './world';
import { createBaseWorld } from './base-world';

it('runs input, incoming interference (#21), movement, camera, the spawner, enemy movement, relocation, contact damage, recovery, the combat systems, interference collection and drops, then gems and levels', () => {
  expect(SYSTEMS).toEqual([
    inputSystem,
    interferenceApplySystem,
    playerMovementSystem,
    cameraSystem,
    lightSourceSystem,
    finaleSystem,
    spawnerSystem,
    stageEventSystem,
    enemyMovementSystem,
    enemyRelocateSystem,
    bossTetherSystem,
    contactDamageSystem,
    recoverySystem,
    weaponSystem,
    projectileSystem,
    pickupSystem,
    interferenceCollectSystem,
    fxSystem,
    cleanupSystem,
    chestDropSystem,
    interferenceDropSystem,
    gemDropSystem,
    gemSystem,
    levelSystem,
    chestOpenSystem,
  ]);
});

it('starts the default character with the Whip at level 1 and a weapons stream of its own', () => {
  const world = createBaseWorld({ seed: 42 });
  expect(world.weapons.map((w) => [w.def.id, w.level])).toEqual([['whip', 1]]);
  expect(world.weaponRng.next()).toBe(createBaseWorld({ seed: 42 }).rng.fork('weapons').next());
});

it('stores the seed and character, seeds the root stream and reports the player snapshot', () => {
  const a = createBaseWorld({ seed: 42 });
  const b = createBaseWorld({ seed: 42, characterId: 'swift' });
  expect(a.characterId).toBe('warden');
  expect(b.characterId).toBe('swift');
  expect(a.rng.fork('spawn').next()).toBe(b.rng.fork('spawn').next());
  a.input = { dx: 1, dy: 0 };
  a.step(0.5);
  expect(readPlayerSnapshot(a)).toEqual({
    x: 70,
    y: 0,
    facingX: 1,
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    invulnerable: false,
    level: 1,
    xp: 0,
  });
});

it('starts running with full HP, an empty event queue and level-1 stats that mirror the time', () => {
  const world = createBaseWorld({ seed: 5 });
  expect(world.state).toBe('running');
  expect(world.player.hp).toBe(world.player.maxHp);
  expect(world.player.armor).toBe(BASE_STATS.armor);
  expect(world.events.count).toBe(0);
  world.events.push('enemyKilled');
  world.step(0.25);
  // Events live for one step: the step cleared the event pushed before it.
  expect(world.events.count).toBe(0);
  expect(world.stats).toEqual({ timeSec: 0.25, kills: 0, level: 1 });
});

it('reports live enemies as [uid, type, x, y] with rounded positions', () => {
  const world = createBaseWorld({ seed: 3 });
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
