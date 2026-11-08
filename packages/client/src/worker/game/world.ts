import type { Scene } from '@thorvg/webcanvas';
import { createRng, type Rng } from '@vs/shared';
import type { Axis } from '../../protocol/worker-messages';
import type { AssetInstance, AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { createGround, type Ground } from '../render/ground';
import { PaintPool } from '../render/pool';
import { setTransform } from '../render/transform';
import { cameraSystem, createCamera, snapToPixel, type Camera } from './camera';
import { createPlayer, playerMovementSystem, type PlayerState } from './player';

/** What the world draws into: #6's layers, the asset library and the current device-pixel scale. */
export interface WorldView {
  library: Pick<AssetLibrary, 'create'>;
  layers: {
    world: Pick<Scene, 'translate'>;
    ground: Pick<Scene, 'add'>;
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
export interface World {
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
  /** Runs `SYSTEMS` in order, then advances `time`. */
  step(dt: number): void;
  /** Syncs the ground, then the player. Does not call `canvas.update()`/`render()`; the worker does that once. */
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
export const SYSTEMS: readonly System[] = [inputSystem, playerMovementSystem, cameraSystem];

export function createWorld({ seed, characterId = 'warden', view }: WorldOptions): World {
  let ground: Ground | null = null;
  let playerSprite: AssetInstance | null = null;
  if (view) {
    ground = createGround(view.library, view.layers.ground);
    const playerPool = new PaintPool(view.library, 'player.warden', view.layers.player, 1);
    playerSprite = playerPool.get(playerPool.acquire());
  }
  const world: World = {
    seed,
    characterId,
    time: 0,
    rng: createRng(seed),
    input: { dx: 0, dy: 0 },
    moveInput: { dx: 0, dy: 0 },
    player: createPlayer(),
    camera: createCamera(),
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
      if (playerSprite) setTransform(playerSprite, player.x, player.y, 0, 1, player.facingX < 0);
    },
  };
  return world;
}
