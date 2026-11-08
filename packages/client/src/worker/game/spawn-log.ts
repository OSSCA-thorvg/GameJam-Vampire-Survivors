import type { EnemyId } from '@vs/shared';

/** Spawns kept by the log (#20): the first 64 of a run, enough to compare two worlds' schedules. */
export const SPAWN_LOG_SIZE = 64;

export interface SpawnEntry {
  enemyId: EnemyId;
  timeS: number;
}

/**
 * The first `SPAWN_LOG_SIZE` spawner spawns of a run (#20), for the dev/e2e `spawnLog` snapshot field that proves
 * two versus worlds share one wave schedule. Entries are preallocated, so recording allocates nothing.
 */
export interface SpawnLog {
  record(enemyId: EnemyId, timeS: number): void;
  /** A copy of the recorded entries, oldest first. */
  read(): SpawnEntry[];
  clear(): void;
}

export function createSpawnLog(): SpawnLog {
  const entries: SpawnEntry[] = Array.from({ length: SPAWN_LOG_SIZE }, () => ({
    enemyId: 'bat',
    timeS: 0,
  }));
  let count = 0;
  return {
    record(enemyId, timeS) {
      const entry = entries[count];
      if (!entry) return;
      entry.enemyId = enemyId;
      entry.timeS = timeS;
      count++;
    },
    read() {
      return entries.slice(0, count).map((e) => ({ ...e }));
    },
    clear() {
      count = 0;
    },
  };
}
