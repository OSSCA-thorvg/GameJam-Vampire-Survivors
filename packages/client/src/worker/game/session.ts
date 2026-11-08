import type { RunStats } from '../../protocol/worker-messages';
import type { GameView } from './view';
import { clearWorld, createWorld, type World } from './world';

/** Runs one world at a time on a long-lived view (#9): what the worker's `startRun` and `endRun` do. */
export interface Session {
  /** The current run; `null` before the first `start` and after `end`. */
  readonly world: World | null;
  /** Clears the previous run (stores and every pool, disposing nothing) and builds a fresh world on the same paints. */
  start(seed: number, characterId: string): World;
  /** Clears the run and hides everything: the empty frame of the screens between runs. */
  end(): void;
  /** Syncs the view to the current run; nothing outside a run. */
  render(): void;
}

export function createSession(view: GameView, onGameOver: (stats: RunStats) => void): Session {
  let world: World | null = null;
  return {
    get world() {
      return world;
    },
    start(seed, characterId) {
      if (world) clearWorld(world);
      view.begin();
      world = createWorld({
        seed,
        characterId,
        enemyPools: view.enemyPools,
        projectilePools: view.projectilePools,
        fxPools: view.fxPools,
        onGameOver,
      });
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
