import type { Finale, RunMode, RunSummary } from '../../protocol/worker-messages';
import type { SpawnLog } from './spawn-log';
import type { GameView } from './view';
import { clearWorld, createWorld, type World } from './world';

/** Runs one world at a time on a long-lived view (#9): what the worker's `startRun` and `endRun` do. */
export interface Session {
  /** The current run; `null` before the first `start` and after `end`. */
  readonly world: World | null;
  /**
   * Clears the previous run (stores and every pool, disposing nothing) and builds a fresh world on the same paints.
   * `finale` (#17) defaults to `'death'`, `mode` (#20) to `'single'`.
   */
  start(seed: number, characterId: string, finale?: Finale, mode?: RunMode): World;
  /** Clears the run and hides everything: the empty frame of the screens between runs. */
  end(): void;
  /** Syncs the view to the current run; nothing outside a run. */
  render(): void;
}

/** `spawnLog` (#20, dev and e2e builds) is cleared and handed to every new world. */
export function createSession(
  view: GameView,
  onGameOver: (summary: RunSummary) => void,
  spawnLog?: SpawnLog,
): Session {
  let world: World | null = null;
  return {
    get world() {
      return world;
    },
    start(seed, characterId, finale, mode) {
      if (world) clearWorld(world);
      spawnLog?.clear();
      world = createWorld({
        seed,
        characterId,
        enemyPools: view.enemyPools,
        projectilePools: view.projectilePools,
        fxPools: view.fxPools,
        gemPools: view.gemPools,
        lightPools: view.lightPools,
        pickupPools: view.pickupPools,
        chestPool: view.chestPool,
        finale,
        mode,
        ...(spawnLog ? { spawnLog } : {}),
        onGameOver,
      });
      // After `createWorld`, which resolves an unknown id to the default character; it acquires no paint.
      view.begin(world.characterId);
      return world;
    },
    end() {
      if (world) clearWorld(world);
      view.clear();
      world = null;
    },
    render() {
      if (world) view.render(world);
    },
  };
}
