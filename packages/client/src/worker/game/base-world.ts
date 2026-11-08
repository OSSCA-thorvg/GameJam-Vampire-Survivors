// Test helper: a world whose player has no character modifiers, for tests of the mechanics at `BASE_STATS`.
import { recomputeStats } from './stats';
import { createWorld, type World, type WorldOptions } from './world';

/**
 * `createWorld` (the default Warden and its Whip), with the character's modifiers removed and HP refilled, so the
 * player is at `BASE_STATS`: 100 HP, no armor, `BASE_MOVE_SPEED` (#14).
 */
export function createBaseWorld(options: WorldOptions): World {
  const world = createWorld(options);
  world.player.characterModifiers.length = 0;
  recomputeStats(world);
  world.player.hp = world.player.maxHp;
  return world;
}
