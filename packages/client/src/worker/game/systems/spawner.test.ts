import { ENEMY_CAP, ENEMY_LIST, STAGE } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { createWorld, SYSTEMS, type World } from '../world';
import { ENEMY_FLAG_BOSS, spawnEnemy } from '../enemies';
import { spawnElite } from './elites';
import { liveNormalEnemies, MAX_SPAWNS_PER_STEP, spawnerSystem, waveAt } from './spawner';

const DT = 1 / 60;

/** Steps the world system by system, calling `afterSpawn` with the slots the spawner added in that step. */
function step(world: World, afterSpawn?: (from: number, to: number) => void): void {
  // As world.step does: without it every step replays the previous steps' enemyKilled events (#151).
  world.events.clear();
  for (const system of SYSTEMS) {
    const before = world.enemies.count;
    system(world, DT);
    if (system === spawnerSystem) afterSpawn?.(before, world.enemies.count);
  }
  world.time += DT;
}

describe('spawnerSystem', () => {
  it('picks the last wave that has started', () => {
    expect(waveAt(0)).toBe(STAGE.waves[0]);
    expect(waveAt(4.99)).toBe(STAGE.waves[4]);
    expect(waveAt(14)).toBe(STAGE.waves[14]);
    expect(waveAt(20)).toBe(STAGE.waves[14]);
  });

  it('keeps at least minAlive alive after 60 s at minute 0', () => {
    const world = createWorld({ seed: 7 });
    for (let i = 0; i < 3600; i++) step(world);
    expect(world.enemies.count).toBeGreaterThanOrEqual(STAGE.waves[0]?.minAlive ?? Infinity);
    // Only minute 0's mix: bats and ghouls.
    const mix = STAGE.waves[0]?.enemies.map((e) => e.enemyId) ?? [];
    for (let i = 0; i < world.enemies.count; i++)
      expect(mix).toContain(ENEMY_LIST[world.enemies.cols.type[i] ?? -1]);
  });

  // Long seeded property test: CI runners are several times slower than local machines (#80).
  it('never exceeds ENEMY_CAP over 5 minutes, spawning at most 20 per step', () => {
    const world = createWorld({ seed: 11 });
    // Push the clock to minute 10 halfway, so the top-up is large.
    let peak = 0;
    for (let i = 0; i < 5 * 3600; i++) {
      if (i === 2 * 3600) world.time = 10 * 60;
      step(world, (from, to) => {
        expect(to - from).toBeLessThanOrEqual(MAX_SPAWNS_PER_STEP);
      });
      expect(world.enemies.count).toBeLessThanOrEqual(ENEMY_CAP);
      peak = Math.max(peak, world.enemies.count);
    }
    expect(peak).toBeGreaterThanOrEqual(240);
  }, 30_000);

  it('stops at the cap and drops the excess queue', () => {
    const world = createWorld({ seed: 3 });
    world.spawnQueue = ENEMY_CAP + 50;
    for (let i = 0; i < 40; i++) spawnerSystem(world, DT);
    expect(world.enemies.count).toBe(ENEMY_CAP);
    expect(world.spawnQueue).toBe(0);
  });

  it('spawns only outside viewRect(0) and inside viewRect(64), while the player moves', () => {
    const world = createWorld({ seed: 5 });
    world.input = { dx: 1, dy: 1 };
    let checked = 0;
    for (let i = 0; i < 3 * 3600; i++) {
      if (i % 600 === 0) world.input = { dx: world.input.dy, dy: world.input.dx === 1 ? -1 : 1 };
      step(world, (from, to) => {
        const { x, y } = world.enemies.cols;
        for (let s = from; s < to; s++) {
          const px = x[s] ?? NaN;
          const py = y[s] ?? NaN;
          const outer = world.camera.viewRect(64);
          const inOuter =
            px >= outer.left - 1e-3 &&
            px <= outer.right + 1e-3 &&
            py >= outer.top - 1e-3 &&
            py <= outer.bottom + 1e-3;
          const inner = world.camera.viewRect(0);
          const inView = px > inner.left && px < inner.right && py > inner.top && py < inner.bottom;
          expect(inOuter && !inView, `spawn at (${String(px)}, ${String(py)})`).toBe(true);
          checked++;
        }
      });
    }
    // Since #148 the live cap (`maxAlive`) holds back the batches of an idle crowd, so fewer spawns happen.
    expect(checked).toBeGreaterThan(40);
  });

  it('skips the periodic batch while maxAlive normal enemies are alive, but still tops up and counts no boss (#148)', () => {
    const wave = STAGE.waves[0];
    if (!wave) throw new Error('no wave 0');
    const world = createWorld({ seed: 4 });
    for (let i = 0; i < wave.maxAlive; i++) spawnEnemy(world, 'bat', 5000 + i, 5000);
    world.spawnTimer = 0;
    spawnerSystem(world, DT);
    expect(world.enemies.count).toBe(wave.maxAlive);
    expect(liveNormalEnemies(world)).toBe(wave.maxAlive);
    // A boss does not count toward the cap: with one bat fewer the batch spawns again.
    world.enemies.remove(0);
    const boss = spawnEnemy(world, 'reaper5', 6000, 6000);
    world.enemies.cols.flags[boss] = ENEMY_FLAG_BOSS;
    expect(liveNormalEnemies(world)).toBe(wave.maxAlive - 1);
    world.spawnTimer = 0;
    spawnerSystem(world, DT);
    expect(liveNormalEnemies(world)).toBe(wave.maxAlive - 1 + wave.batchSize);
  });

  it("leaves elites, such as #156's minute chest carriers, outside the live cap (#148)", () => {
    const wave = STAGE.waves[0];
    if (!wave) throw new Error('no wave 0');
    const world = createWorld({ seed: 4 });
    for (let i = 0; i < wave.maxAlive - 1; i++) spawnEnemy(world, 'bat', 5000 + i, 5000);
    const carrier = spawnElite(world, 'bat', { x: 6000, y: 6000 });
    expect(carrier).toBeGreaterThanOrEqual(0);
    expect(liveNormalEnemies(world)).toBe(wave.maxAlive - 1);
    world.spawnTimer = 0;
    const before = world.enemies.count;
    spawnerSystem(world, DT);
    expect(world.enemies.count).toBe(before + wave.batchSize);
  });
});
