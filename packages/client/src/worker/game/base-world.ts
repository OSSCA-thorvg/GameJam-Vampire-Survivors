// Test helper: a world whose player has no character modifiers, for tests of the mechanics at `BASE_STATS`.
import { recomputeStats } from './stats';
import { createWorld, type World, type WorldOptions } from './world';

/**
 * `createWorld` (the default Warden and its Whip), with the character's modifiers removed and HP refilled, so the
 * player is at `BASE_STATS` (#14). Since #148 that includes the built-in PowerUp equivalent: `BASE_MAX_HP` 120 HP,
 * 1 armor, 0.2 HP/s recovery, might 1.1, cooldown 0.95, magnet 1.25 and growth 1.1, at `BASE_MOVE_SPEED`. Tests that
 * need identity factors or no recovery set them explicitly.
 */
export function createBaseWorld(options: WorldOptions): World {
  const world = createWorld(options);
  world.player.characterModifiers.length = 0;
  recomputeStats(world);
  world.player.hp = world.player.maxHp;
  return world;
}
