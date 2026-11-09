import { WORLD_SFX } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import type { Axis, WorkerToMain } from '../../protocol/worker-messages';
import { createLoop } from '../loop';
import { cleanupSystem, damageEnemy } from './combat';
import { quietWorld, target } from './combat-test-helpers';
import { dropGem, gemSystem } from './gems';
import { clearSfx, cueSfx, drainSfx, SFX_BIT } from './sfx';
import { contactDamageSystem } from './systems/contact-damage';
import { createWorld, type World } from './world';

const bit = (id: (typeof WORLD_SFX)[number]): number => 1 << WORLD_SFX.indexOf(id);

/** A loop on a hand-driven clock whose `render` drains the world's cues, as `worker/index.ts` does. */
function harness(world: World) {
  let time = 1000;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { cb: () => void; at: number }>();
  const posted: WorkerToMain[] = [];
  const loop = createLoop({
    step: (dt) => {
      cueSfx(world, 'sfx.gemPickup');
      world.step(dt);
    },
    render: () => {
      drainSfx(world, (m) => posted.push(m));
    },
    now: () => time,
    raf: (cb) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelRaf: (id) => frames.delete(id),
    setTimer: ((cb: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { cb, at: time + ms });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimer: ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout,
  });
  const frame = (ms: number): void => {
    time += ms;
    const pending = [...frames.values()];
    frames.clear();
    for (const cb of pending) cb();
  };
  const tick = (ms: number): void => {
    time += ms;
    for (const [id, t] of [...timers.entries()])
      if (t.at <= time) {
        timers.delete(id);
        t.cb();
      }
  };
  return { loop, frame, tick, posted };
}

describe('world sound cues (#129)', () => {
  it('starts with no cues and gives each world sound its own bit', () => {
    expect(createWorld({ seed: 1 }).sfxMask).toBe(0);
    expect(new Set(Object.values(SFX_BIT)).size).toBe(WORLD_SFX.length);
  });

  it('sets bit 0 for a Whip hit, and the death bit when the cleanup removes the enemy', () => {
    const world = createWorld({ seed: 1 });
    world.spawnTimer = 1e9;
    expect(world.weapons[0]?.def.pattern).toBe('whip');
    const bat = target(world, 'bat', 100, 0, 1);
    damageEnemy(world, bat, 1, 1, 0, 0, 0);
    expect(world.sfxMask).toBe(1);
    cleanupSystem(world, 1 / 60);
    expect(world.sfxMask).toBe(1 | bit('sfx.enemyDeath'));
  });

  it('cues no hit for damage without a weapon (Rosary)', () => {
    const world = quietWorld();
    damageEnemy(world, target(world, 'bat', 100, 0), 1, 1, 0, 0, -1);
    expect(world.sfxMask).toBe(0);
  });

  it('cues the gem pickup and the player hurt', () => {
    const world = quietWorld();
    dropGem(world, 0, 0, 1);
    world.player.x = 0;
    world.player.y = 0;
    gemSystem(world, 1 / 60);
    expect(world.sfxMask).toBe(bit('sfx.gemPickup'));
    world.sfxMask = 0;
    target(world, 'bat', 1, 0);
    world.enemyGrid.rebuild(world.enemies.cols.x, world.enemies.cols.y, world.enemies.count);
    contactDamageSystem(world, 1 / 60);
    expect(world.sfxMask).toBe(bit('sfx.playerHurt'));
  });

  it('posts once per rendered frame, only when non-zero, and clears the mask', () => {
    const world = quietWorld();
    const posted: WorkerToMain[] = [];
    drainSfx(world, (m) => posted.push(m));
    expect(posted).toEqual([]);
    cueSfx(world, 'sfx.enemyDeath');
    cueSfx(world, 'sfx.enemyDeath');
    cueSfx(world, 'sfx.hitAxe');
    drainSfx(world, (m) => posted.push(m));
    drainSfx(world, (m) => posted.push(m));
    expect(posted).toEqual([{ type: 'sfx', mask: bit('sfx.enemyDeath') | bit('sfx.hitAxe') }]);
    expect(world.sfxMask).toBe(0);
  });

  it('posts at most one message per frame from the loop, and none over ten hidden simulated ticks', () => {
    const world = quietWorld();
    const h = harness(world);
    h.loop.setBackgroundPolicy('simulate');
    h.loop.start();
    for (let i = 0; i < 10; i++) h.frame(1000 / 30);
    expect(h.posted.length).toBe(10);
    h.posted.length = 0;
    h.loop.setVisibility(true);
    for (let i = 0; i < 10; i++) {
      h.tick(1000);
      h.frame(0);
    }
    expect(h.posted).toEqual([]);
    expect(world.sfxMask).not.toBe(0);
    // The worker clears the backlog when the tab shows again (`visibility hidden: false`).
    clearSfx(world);
    h.loop.setVisibility(false);
    expect(world.sfxMask).toBe(0);
  });

  it('never feeds the simulation: random mask writes leave the same seed with the same positions', () => {
    const script = (i: number): { dx: Axis; dy: Axis } =>
      Math.floor(i / 300) % 2 === 0 ? { dx: 1, dy: 0 } : { dx: 0, dy: -1 };
    const run = (noise: boolean): World => {
      const world = createWorld({ seed: 77 });
      for (let i = 0; i < 1800; i++) {
        world.input = script(i);
        if (noise) world.sfxMask = (i * 2654435761) >>> 1;
        world.step(1 / 60);
        if (world.pendingLevelUps > 0) world.pendingLevelUps = 0;
      }
      return world;
    };
    const a = run(false);
    const b = run(true);
    expect(a.enemies.count).toBeGreaterThan(5);
    expect(b.enemies.cols.x).toEqual(a.enemies.cols.x);
    expect(b.enemies.cols.y).toEqual(a.enemies.cols.y);
    expect(b.player.x).toBe(a.player.x);
    expect(b.stats.kills).toBe(a.stats.kills);
  });
});
