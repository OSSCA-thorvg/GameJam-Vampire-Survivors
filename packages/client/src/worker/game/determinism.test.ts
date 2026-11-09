import { expect, it } from 'vitest';
import type { Axis } from '../../protocol/worker-messages';
import { STAGE } from '@vs/shared';
import { readBosses } from './snapshot';
import { stepAnsweringLevelUps } from './test-level-ups';
import { createWorld, type World } from './world';

/** The same scripted input for every world: a few seconds per direction, with idle stretches. */
function script(step: number): { dx: Axis; dy: Axis } {
  const phase = Math.floor(step / 300) % 6;
  const dirs: [Axis, Axis][] = [
    [1, 0],
    [0, 0],
    [1, 1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ];
  const [dx, dy] = dirs[phase] ?? [0, 0];
  return { dx, dy };
}

function run(seed: number, steps: number, noise?: (world: World) => void): World {
  const world = createWorld({ seed });
  for (let i = 0; i < steps; i++) {
    world.input = script(i);
    noise?.(world);
    world.step(1 / 60);
  }
  return world;
}

it('gives the same enemy positions after 60 s for the same seed and input', () => {
  const a = run(1234, 3600);
  const b = run(1234, 3600);
  expect(a.enemies.count).toBeGreaterThan(15);
  expect(b.enemies.count).toBe(a.enemies.count);
  expect(b.enemies.cols.x).toEqual(a.enemies.cols.x);
  expect(b.enemies.cols.y).toEqual(a.enemies.cols.y);
  expect(b.enemies.cols.type).toEqual(a.enemies.cols.type);
});

it("keeps the spawner's draws independent of other systems' random calls", () => {
  const a = run(99, 3600);
  // Another system drawing from the root stream and its own forks every step must not shift the spawn schedule.
  const b = run(99, 3600, (world) => {
    world.rng.next();
    world.rng.fork('drops').next();
    world.rng.fork('interference').int(10);
  });
  expect(b.enemies.count).toBe(a.enemies.count);
  expect(b.enemies.cols.x).toEqual(a.enemies.cols.x);
  expect(b.enemies.cols.y).toEqual(a.enemies.cols.y);
  expect(b.enemies.cols.type).toEqual(a.enemies.cols.type);
});

it('differs for another seed', () => {
  const a = run(1, 600);
  const b = run(2, 600);
  expect(b.enemies.cols.x).not.toEqual(a.enemies.cols.x);
});

/** What the schedule produced at one minute: the enemy types and positions, the events fired and the bosses. */
interface MinuteRecord {
  minute: number;
  count: number;
  type: number[];
  x: number[];
  y: number[];
  eventsFired: number;
  cleared: boolean;
  bosses: string[];
}

/** A full 15-minute run (plus 5 s of the finale) with the scripted input, invulnerable, answering every level-up. */
function fullRun(seed: number): MinuteRecord[] {
  const world = createWorld({ seed });
  world.debugInvulnerable = true;
  const records: MinuteRecord[] = [];
  let step = 0;
  const total = (STAGE.durationSec + 5) * 60;
  stepAnsweringLevelUps(world, total, () => {
    step++;
    world.input = script(step);
    if (step % 3600 !== 0 && step !== total) return;
    const { count, cols } = world.enemies;
    records.push({
      minute: step / 3600,
      count,
      type: Array.from(cols.type.subarray(0, count)),
      x: Array.from(cols.x.subarray(0, count)),
      y: Array.from(cols.y.subarray(0, count)),
      eventsFired: world.nextEventIndex,
      cleared: world.cleared,
      bosses: readBosses(world).map((b) => b.id),
    });
  });
  return records;
}

// The safety fact of #17 (ADR 0005): the wave spawns, the timed events, the finale and Death depend only on the seed
// and the input. Long seeded simulation: CI runners are several times slower than local machines (#80).
it('gives the same spawns, events and finale over 15 minutes for the same seed and input', () => {
  const a = fullRun(2024);
  const b = fullRun(2024);
  expect(a).toHaveLength(16);
  for (const [i, record] of a.entries())
    expect(b[i], `minute ${String(record.minute)}`).toEqual(record);
  // Density rises over the run and stays within the cap; both bosses appear on time; the finale leaves only bosses.
  const byMinute = (m: number): MinuteRecord | undefined => a.find((r) => r.minute === m);
  expect(byMinute(14)?.count ?? 0).toBeGreaterThan(byMinute(1)?.count ?? Infinity);
  for (const r of a) expect(r.count).toBeLessThanOrEqual(400);
  expect(byMinute(6)?.eventsFired).toBe(STAGE.events.filter((event) => event.at < 360).length);
  expect(byMinute(6)?.bosses).toContain('reaper5');
  expect(byMinute(11)?.bosses).toContain('reaper10');
  const last = a.at(-1);
  expect(last?.cleared).toBe(true);
  expect(last?.eventsFired).toBe(STAGE.events.length);
  expect(last?.bosses).toContain('death');
  expect(last?.count).toBe(last?.bosses.length);
}, 120_000);
