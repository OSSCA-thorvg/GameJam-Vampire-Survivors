import type { WeaponId } from '@vs/shared';
import type { World } from './world';

/** The `player` snapshot field (test bridge): position, facing and HP (#9). #11 adds `level`, `xp` here. */
export function readPlayerSnapshot(world: World): {
  x: number;
  y: number;
  facingX: -1 | 1;
  hp: number;
  maxHp: number;
  invulnerable: boolean;
} {
  const { x, y, facingX, hp, maxHp, invulnTime } = world.player;
  return { x, y, facingX, hp, maxHp, invulnerable: invulnTime > 0 };
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

/** The `weapons` snapshot field (test bridge, #10): each owned weapon's ID and level, in slot order. */
export function readWeapons(world: World): { id: WeaponId; level: number }[] {
  return world.weapons.map((w) => ({ id: w.def.id, level: w.level }));
}
