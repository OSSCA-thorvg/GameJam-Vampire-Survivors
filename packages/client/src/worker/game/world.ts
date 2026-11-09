import { createRng, type CharacterId, type ChestReward, type Rng } from '@vs/shared';
import type { Axis, Finale, RunMode, RunStats, RunSummary } from '../../protocol/worker-messages';
import type { PaintPool } from '../render/pool';
import { cameraSystem, createCamera, type Camera } from './camera';
import { chestDropSystem, createChestState, type ChestState } from './chests';
import { cleanupSystem } from './combat';
import { createEnemyState, type EnemyState } from './enemies';
import { createEventQueue, type EventQueue } from './events';
import { createFxState, fxSystem, type FxState } from './fx';
import { createGemState, gemDropSystem, gemSystem, type GemState } from './gems';
import { levelSystem } from './level';
import { createLightState, type LightState } from './light-sources';
import { createPickupState, type PickupState } from './pickups';
import { createPlayer, playerMovementSystem, type PlayerState } from './player';
import { type PassivesState } from './passives';
import { createProjectileState, projectileSystem, type ProjectileState } from './projectiles';
import { buildRunSummary, createRunStatsState, type RunStatsState } from './run-stats';
import { applyCharacter, resolveCharacter } from './start-run';
import { bossTetherSystem } from './systems/bosses';
import { chestOpenSystem } from './systems/chest-open';
import { contactDamageSystem } from './systems/contact-damage';
import { enemyMovementSystem } from './systems/enemy-movement';
import { enemyRelocateSystem } from './systems/enemy-relocate';
import { finaleSystem } from './systems/finale';
import {
  createInterferenceState,
  interferenceApplySystem,
  interferenceCollectSystem,
  interferenceDropSystem,
  type InterferenceState,
} from './systems/interference';
import type { FreezeState } from './systems/freeze';
import { lightSourceSystem } from './systems/light-sources';
import { pickupSystem } from './systems/pickups';
import { recoverySystem } from './systems/recovery';
import { spawnerSystem } from './systems/spawner';
import type { SpawnLog } from './spawn-log';
import { stageEventSystem } from './systems/stage-events';
import { createWeaponContext, type WeaponContext } from './weapons/context';
import { type WeaponsState } from './weapons/owned';
import { createWeaponVisuals, type WeaponVisuals } from './weapons/visuals';
import { weaponSystem } from './weapons/system';

export interface WorldOptions {
  seed: number;
  /** The `CharacterId` to play (#14); an unknown or omitted id plays `CHARACTERS[0]` (Warden). */
  characterId?: string;
  /** The view's enemy pools (`GameView.enemyPools`, #9). Omitted in unit tests: the world then only simulates. */
  enemyPools?: readonly PaintPool[];
  /** The view's projectile and effect pools (`GameView.projectilePools`, `GameView.fxPools`, #10); omitted like `enemyPools`. */
  projectilePools?: readonly PaintPool[];
  fxPools?: readonly PaintPool[];
  /** The view's gem pools (`GameView.gemPools`, #11), in `GEM_ASSETS` order; omitted like `enemyPools`. */
  gemPools?: readonly PaintPool[];
  /** The view's light and pickup pools (`GameView.lightPools`, `GameView.pickupPools`, #16); omitted like `enemyPools`. */
  lightPools?: readonly PaintPool[];
  pickupPools?: readonly PaintPool[];
  /** The view's chest pool (`GameView.chestPool`, #15); omitted like `enemyPools`. */
  chestPool?: PaintPool;
  /** What the time limit does (#17); `'death'` when omitted. */
  finale?: Finale;
  /** Who the run is for (#20); `'single'` when omitted. */
  mode?: RunMode;
  /** Dev and e2e builds (#20): records the first spawner spawns for the `spawnLog` snapshot field. */
  spawnLog?: SpawnLog;
  /**
   * Store sizes past the content caps, for #22's stress scenarios only (`worker/debug/stress-scenarios.ts`), so the
   * caps can be measured. Omitted in every game run: the stores then hold `ENEMY_CAP`, `PROJECTILE_CAP` and `GEM_CAP`.
   */
  capacity?: StoreCapacity;
  /**
   * Called once, with the run's summary, in the step where HP reaches 0 or a `finale: 'end'` run reaches the time
   * limit.
   */
  onGameOver?: (summary: RunSummary) => void;
}

/** All state for one run. Later issues add their state here. */
export interface World
  extends
    EnemyState,
    ProjectileState,
    FxState,
    WeaponsState,
    PassivesState,
    GemState,
    LightState,
    PickupState,
    FreezeState,
    ChestState,
    RunStatsState,
    InterferenceState {
  readonly seed: number;
  /** The character played (#14), always a known id: `startRun`'s id, or `CHARACTERS[0]` when that was unknown. */
  readonly characterId: CharacterId;
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
  /** Seconds until the next boss tether pass (#15). */
  tetherTimer: number;
  /** `rng.fork('chests')`: the chest rewards' only randomness (#15), so chests never shift other streams. */
  readonly chestRng: Rng;
  /**
   * The rewards of the chest opened and not closed yet (#15). While set the world does not step: the chest overlay is
   * open (`createChestFlow`), as with `pendingLevelUps`.
   */
  chestRewards: ChestReward[] | null;
  /** Dev only (#15, #17's `I` key): contact damage does nothing while set. Always false in a normal run. */
  debugInvulnerable: boolean;
  /** `rng.fork('weapons')`: every weapon pattern's randomness (#10), so weapons never shift the spawn stream. */
  readonly weaponRng: Rng;
  /** What the weapon patterns read and call, bound to this world (#10). */
  readonly weaponContext: WeaponContext;
  /** The King Bible books and the garlic aura this step (#13), drawn by the game view. */
  readonly weaponVisuals: WeaponVisuals;
  /** This step's events (#9): cleared before the first system, so each event lives for exactly one step. */
  readonly events: EventQueue;
  /**
   * Set to `'dead'` by the contact damage system when HP reaches 0, or to `'ended'` by the finale of a `finale: 'end'`
   * run (#17); that step ends early and the world no longer steps.
   */
  state: 'running' | 'dead' | 'ended';
  /** What the time limit does (#17). */
  readonly finale: Finale;
  /** Who the run is for (#20): a `'versus'` run reports its status to the main thread. */
  readonly mode: RunMode;
  /** The spawner's log (#20), or `null` (production builds and unit tests that pass none). */
  readonly spawnLog: SpawnLog | null;
  /** The next entry of `STAGE.events` to fire (#17); also the number fired so far. */
  nextEventIndex: number;
  /** Set once `time` reaches `STAGE.durationSec` (#17): the spawner and the stage events stop. */
  cleared: boolean;
  /** `rng.fork('levelup')`: the level-up options' only randomness (#11). */
  readonly levelUpRng: Rng;
  /**
   * Level-ups gained and not chosen yet (#11). While above 0 the world does not step: the level-up screen is open
   * (`createLevelUpFlow`), and only the local world pauses (ADR 0004).
   */
  pendingLevelUps: number;
  /**
   * Weapon hits on live enemies and the damage they dealt since the run started (#12), bumped only by `damageEnemy`.
   * Read by the `damageDealt` snapshot field, so a journey can measure the damage per hit; nothing in the game reads it.
   */
  readonly damageDealt: { hits: number; total: number };
  /** Shown on the results screen. `kills` rises from #10, `level` from #11; `timeSec` mirrors `time`. */
  readonly stats: RunStats;
  /**
   * Runs `SYSTEMS` in order, then advances `time` (not in the step that ends the run at the time limit); calls
   * `onGameOver` in the step that ends the run (dead or ended). Does nothing once the run is over, while a level-up
   * choice is pending, or while a chest is open (#15).
   */
  step(dt: number): void;
}

export type System = (world: World, dt: number) => void;

/** `WorldOptions.capacity`: live entities each store can hold. */
export interface StoreCapacity {
  enemies?: number;
  projectiles?: number;
  gems?: number;
}

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
  interferenceApplySystem,
  playerMovementSystem,
  cameraSystem,
  lightSourceSystem,
  finaleSystem,
  spawnerSystem,
  stageEventSystem,
  enemyMovementSystem,
  enemyRelocateSystem,
  bossTetherSystem,
  contactDamageSystem,
  recoverySystem,
  weaponSystem,
  projectileSystem,
  pickupSystem,
  interferenceCollectSystem,
  fxSystem,
  cleanupSystem,
  chestDropSystem,
  interferenceDropSystem,
  gemDropSystem,
  gemSystem,
  levelSystem,
  chestOpenSystem,
];

export function createWorld({
  seed,
  characterId = 'warden',
  enemyPools,
  projectilePools,
  fxPools,
  gemPools,
  lightPools,
  pickupPools,
  chestPool,
  finale = 'death',
  mode = 'single',
  spawnLog,
  capacity,
  onGameOver,
}: WorldOptions): World {
  const rng = createRng(seed);
  const character = resolveCharacter(characterId);
  // A function, so TypeScript does not narrow `state` across the systems that may change it.
  const over = (): boolean => world.state !== 'running';
  const world: World = {
    seed,
    characterId: character.id,
    time: 0,
    rng,
    input: { dx: 0, dy: 0 },
    moveInput: { dx: 0, dy: 0 },
    player: createPlayer(),
    camera: createCamera(),
    ...createEnemyState(enemyPools, capacity?.enemies),
    ...createProjectileState(projectilePools, capacity?.projectiles),
    ...createFxState(fxPools),
    ...createGemState(gemPools, capacity?.gems),
    ...createLightState(rng, lightPools),
    ...createPickupState(rng, pickupPools),
    ...createInterferenceState(rng),
    freezeUntil: 0,
    ...createChestState(chestPool),
    ...createRunStatsState(),
    weapons: [],
    passives: [],
    weaponRng: rng.fork('weapons'),
    get weaponContext() {
      return weaponContext;
    },
    weaponVisuals: createWeaponVisuals(),
    spawnRng: rng.fork('spawn'),
    spawnTimer: 0,
    spawnQueue: 0,
    relocateRng: rng.fork('relocate'),
    relocateTimer: 0,
    tetherTimer: 0,
    chestRng: rng.fork('chests'),
    chestRewards: null,
    debugInvulnerable: false,
    levelUpRng: rng.fork('levelup'),
    pendingLevelUps: 0,
    events: createEventQueue(),
    state: 'running',
    // A versus run never spawns Death (ADR 0005): the time limit ends it.
    finale: mode === 'versus' ? 'end' : finale,
    mode,
    spawnLog: spawnLog ?? null,
    nextEventIndex: 0,
    cleared: false,
    damageDealt: { hits: 0, total: 0 },
    stats: { timeSec: 0, kills: 0, level: 1 },
    step(dt) {
      if (over() || world.pendingLevelUps > 0 || world.chestRewards) return;
      world.events.clear();
      for (const system of SYSTEMS) {
        system(world, dt);
        if (over()) break;
      }
      // An ended run stops at the time limit itself (#17).
      if (world.state !== 'ended') world.time += dt;
      world.stats.timeSec = world.time;
      if (over()) onGameOver?.(buildRunSummary(world));
    },
  };
  const weaponContext = createWeaponContext(world);
  applyCharacter(world, character);
  return world;
}

/** Empties every store of `world` (enemies, projectiles, effects, gems, lights, pickups, chests), as the session does before reusing the pools. */
export function clearWorld(world: World): void {
  world.gems.clear();
  world.chests.clear();
  world.enemies.clear();
  world.projectiles.clear();
  world.fx.clear();
  world.lights.clear();
  world.pickups.clear();
}
