import type { World } from './world';

/** The `player` snapshot field (test bridge). #9 adds `hp`, `maxHp`, #11 `level`, `xp` here. */
export function readPlayerSnapshot(world: World): { x: number; y: number; facingX: -1 | 1 } {
  const { x, y, facingX } = world.player;
  return { x, y, facingX };
}

/**
 * The `enemyPositions` snapshot field (test bridge, #8): `[uid, type, x, y]` per live enemy, positions rounded to
 * whole units. Built only when a snapshot is taken, never in the frame loop.
 */
export function readEnemyPositions(world: World): [number, number, number, number][] {
  const { count, uid, cols } = world.enemies;
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++)
    out.push([
      uid[i] ?? 0,
      cols.type[i] ?? 0,
      Math.round(cols.x[i] ?? 0),
      Math.round(cols.y[i] ?? 0),
    ]);
  return out;
}
