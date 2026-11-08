import { ENEMY_CAP, INTERFERENCE, INTERFERENCE_RULES, type EnemyId } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import type { Axis, RunMode } from '../../../protocol/worker-messages';
import { createBaseWorld } from '../base-world';
import { ENEMY_FLAG_ELITE, spawnEnemy } from '../enemies';
import { dropGem } from '../gems';
import { PICKUP_FAMILY_INTERFERENCE } from '../pickups';
import { countElites } from '../snapshot';
import type { SpawnLog } from '../spawn-log';
import { stepAnsweringLevelUps } from '../test-level-ups';
import { createWorld, type World } from '../world';
import {
  drainCollected,
  interferenceDropSystem,
  interferenceEnemy,
  interferenceOnGround,
  queueInterference,
  spawnDebugInterference,
} from './interference';

const DT = 1 / 60;

/** A quiet versus world: no weapons, no spawner (a cleared stage), no damage. */
function quietWorld(mode: RunMode = 'versus'): World {
  const world = createBaseWorld({ seed: 7, mode });
  world.weapons.length = 0;
  world.cleared = true;
  world.debugInvulnerable = true;
  return world;
}

/** Pushes `n` kills far from the player (elites when `elite`) into this step's events, then runs the drop system. */
function kills(world: World, n: number, elite = true): void {
  world.events.clear();
  for (let i = 0; i < n; i++) {
    const e = world.events.push('enemyKilled');
    e.x = 500 + i;
    e.y = 500;
    e.flags = elite ? ENEMY_FLAG_ELITE : 0;
  }
  interferenceDropSystem(world);
}

describe('interference drops (#21)', () => {
  it('drop none before 60 s, at most one per 20 s and at most 2 on the ground', () => {
    const world = quietWorld();
    world.time = INTERFERENCE_RULES.notBeforeS - 0.01;
    kills(world, 500);
    expect(interferenceOnGround(world)).toBe(0);
    world.time = INTERFERENCE_RULES.notBeforeS;
    kills(world, 500);
    expect(interferenceOnGround(world)).toBe(1);
    world.time += INTERFERENCE_RULES.minIntervalS - 0.01;
    kills(world, 500);
    expect(interferenceOnGround(world)).toBe(1);
    world.time += 0.01;
    kills(world, 500);
    expect(interferenceOnGround(world)).toBe(2);
    world.time += 10 * INTERFERENCE_RULES.minIntervalS;
    kills(world, 500);
    expect(interferenceOnGround(world)).toBe(INTERFERENCE_RULES.maxOnGround);
  });

  it('never drop in single player', () => {
    const world = quietWorld('single');
    world.time = 500;
    kills(world, 1000);
    expect(interferenceOnGround(world)).toBe(0);
  });

  it('never appear in a single-player run of 10 simulated minutes', () => {
    const world = createWorld({ seed: 31 });
    world.debugInvulnerable = true;
    let seen = 0;
    stepAnsweringLevelUps(world, 10 * 60 * 60, () => {
      seen = Math.max(seen, interferenceOnGround(world));
    });
    expect(world.stats.kills).toBeGreaterThan(100);
    expect(seen).toBe(0);
  }, 120_000);
});

describe('collection (#21)', () => {
  it('queues the kind for the server when the player walks into it, and shows the toast', () => {
    const world = quietWorld();
    expect(spawnDebugInterference(world)).toBe(INTERFERENCE[0]?.kind);
    expect(interferenceOnGround(world)).toBe(1);
    world.input = { dx: 1, dy: 0 };
    for (let i = 0; i < 60 && interferenceOnGround(world) > 0; i++) world.step(DT);
    expect(interferenceOnGround(world)).toBe(0);
    const sent: number[] = [];
    drainCollected(world, (k) => sent.push(k));
    expect(sent).toEqual([0]);
    expect(world.sentToast).toBe(0);
    expect(world.sentToastUntil).toBeGreaterThan(world.time);
    drainCollected(world, (k) => sent.push(k));
    expect(sent).toEqual([0]);
  });

  it('the debug key does nothing in single player', () => {
    expect(spawnDebugInterference(quietWorld('single'))).toBeNull();
  });
});

describe('effects (#21)', () => {
  const apply = (world: World, kind: string): void => {
    queueInterference(world, kind);
    world.step(DT);
  };

  it('Swarm adds 30 enemies of the wave’s main enemy on a ring', () => {
    const world = quietWorld();
    const enemyId: EnemyId = interferenceEnemy(world);
    expect(enemyId).toBe('bat');
    apply(world, 'swarm');
    expect(world.enemies.count).toBe(30);
  });

  it('Swarm stops at ENEMY_CAP', () => {
    const world = quietWorld();
    for (let i = 0; i < ENEMY_CAP - 10; i++) spawnEnemy(world, 'ghoul', 2000 + i, 2000);
    apply(world, 'swarm');
    expect(world.enemies.count).toBe(ENEMY_CAP);
  });

  it('Gem Thief removes every gem and keeps XP and level', () => {
    const world = quietWorld();
    world.player.xp = 3;
    for (let i = 0; i < 50; i++) dropGem(world, 300 + i * 10, 300, 1);
    const { xp, level } = world.player;
    apply(world, 'gemThief');
    expect(world.gems.count).toBe(0);
    expect(world.player.xp).toBe(xp);
    expect(world.player.level).toBe(level);
  });

  it('Elite Call adds exactly one elite 400 units away', () => {
    const world = quietWorld();
    apply(world, 'eliteCall');
    expect(world.enemies.count).toBe(1);
    expect(countElites(world)).toBe(1);
    const d = Math.hypot(
      (world.enemies.cols.x[0] ?? 0) - world.player.x,
      (world.enemies.cols.y[0] ?? 0) - world.player.y,
    );
    expect(d).toBeGreaterThan(390);
    expect(d).toBeLessThan(410);
  });

  it('an unknown kind changes nothing', () => {
    const world = quietWorld();
    expect(queueInterference(world, 'nuke')).toBe(false);
    world.step(DT);
    expect(world.enemies.count).toBe(0);
  });

  it('waits through a level-up pause and is ignored once the run is over', () => {
    const world = quietWorld();
    world.pendingLevelUps = 1;
    queueInterference(world, 'swarm');
    world.step(DT);
    expect(world.enemies.count).toBe(0);
    world.pendingLevelUps = 0;
    world.step(DT);
    expect(world.enemies.count).toBe(30);
    world.state = 'dead';
    expect(queueInterference(world, 'eliteCall')).toBe(false);
  });
});

/** Every spawner spawn, in order, with its time: the base wave schedule. */
function fullLog(): SpawnLog & { entries: [EnemyId, number][] } {
  const entries: [EnemyId, number][] = [];
  return {
    entries,
    record(enemyId, timeS) {
      entries.push([enemyId, timeS]);
    },
    read: () => [],
    clear() {
      entries.length = 0;
    },
  };
}

function script(step: number): { dx: Axis; dy: Axis } {
  const dirs: [Axis, Axis][] = [
    [1, 0],
    [0, 0],
    [1, 1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ];
  const [dx, dy] = dirs[Math.floor(step / 300) % 6] ?? [0, 0];
  return { dx, dy };
}

// The safety fact of #21: interference drops never change the base wave schedule (ADR 0004).
it('keeps the spawner schedule of a versus world with drops rolling equal to single player', () => {
  const run = (mode: RunMode) => {
    const spawnLog = fullLog();
    const world = createWorld({ seed: 2024, mode, spawnLog });
    world.debugInvulnerable = true;
    let step = 0;
    let drops = 0;
    let onGround = 0;
    stepAnsweringLevelUps(world, 5 * 60 * 60, () => {
      world.input = script(++step);
      const n = world.pickups.count;
      let now = 0;
      for (let i = 0; i < n; i++)
        if (world.pickups.cols.family[i] === PICKUP_FAMILY_INTERFERENCE) now++;
      if (now > onGround) drops += now - onGround;
      onGround = now;
    });
    return { log: spawnLog.entries, drops };
  };
  const single = run('single');
  const versus = run('versus');
  expect(single.drops).toBe(0);
  expect(versus.drops).toBeGreaterThan(0);
  expect(single.log.length).toBeGreaterThan(500);
  expect(versus.log).toEqual(single.log);
}, 120_000);
