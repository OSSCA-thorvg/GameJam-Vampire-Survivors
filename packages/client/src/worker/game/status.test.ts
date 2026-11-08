import { describe, expect, it } from 'vitest';
import type { WorkerStatus } from '../../protocol/worker-messages';
import { createStatusEmitter, readStatus, STATUS_INTERVAL_SEC } from './status';
import { createWorld } from './world';

const DT = 1 / 60;

function run(mode: 'single' | 'versus', steps: number) {
  const posted: WorkerStatus[] = [];
  const emitter = createStatusEmitter((m) => posted.push(m));
  const world = createWorld({ seed: 7, mode });
  world.debugInvulnerable = true;
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    emitter.afterStep(world, DT);
    // A level-up would freeze the world; drop it so the run keeps stepping.
    world.pendingLevelUps = 0;
  }
  return { posted, world, emitter };
}

describe('status emitter (#20)', () => {
  it('posts once per 250 ms of simulated time at 60 Hz steps in a versus run', () => {
    expect(STATUS_INTERVAL_SEC).toBe(0.25);
    const { posted } = run('versus', 600);
    expect(posted).toHaveLength(40);
    expect(posted.map((s) => s.elapsedMs)).toEqual(
      Array.from({ length: 40 }, (_, i) => (i + 1) * 250),
    );
    expect(posted.every((s) => s.alive && s.hp <= s.maxHp && s.hp >= 0)).toBe(true);
  });

  it('posts nothing in a single-player run', () => {
    expect(run('single', 600).posted).toEqual([]);
  });

  it('posts one last status with alive false when the versus player dies, and nothing after', () => {
    const posted: WorkerStatus[] = [];
    const emitter = createStatusEmitter((m) => posted.push(m));
    const world = createWorld({ seed: 7, mode: 'versus' });
    world.player.hp = -5;
    world.state = 'dead';
    emitter.final(world);
    emitter.afterStep(world, 1);
    expect(posted).toEqual([{ ...readStatus(world), hp: 0, alive: false }]);
    const single = createWorld({ seed: 7 });
    single.state = 'dead';
    emitter.final(single);
    expect(posted).toHaveLength(1);
  });

  it('clamps HP into 0..maxHp and reports whole numbers', () => {
    const world = createWorld({ seed: 1, mode: 'versus' });
    world.player.hp = world.player.maxHp + 50;
    world.time = 1.2344;
    expect(readStatus(world)).toMatchObject({ hp: world.player.maxHp, elapsedMs: 1234 });
  });

  it('a versus world always ends at the time limit (finale end), whatever finale is asked', () => {
    expect(createWorld({ seed: 1, mode: 'versus', finale: 'death' }).finale).toBe('end');
    expect(createWorld({ seed: 1 }).mode).toBe('single');
  });
});
