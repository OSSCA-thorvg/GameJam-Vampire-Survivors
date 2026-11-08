import type { World } from './world';

/** The `player` snapshot field (test bridge). #9 adds `hp`, `maxHp`, #11 `level`, `xp` here. */
export function readPlayerSnapshot(world: World): { x: number; y: number; facingX: -1 | 1 } {
  const { x, y, facingX } = world.player;
  return { x, y, facingX };
}
