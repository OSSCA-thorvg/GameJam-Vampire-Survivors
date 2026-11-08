import { ENEMIES, ENEMY_CAP, ENEMY_LIST, STAGE, type EnemyId } from '@vs/shared';
import { describe, expect, it, vi } from 'vitest';
import { createBaseWorld } from '../base-world';
import { ENEMY_FLAG_BOSS, ENEMY_FLAG_ELITE, spawnEnemy } from '../enemies';
import { readBosses } from '../snapshot';
import type { createWorld } from '../world';
import { type World } from '../world';
import { spawnBoss } from './bosses';
import { finaleSystem } from './finale';
import { waveAt } from './spawner';
import { stageEventSystem, SWARM_RING_RADIUS } from './stage-events';

const DT = 1 / 60;

/** A world with no weapons and an invulnerable player, so only the stage schedule changes the enemies. */
function stageWorld(options: Parameters<typeof createWorld>[0] = { seed: 3 }): World {
  const world = createBaseWorld(options);
  world.weapons.length = 0;
  world.debugInvulnerable = true;
  return world;
}

const countType = (world: World, id: EnemyId): number => {
  let n = 0;
  const type = ENEMY_LIST.indexOf(id);
  for (let i = 0; i < world.enemies.count; i++) if (world.enemies.cols.type[i] === type) n++;
  return n;
};
const countFlag = (world: World, flag: number): number => {
  let n = 0;
  for (let i = 0; i < world.enemies.count; i++)
    if (((world.enemies.cols.flags[i] ?? 0) & flag) !== 0) n++;
  return n;
};

describe('the wave table', () => {
  it('tops the alive count up toward each wave’s minAlive within a few steps, never past the cap', () => {
    for (const wave of STAGE.waves) {
      const world = stageWorld();
      world.time = wave.fromMinute * 60 + 1;
      // Skip the stage events, which this test does not cover.
      world.nextEventIndex = STAGE.events.length;
      const steps = Math.ceil(wave.minAlive / 20) + 1;
      for (let i = 0; i < steps; i++) world.step(DT);
      expect(waveAt(world.time / 60)).toBe(wave);
      expect(world.enemies.count, `minute ${String(wave.fromMinute)}`).toBeGreaterThanOrEqual(
        wave.minAlive,
      );
      expect(world.enemies.count).toBeLessThanOrEqual(ENEMY_CAP);
      const mix = new Set(wave.enemies.map((e) => e.enemyId));
      for (let i = 0; i < world.enemies.count; i++)
        expect(mix).toContain(ENEMY_LIST[world.enemies.cols.type[i] ?? 0]);
    }
  });
});

describe('stage events', () => {
  it('fires each event exactly once, at its time and not before', () => {
    const world = stageWorld();
    world.spawnTimer = 1e9;
    for (const [index, event] of STAGE.events.entries()) {
      world.enemies.clear();
      world.time = event.at - DT / 2;
      stageEventSystem(world);
      expect(world.nextEventIndex, `before ${String(event.at)}`).toBe(index);
      expect(world.enemies.count).toBe(0);
      world.time = event.at;
      stageEventSystem(world);
      stageEventSystem(world);
      expect(world.nextEventIndex, `at ${String(event.at)}`).toBe(index + 1);
      switch (event.kind) {
        case 'boss':
          expect(readBosses(world).map((b) => b.id)).toEqual([event.enemyId]);
          break;
        case 'elite':
          expect(countFlag(world, ENEMY_FLAG_ELITE)).toBe(event.count);
          expect(countType(world, event.enemyId)).toBe(event.count);
          break;
        case 'swarm':
          expect(countType(world, event.enemyId)).toBe(event.count);
          expect(world.enemies.count).toBe(event.count);
          break;
      }
    }
    world.time = STAGE.durationSec - DT;
    stageEventSystem(world);
    expect(world.nextEventIndex).toBe(STAGE.events.length);
  });

  it('places a ring swarm off screen around the player and a line swarm beyond the edge behind it', () => {
    const ring = STAGE.events.find((e) => e.kind === 'swarm' && e.formation === 'ring');
    const line = STAGE.events.find((e) => e.kind === 'swarm' && e.formation === 'line');
    if (!ring || !line) throw new Error('STAGE needs a ring and a line swarm');
    const world = stageWorld();
    world.player.x = 500;
    world.player.y = -200;
    world.camera.x = 500;
    world.camera.y = -200;
    world.nextEventIndex = STAGE.events.indexOf(ring);
    world.time = ring.at;
    stageEventSystem(world);
    const { x, y } = world.enemies.cols;
    for (let i = 0; i < world.enemies.count; i++)
      expect(Math.hypot((x[i] ?? 0) - 500, (y[i] ?? 0) + 200)).toBeCloseTo(SWARM_RING_RADIUS, 3);
    world.enemies.clear();
    world.player.facingX = 1;
    world.nextEventIndex = STAGE.events.indexOf(line);
    world.time = line.at;
    stageEventSystem(world);
    const view = world.camera.viewRect(0);
    for (let i = 0; i < world.enemies.count; i++) {
      expect(x[i]).toBeCloseTo(view.left - 64, 3);
      expect(y[i]).toBeGreaterThan(view.top - 64);
      expect(y[i]).toBeLessThan(view.bottom + 64);
    }
  });

  it('gives a boss the farthest normal enemy’s slot when the field is full, without a kill or a gem', () => {
    const world = stageWorld();
    for (let i = 0; i < ENEMY_CAP; i++) spawnEnemy(world, 'bat', 100 + i, 0);
    const kills = world.stats.kills;
    const slot = spawnBoss(world, 'reaper5');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(world.enemies.count).toBe(ENEMY_CAP);
    expect(readBosses(world).map((b) => b.id)).toEqual(['reaper5']);
    // The bat at x = 499 (the farthest) is gone; the one at x = 100 stays.
    const xs = Array.from(world.enemies.cols.x.subarray(0, world.enemies.count));
    expect(xs).not.toContain(100 + ENEMY_CAP - 1);
    expect(xs).toContain(100);
    expect(world.stats.kills).toBe(kills);
    expect(world.events.count).toBe(0);
  });
});

describe('the finale', () => {
  function atLimit(finale: 'death' | 'end', onGameOver = vi.fn()): World {
    const world = stageWorld({ seed: 5, finale, onGameOver });
    world.time = STAGE.durationSec - 2 * DT;
    world.nextEventIndex = STAGE.events.length;
    for (let i = 0; i < 30; i++) spawnEnemy(world, 'skeleton', 200 + i * 5, 50);
    spawnBoss(world, 'reaper10');
    return world;
  }

  it('at 15:00 removes every non-boss enemy with no gem and no kill, spawns Death and marks the run cleared', () => {
    const onGameOver = vi.fn();
    const world = atLimit('death', onGameOver);
    world.step(DT);
    expect(world.cleared).toBe(false);
    world.step(DT);
    world.step(DT);
    expect(world.cleared).toBe(true);
    expect(readBosses(world).map((b) => b.id)).toEqual(['reaper10', 'death']);
    expect(world.enemies.count).toBe(2);
    expect(countFlag(world, ENEMY_FLAG_BOSS)).toBe(2);
    expect(world.gems.count).toBe(0);
    expect(world.stats.kills).toBe(0);
    // The spawner and the events stay stopped, and the run goes on.
    for (let i = 0; i < 120; i++) world.step(DT);
    expect(world.enemies.count).toBe(2);
    expect(world.state).toBe('running');
    expect(onGameOver).not.toHaveBeenCalled();
    // Death kills the player through any armor once invulnerability is off; the results say cleared.
    world.debugInvulnerable = false;
    world.player.armor = 1000;
    const death = world.enemies.cols;
    const d = ENEMY_LIST.indexOf('death');
    for (let i = 0; i < world.enemies.count; i++)
      if (death.type[i] === d) {
        death.x[i] = world.player.x;
        death.y[i] = world.player.y;
      }
    world.step(DT);
    expect(world.state).toBe('dead');
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onGameOver).toHaveBeenCalledWith(expect.objectContaining({ cleared: true, kills: 0 }));
  });

  it("with finale 'end' ends the run at 15:00 with cleared true and no Death", () => {
    const onGameOver = vi.fn();
    const world = atLimit('end', onGameOver);
    for (let i = 0; i < 5; i++) world.step(DT);
    expect(world.state).toBe('ended');
    expect(world.cleared).toBe(true);
    expect(countType(world, 'death')).toBe(0);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onGameOver).toHaveBeenCalledWith(
      expect.objectContaining({ cleared: true, timeSec: world.time }),
    );
    expect(world.time).toBeGreaterThanOrEqual(STAGE.durationSec - 1e-6);
    expect(world.time).toBeLessThan(STAGE.durationSec + DT);
    const time = world.time;
    world.step(DT);
    expect(world.time).toBe(time);
    expect(onGameOver).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the limit', () => {
    const world = stageWorld();
    world.time = STAGE.durationSec - 0.1;
    spawnEnemy(world, 'bat', 300, 0);
    finaleSystem(world);
    expect(world.cleared).toBe(false);
    expect(world.enemies.count).toBe(1);
    expect(ENEMIES.death.boss).toBeDefined();
  });
});
