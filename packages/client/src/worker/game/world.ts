import { createRng, type Rng } from '@vs/shared';
import type { Axis, RunStats } from '../../protocol/worker-messages';
import type { PaintPool } from '../render/pool';
import { cameraSystem, createCamera, type Camera } from './camera';
import { cleanupSystem } from './combat';
import { createEnemyState, type EnemyState } from './enemies';
import { createEventQueue, type EventQueue } from './events';
import { createFxState, fxSystem, type FxState } from './fx';
import { createPlayer, playerMovementSystem, type PlayerState } from './player';
import { createProjectileState, projectileSystem, type ProjectileState } from './projectiles';
import { contactDamageSystem } from './systems/contact-damage';
import { enemyMovementSystem } from './systems/enemy-movement';
import { enemyRelocateSystem } from './systems/enemy-relocate';
import { spawnerSystem } from './systems/spawner';
import { createWeaponContext, type WeaponContext } from './weapons/context';
import { addWeapon, type WeaponsState } from './weapons/owned';
import { weaponSystem } from './weapons/system';

export interface WorldOptions {
  seed: number;
  /** Stored, unused until #14. */
  characterId?: string;
  /** The view's enemy pools (`GameView.enemyPools`, #9). Omitted in unit tests: the world then only simulates. */
  enemyPools?: readonly PaintPool[];
  /** The view's projectile and effect pools (`GameView.projectilePools`, `GameView.fxPools`, #10); omitted like `enemyPools`. */
  projectilePools?: readonly PaintPool[];
  fxPools?: readonly PaintPool[];
  /** Called once, with the final stats, in the step where HP reaches 0. */
  onGameOver?: (stats: RunStats) => void;
}

/** All state for one run. Later issues add their state here. */
export interface World extends EnemyState, ProjectileState, FxState, WeaponsState {
  readonly seed: number;
  readonly characterId: string;
  /** Simulated seconds. */
  time: number;
  /** Root stream. Each system forks its own named stream (`world.rng.fork('spawn')`, #8) and never draws from it. */
  readonly rng: Rng;
  /** The latest `input` message from the main thread. */
  input: { dx: Axis; dy: Axis };
  /** `input` as copied by `inputSystem` at the start of the step; what the movement system reads. */
  moveInput: { dx: Axis; dy: Axis };
  player: PlayerState;
  camera: Camera;
  /** `rng.fork('spawn')`: the spawner's only randomness, so both players of a match get the same schedule (#8). */
  readonly spawnRng: Rng;
  /** Seconds until the next wave batch; starts at 0, so the first batch spawns on the first step. */
  spawnTimer: number;
  /** Spawns waiting, at most `MAX_SPAWNS_PER_STEP` per step. */
  spawnQueue: number;
  /** `rng.fork('relocate')`: relocation never shifts the spawn stream. */
  readonly relocateRng: Rng;
  /** Seconds until the next relocation pass. */
  relocateTimer: number;
  /** `rng.fork('weapons')`: every weapon pattern's randomness (#10), so weapons never shift the spawn stream. */
  readonly weaponRng: Rng;
  /** What the weapon patterns read and call, bound to this world (#10). */
  readonly weaponContext: WeaponContext;
  /** This step's events (#9): cleared before the first system, so each event lives for exactly one step. */
  readonly events: EventQueue;
  /** Set to `'dead'` by the contact damage system when HP reaches 0; that step ends early and a dead world no longer steps. */
  state: 'running' | 'dead';
  /** Shown on the results screen. `kills` rises from #10, `level` from #11; `timeSec` mirrors `time`. */
  readonly stats: RunStats;
  /** Runs `SYSTEMS` in order, then advances `time`; calls `onGameOver` in the step that ends dead. Does nothing once dead. */
  step(dt: number): void;
}

export type System = (world: World, dt: number) => void;

/** Copies the latest input into the movement input, so a step sees one consistent direction. */
export const inputSystem: System = (world) => {
  world.moveInput.dx = world.input.dx;
  world.moveInput.dy = world.input.dy;
};

/**
 * The systems of one step, in order. Later issues insert theirs at the position they state; nothing else calls a
 * system directly.
 */
export const SYSTEMS: readonly System[] = [
  inputSystem,
  playerMovementSystem,
  cameraSystem,
  spawnerSystem,
  enemyMovementSystem,
  enemyRelocateSystem,
  contactDamageSystem,
  weaponSystem,
  projectileSystem,
  fxSystem,
  cleanupSystem,
];

export function createWorld({
  seed,
  characterId = 'warden',
  enemyPools,
  projectilePools,
  fxPools,
  onGameOver,
}: WorldOptions): World {
  const rng = createRng(seed);
  // A function, so TypeScript does not narrow `state` across the systems that may change it.
  const dead = (): boolean => world.state === 'dead';
  const world: World = {
    seed,
    characterId,
    time: 0,
    rng,
    input: { dx: 0, dy: 0 },
    moveInput: { dx: 0, dy: 0 },
    player: createPlayer(),
    camera: createCamera(),
    ...createEnemyState(enemyPools),
    ...createProjectileState(projectilePools),
    ...createFxState(fxPools),
    weapons: [],
    weaponRng: rng.fork('weapons'),
    get weaponContext() {
      return weaponContext;
    },
    spawnRng: rng.fork('spawn'),
    spawnTimer: 0,
    spawnQueue: 0,
    relocateRng: rng.fork('relocate'),
    relocateTimer: 0,
    events: createEventQueue(),
    state: 'running',
    stats: { timeSec: 0, kills: 0, level: 1 },
    step(dt) {
      if (dead()) return;
      world.events.clear();
      for (const system of SYSTEMS) {
        system(world, dt);
        if (dead()) break;
      }
      world.time += dt;
      world.stats.timeSec = world.time;
      if (dead()) onGameOver?.({ ...world.stats });
    },
  };
  const weaponContext = createWeaponContext(world);
  // The default character's starting weapon; #14 makes it per character.
  addWeapon(world, 'whip');
  return world;
}

/** Empties every store of `world` (enemies, projectiles, effects), as the session does before reusing the pools. */
export function clearWorld(world: World): void {
  world.enemies.clear();
  world.projectiles.clear();
  world.fx.clear();
}
