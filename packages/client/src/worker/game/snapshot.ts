import { ENEMY_LIST, type PassiveId, type WeaponId } from '@vs/shared';
import { ENEMY_FLAG_BOSS, ENEMY_FLAG_ELITE } from './enemies';
import type { World } from './world';

/** The `player` snapshot field (test bridge): position, facing and HP (#9), level and XP toward the next level (#11). */
export function readPlayerSnapshot(world: World): {
  x: number;
  y: number;
  facingX: -1 | 1;
  hp: number;
  maxHp: number;
  invulnerable: boolean;
  level: number;
  xp: number;
} {
  const { x, y, facingX, hp, maxHp, invulnTime, level, xp } = world.player;
  return { x, y, facingX, hp, maxHp, invulnerable: invulnTime > 0, level, xp };
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

/** The `passives` snapshot field (test bridge, #12): each owned passive's ID and level, in slot order. */
export function readPassives(world: World): { id: PassiveId; level: number }[] {
  return world.passives.map((p) => ({ id: p.def.id, level: p.level }));
}

/**
 * The `gemPositions` snapshot field (test bridge, #11): `[uid, tier, x, y, value]` per live gem (`tier` indexes
 * `GEM_ASSETS`: 0 blue, 1 green, 2 red), positions rounded to whole units. Built only when a snapshot is taken.
 */
export function readGemPositions(world: World): [number, number, number, number, number][] {
  const { count, uid, cols } = world.gems;
  const out: [number, number, number, number, number][] = [];
  for (let i = 0; i < count; i++)
    out.push([
      uid[i] ?? 0,
      cols.tier[i] ?? 0,
      Math.round(cols.x[i] ?? 0),
      Math.round(cols.y[i] ?? 0),
      cols.value[i] ?? 0,
    ]);
  return out;
}

/**
 * The `bosses` snapshot field (test bridge, #15): each live boss's enemy ID and its distance from the player, rounded
 * to whole units. Built only when a snapshot is taken.
 */
export function readBosses(world: World): { id: string; distance: number }[] {
  const { count, cols } = world.enemies;
  const out: { id: string; distance: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (((cols.flags[i] ?? 0) & ENEMY_FLAG_BOSS) === 0) continue;
    const distance = Math.hypot(
      (cols.x[i] ?? 0) - world.player.x,
      (cols.y[i] ?? 0) - world.player.y,
    );
    out.push({ id: ENEMY_LIST[cols.type[i] ?? 0] ?? '?', distance: Math.round(distance) });
  }
  return out;
}

/** The `chestPositions` snapshot field (test bridge, #15): `[x, y]` per chest on the ground, rounded to whole units. */
export function readChestPositions(world: World): [number, number][] {
  const { count, cols } = world.chests;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++)
    out.push([Math.round(cols.x[i] ?? 0), Math.round(cols.y[i] ?? 0)]);
  return out;
}

/** The `elites` snapshot field (test bridge, #21): live elite-flagged enemies. */
export function countElites(world: World): number {
  const { count, cols } = world.enemies;
  let n = 0;
  for (let i = 0; i < count; i++) if (((cols.flags[i] ?? 0) & ENEMY_FLAG_ELITE) !== 0) n++;
  return n;
}
