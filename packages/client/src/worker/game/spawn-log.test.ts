import { expect, it } from 'vitest';
import { createSpawnLog, SPAWN_LOG_SIZE } from './spawn-log';
import { createWorld } from './world';

it('records the first 64 spawner spawns, identical for two worlds with one seed and no input (#20)', () => {
  const logs = [createSpawnLog(), createSpawnLog()];
  const worlds = logs.map((spawnLog) => createWorld({ seed: 42, mode: 'versus', spawnLog }));
  for (let i = 0; i < 60 * 60; i++)
    for (const w of worlds) {
      w.debugInvulnerable = true;
      w.pendingLevelUps = 0;
      w.step(1 / 60);
    }
  const [a, b] = logs.map((l) => l.read());
  expect(a).toHaveLength(SPAWN_LOG_SIZE);
  expect(b).toEqual(a);
  expect(a?.[0]).toEqual({ enemyId: 'bat', timeS: 0 });
  logs[0]?.clear();
  expect(logs[0]?.read()).toEqual([]);
});

it('a world without a log spawns the same schedule (recording draws no randomness)', () => {
  const spawnLog = createSpawnLog();
  const logged = createWorld({ seed: 9, spawnLog });
  const plain = createWorld({ seed: 9 });
  for (let i = 0; i < 600; i++)
    for (const w of [logged, plain]) {
      w.pendingLevelUps = 0;
      w.step(1 / 60);
    }
  expect(logged.enemies.cols.x).toEqual(plain.enemies.cols.x);
  expect(spawnLog.read().length).toBeGreaterThan(0);
});
