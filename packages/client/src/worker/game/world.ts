import type { Scene } from '@thorvg/webcanvas';
import { createRng, type Rng } from '@vs/shared';
import type { Axis } from '../../protocol/worker-messages';
import type { AssetInstance, AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { createGround, type Ground } from '../render/ground';
import { PaintPool } from '../render/pool';
import { setTransform } from '../render/transform';
import { cameraSystem, createCamera, snapToPixel, type Camera } from './camera';
import { createEnemyState, type EnemyState } from './enemies';
import { createPlayer, playerMovementSystem, type PlayerState } from './player';
import { enemyMovementSystem } from './systems/enemy-movement';
import { enemyRelocateSystem } from './systems/enemy-relocate';
import { spawnerSystem } from './systems/spawner';

/** What the world draws into: #6's layers, the asset library and the current device-pixel scale. */
export interface WorldView {
  library: Pick<AssetLibrary, 'create'>;
  layers: {
    world: Pick<Scene, 'translate'>;
    ground: Pick<Scene, 'add'>;
    enemies: Pick<Scene, 'add'>;
    player: Pick<Scene, 'add'>;
  };
  /** Device pixels per logical unit (#2's `init`/`resize` scale), read every frame. */
  scale: () => number;
}

export interface WorldOptions {
  seed: number;
  /** Stored, unused until #14. */
  characterId?: string;
  /** Omitted in unit tests: the world then only simulates. */
  view?: WorldView;
}

/** All state for one run. Later issues add their state here. */
export interface World extends EnemyState {
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
  /** Runs `SYSTEMS` in order, then advances `time`. */
  step(dt: number): void;
  /** Syncs the ground, the enemies, then the player. Does not call `canvas.update()`/`render()`; the worker does that once. */
  render(alpha: number): void;
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
];

export function createWorld({ seed, characterId = 'warden', view }: WorldOptions): World {
  let ground: Ground | null = null;
  let playerSprite: AssetInstance | null = null;
  if (view) {
    ground = createGround(view.library, view.layers.ground);
    const playerPool = new PaintPool(view.library, 'player.warden', view.layers.player, 1);
    playerSprite = playerPool.get(playerPool.acquire());
  }
  const rng = createRng(seed);
  const world: World = {
    seed,
    characterId,
    time: 0,
    rng,
    input: { dx: 0, dy: 0 },
    moveInput: { dx: 0, dy: 0 },
    player: createPlayer(),
    camera: createCamera(),
    ...createEnemyState(view && { library: view.library, layer: view.layers.enemies }),
    spawnRng: rng.fork('spawn'),
    spawnTimer: 0,
    spawnQueue: 0,
    relocateRng: rng.fork('relocate'),
    relocateTimer: 0,
    step(dt) {
      for (const system of SYSTEMS) system(world, dt);
      world.time += dt;
    },
    render() {
      if (!view) return;
      const scale = view.scale();
      const { camera, player } = world;
      view.layers.world.translate(
        snapToPixel(VIEW_WIDTH / 2 - camera.x, scale),
        snapToPixel(VIEW_HEIGHT / 2 - camera.y, scale),
      );
      ground?.sync(camera.x, camera.y);
      const { enemies } = world;
      world.enemyBinding?.sync(
        enemies,
        enemies.cols.x,
        enemies.cols.y,
        undefined,
        enemies.cols.flip,
      );
      if (playerSprite) setTransform(playerSprite, player.x, player.y, 0, 1, player.facingX < 0);
    },
  };
  return world;
}
