import { PICKUP_COLLECT_RADIUS, PICKUPS, PLAYER_RADIUS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { quietWorld, target } from './combat-test-helpers';
import { ENEMY_FLAG_BOSS } from './enemies';
import { dropGem, GEM_FLYING, GEM_IDLE } from './gems';
import {
  PICKUP_FAMILY_INTERFERENCE,
  PICKUP_FAMILY_LIGHT,
  readPickups,
  spawnPickup,
} from './pickups';
import { readEnemyPositions } from './snapshot';
import { isFrozen } from './systems/freeze';
import { pickupSystem } from './systems/pickups';
import type { World } from './world';

const DT = 1 / 60;
const def = (id: string) => PICKUPS.findIndex((p) => p.id === id);

/** Drops pickup `id` on the player and runs one full step, which collects it. */
function collect(world: World, id: string): void {
  spawnPickup(world, PICKUP_FAMILY_LIGHT, def(id), world.player.x, world.player.y);
  world.step(DT);
}

function steps(world: World, n: number): void {
  for (let i = 0; i < n; i++) world.step(DT);
}

describe('collection', () => {
  it('collects a pickup within PICKUP_COLLECT_RADIUS + PLAYER_RADIUS and leaves one just outside', () => {
    const world = quietWorld();
    const reach = PICKUP_COLLECT_RADIUS + PLAYER_RADIUS;
    spawnPickup(world, PICKUP_FAMILY_LIGHT, def('floorChicken'), reach - 1, 0);
    spawnPickup(world, PICKUP_FAMILY_LIGHT, def('vacuum'), 0, reach + 1);
    world.step(DT);
    expect(readPickups(world)).toEqual([{ id: 'vacuum', x: 0, y: reach + 1 }]);
  });

  it('is not pulled by the gem magnet', () => {
    const world = quietWorld();
    spawnPickup(world, PICKUP_FAMILY_LIGHT, def('floorChicken'), 50, 0);
    steps(world, 60);
    expect(readPickups(world)).toEqual([{ id: 'floorChicken', x: 50, y: 0 }]);
  });

  it('leaves family 1 to the interference collection (#21)', () => {
    const world = quietWorld();
    spawnPickup(world, PICKUP_FAMILY_INTERFERENCE, 0, 0, 0);
    pickupSystem(world);
    expect(world.pickups.count).toBe(1);
    expect(readPickups(world)).toEqual([]);
  });
});

describe('effects', () => {
  it('Floor Chicken heals 30, capped at max HP', () => {
    const world = quietWorld();
    // No recovery (BASE_STATS has 0.2 HP/s since #148), so the step's HP change is the heal alone.
    world.player.stats.recovery = 0;
    world.player.hp = 50;
    collect(world, 'floorChicken');
    expect(world.player.hp).toBe(80);
    world.player.hp = world.player.maxHp - 10;
    collect(world, 'floorChicken');
    expect(world.player.hp).toBe(world.player.maxHp);
  });

  it('Little Clover adds 0.1 luck for the run through runModifiers', () => {
    const world = quietWorld();
    const before = world.player.stats.luck;
    collect(world, 'littleClover');
    expect(world.player.stats.luck).toBeCloseTo(before + 0.1, 6);
    expect(world.player.runModifiers).toEqual([{ stat: 'luck', add: 0.1 }]);
  });

  it('Rosary kills on-screen non-boss enemies, spares bosses and off-screen ones, and still emits enemyKilled', () => {
    const world = quietWorld();
    const kills = world.stats.kills;
    const uid = (slot: number) => world.enemies.uid[slot] ?? -1;
    const onScreen = [
      target(world, 'bat', 300, 100, 50),
      target(world, 'ghoul', -400, -200, 500),
    ].map(uid);
    const boss = target(world, 'ghoul', 200, -100, 500);
    world.enemies.cols.flags[boss] = ENEMY_FLAG_BOSS;
    const spared = [uid(boss), uid(target(world, 'bat', 2000, 0, 50))];
    // The same step's spawner tops up the wave on the spawn ring, outside the view: those are spared too.
    collect(world, 'rosary');
    expect(world.stats.kills - kills).toBe(2);
    let killed = 0;
    for (let i = 0; i < world.events.count; i++)
      if (world.events.items[i]?.kind === 'enemyKilled') killed++;
    expect(killed).toBe(2);
    expect(world.gems.count).toBe(2);
    const left = readEnemyPositions(world).map(([id]) => id);
    for (const id of spared) expect(left).toContain(id);
    for (const id of onScreen) expect(left).not.toContain(id);
  });

  it('Vacuum flies in only the gems that existed when it was collected', () => {
    const world = quietWorld();
    dropGem(world, 500, 0, 1);
    dropGem(world, -800, 300, 1);
    collect(world, 'vacuum');
    expect(Array.from(world.gems.cols.state.subarray(0, 2))).toEqual([GEM_FLYING, GEM_FLYING]);
    dropGem(world, 0, 700, 1);
    const late = world.gems.count - 1;
    expect(world.gems.cols.state[late]).toBe(GEM_IDLE);
    const xp = world.player.xp;
    steps(world, 60 * 5);
    expect(world.gems.count).toBe(1);
    expect(world.gems.cols.state[0]).toBe(GEM_IDLE);
    expect(world.player.xp + world.player.level).toBeGreaterThan(xp + 1);
  });
});

describe('Orologion freeze', () => {
  it('stops chase and separation and contact damage for 10 s, then enemies move again', () => {
    const world = quietWorld();
    // No recovery (BASE_STATS has 0.2 HP/s since #148), so unchanged HP shows that no contact damage landed.
    world.player.stats.recovery = 0;
    target(world, 'bat', 200, 0);
    target(world, 'ghoul', 0, -150);
    // Touching the player.
    target(world, 'bat', 5, 0);
    target(world, 'bat', 6, 0);
    collect(world, 'orologion');
    expect(isFrozen(world)).toBe(true);
    const frozenAt = readEnemyPositions(world);
    const hp = world.player.hp;
    steps(world, 60);
    expect(readEnemyPositions(world)).toEqual(frozenAt);
    expect(world.player.hp).toBe(hp);
    steps(world, 60 * 9 - 2);
    expect(isFrozen(world)).toBe(true);
    expect(readEnemyPositions(world)).toEqual(frozenAt);
    steps(world, 3);
    expect(isFrozen(world)).toBe(false);
    steps(world, 30);
    expect(readEnemyPositions(world)).not.toEqual(frozenAt);
    expect(world.player.hp).toBeLessThan(hp);
  });

  it('still integrates knockback while frozen', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 100, 0);
    collect(world, 'orologion');
    world.enemies.cols.kbX[bat] = 200;
    world.enemies.cols.kbTime[bat] = 0.1;
    steps(world, 10);
    expect(world.enemies.cols.x[bat]).toBeGreaterThan(110);
  });

  it('safety fact: the spawner, the gem magnet and the player keep running while enemies are frozen', () => {
    const world = quietWorld();
    collect(world, 'orologion');
    // The spawner: its timer was parked by quietWorld; restart it.
    world.spawnTimer = 0;
    const enemiesBefore = world.enemies.count;
    // A gem inside the magnet radius.
    dropGem(world, 40, 0, 1);
    const xp = world.player.xp;
    // The player walks right.
    world.input = { dx: 1, dy: 0 };
    const x = world.player.x;
    steps(world, 60);
    expect(isFrozen(world)).toBe(true);
    expect(world.enemies.count).toBeGreaterThan(enemiesBefore);
    expect(world.player.xp).toBeGreaterThan(xp);
    expect(world.player.x).toBeGreaterThan(x + 100);
    // New spawns are frozen too: no enemy moves in a further second.
    world.input = { dx: 0, dy: 0 };
    world.spawnTimer = 1e9;
    world.spawnQueue = 0;
    const spawned = readEnemyPositions(world);
    steps(world, 60);
    expect(readEnemyPositions(world)).toEqual(spawned);
  });
});
