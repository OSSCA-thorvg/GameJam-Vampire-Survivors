import type { Finale, RunMode, RunSummary } from '../../protocol/worker-messages';
import type { SpawnLog } from './spawn-log';
import type { GameView } from './view';
import { clearWorld, createWorld, type StoreCapacity, type World } from './world';

/** Runs one world at a time on a long-lived view (#9): what the worker's `startRun` and `endRun` do. */
export interface Session {
  /** The current run; `null` before the first `start` and after `end`. */
  readonly world: World | null;
  /**
   * Clears the previous run (stores and every pool, disposing nothing) and builds a fresh world on the same paints.
   * `finale` (#17) defaults to `'death'`, `mode` (#20) to `'single'`. `capacity` is for #22's stress scenarios only
   * (`WorldOptions.capacity`).
   */
  start(
    seed: number,
    characterId: string,
    finale?: Finale,
    mode?: RunMode,
    capacity?: StoreCapacity,
  ): World;
  /** Clears the run and hides everything: the empty frame of the screens between runs. Clears `matchEndsAt`. */
  end(): void;
  /**
   * #177, ADR 0026: when the versus match's server deadline falls on the worker's `performance.now()` clock, or `null`
   * (single player, or the match is over): the HUD's match clock counts down to it.
   */
  matchEndsAt: number | null;
  /** Syncs the view to the current run at `now` (worker `performance.now()` ms, for the match clock); nothing outside a run. */
  render(now?: number): void;
}

/** `spawnLog` (#20, dev and e2e builds) is cleared and handed to every new world. */
export function createSession(
  view: GameView,
  onGameOver: (summary: RunSummary) => void,
  spawnLog?: SpawnLog,
): Session {
  let world: World | null = null;
  let matchEndsAt: number | null = null;
  return {
    get world() {
      return world;
    },
    get matchEndsAt() {
      return matchEndsAt;
    },
    set matchEndsAt(at: number | null) {
      matchEndsAt = at;
    },
    start(seed, characterId, finale, mode, capacity) {
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
        capacity,
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
      matchEndsAt = null;
    },
    render(now) {
      if (!world) return;
      view.render(world, matchEndsAt === null || now === undefined ? null : matchEndsAt - now);
    },
  };
}
