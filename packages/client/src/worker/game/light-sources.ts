import type { Scene } from '@thorvg/webcanvas';
import { LIGHT_SOURCE, PICKUPS, type DrawableAssetId, type Rng } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';
import type { PlayerState } from './player';
import { spawnPickup, PICKUP_FAMILY_LIGHT, type PickupState } from './pickups';

/**
 * Breakable light source columns (#16). `broken` 1 shows `stage.brazierBroken` and is no longer hittable; `hitT` is
 * the `world.time` of the last hit by a weapon with a hit cooldown (King Bible), so a light with more than 1 HP is not
 * hit every step.
 */
export const LIGHT_SCHEMA = {
  x: 'f32',
  y: 'f32',
  hp: 'f32',
  hitT: 'f32',
  broken: 'u8',
  ...RenderBinding.columns,
} as const;

export type LightStore = Store<typeof LIGHT_SCHEMA>;

/** The light art: pool 0 intact, pool 1 broken. */
export const LIGHT_ASSETS = [
  'stage.brazier',
  'stage.brazierBroken',
] as const satisfies readonly DrawableAssetId[];
export const LIGHT_INTACT = 0;
export const LIGHT_BROKEN = 1;

/** Hit radius of an intact light, in world units (the 24×40 brazier art; initial value). */
export const LIGHT_RADIUS = 12;

export interface LightState {
  lights: LightStore;
  /** `null` when the world only simulates (unit tests). */
  lightBinding: RenderBinding<typeof LIGHT_SCHEMA> | null;
  /** `rng.fork('lights')`: placement only, so lights never shift the spawn stream. */
  readonly lightRng: Rng;
  /** Seconds until the next recycle and placement pass; 0 at the start, so the first step places lights. */
  lightTimer: number;
}

/** What breaking a light needs: the store, the pickups it drops into, and the player's level and luck. */
export type LightWorld = LightState & PickupState & { player: PlayerState; time: number };

/** One pool per light asset in the `pickups` layer, each prewarmed to the store size. Created once by the game view. */
export function createLightPools(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool[] {
  return LIGHT_ASSETS.map((id) => new PaintPool(library, id, layer, LIGHT_SOURCE.poolSize));
}

export function createLightState(rng: Rng, pools?: readonly PaintPool[]): LightState {
  const lights = createStore(LIGHT_SCHEMA, LIGHT_SOURCE.poolSize);
  return {
    lights,
    lightBinding: pools ? new RenderBinding(lights, pools) : null,
    lightRng: rng.fork('lights'),
    lightTimer: 0,
  };
}

/** Places an intact light at (x, y). Returns the slot, or -1 when the store is full. */
export function addLight(world: LightState, x: number, y: number): number {
  const slot = world.lights.add();
  if (slot < 0) return -1;
  const { cols } = world.lights;
  cols.x[slot] = x;
  cols.y[slot] = y;
  cols.hp[slot] = LIGHT_SOURCE.hp;
  cols.hitT[slot] = -1e9;
  world.lightBinding?.bind(slot, LIGHT_INTACT);
  return slot;
}

export function removeLight(world: LightState, slot: number): void {
  world.lightBinding?.unbind(slot);
  world.lights.remove(slot);
}

/**
 * Picks a pickup for a broken light with `world.pickupRng`: among the `PICKUPS` whose `minPlayerLevel` is at most the
 * player's level, weighted by `weight × (luckAffected ? stats.luck : 1)`. Returns the `PICKUPS` index, or -1 when none
 * is eligible. Allocates nothing.
 */
export function rollPickup(world: Pick<LightWorld, 'player' | 'pickupRng'>): number {
  const { level, stats } = world.player;
  let total = 0;
  for (const def of PICKUPS)
    if (def.minPlayerLevel <= level) total += def.weight * (def.luckAffected ? stats.luck : 1);
  if (total <= 0) return -1;
  let roll = world.pickupRng.next() * total;
  let last = -1;
  for (let i = 0; i < PICKUPS.length; i++) {
    const def = PICKUPS[i];
    if (!def || def.minPlayerLevel > level) continue;
    last = i;
    roll -= def.weight * (def.luckAffected ? stats.luck : 1);
    if (roll < 0) return i;
  }
  return last;
}

/** Damages the intact light in `slot`; at 0 HP it breaks (art swap) and, with `dropChance`, drops a pickup there. */
function damageLight(world: LightWorld, slot: number, damage: number): void {
  const { cols } = world.lights;
  const hp = (cols.hp[slot] ?? 0) - damage;
  cols.hp[slot] = hp;
  if (hp > 0) return;
  cols.broken[slot] = 1;
  world.lightBinding?.unbind(slot);
  world.lightBinding?.bind(slot, LIGHT_BROKEN);
  if (world.pickupRng.next() >= LIGHT_SOURCE.dropChance) return;
  const def = rollPickup(world);
  if (def >= 0) spawnPickup(world, PICKUP_FAMILY_LIGHT, def, cols.x[slot] ?? 0, cols.y[slot] ?? 0);
}

/**
 * Hits every intact light whose circle overlaps the circle (x, y, r) for `damage`; with `cooldown > 0`, only lights
 * not hit by such a weapon for `cooldown` seconds. A linear scan of at most `LIGHT_SOURCE.poolSize` lights. Lights
 * never count as kills and never consume a projectile's pierce. Returns the number of lights hit.
 */
export function hitLightsInCircle(
  world: LightWorld,
  x: number,
  y: number,
  r: number,
  damage: number,
  cooldown = 0,
): number {
  const { cols, count } = world.lights;
  const reach = r + LIGHT_RADIUS;
  let hits = 0;
  for (let i = 0; i < count; i++) {
    if (cols.broken[i] === 1) continue;
    const dx = (cols.x[i] ?? 0) - x;
    const dy = (cols.y[i] ?? 0) - y;
    if (dx * dx + dy * dy > reach * reach) continue;
    if (cooldown > 0) {
      if (world.time - (cols.hitT[i] ?? 0) < cooldown) continue;
      cols.hitT[i] = world.time;
    }
    damageLight(world, i, damage);
    hits++;
  }
  return hits;
}

/** Hits every intact light whose circle overlaps the box (closest-point test), as the whip strike does enemies. */
export function hitLightsInBox(
  world: LightWorld,
  left: number,
  top: number,
  right: number,
  bottom: number,
  damage: number,
): number {
  const { cols, count } = world.lights;
  let hits = 0;
  for (let i = 0; i < count; i++) {
    if (cols.broken[i] === 1) continue;
    const lx = cols.x[i] ?? 0;
    const ly = cols.y[i] ?? 0;
    const qx = Math.min(Math.max(lx, left), right);
    const qy = Math.min(Math.max(ly, top), bottom);
    if ((lx - qx) ** 2 + (ly - qy) ** 2 > LIGHT_RADIUS * LIGHT_RADIUS) continue;
    damageLight(world, i, damage);
    hits++;
  }
  return hits;
}

/** The `lights` snapshot field (test bridge, #16): every light, positions rounded. Built only when a snapshot is taken. */
export function readLights(world: LightState): { x: number; y: number; broken: boolean }[] {
  const { count, cols } = world.lights;
  const out: { x: number; y: number; broken: boolean }[] = [];
  for (let i = 0; i < count; i++)
    out.push({
      x: Math.round(cols.x[i] ?? 0),
      y: Math.round(cols.y[i] ?? 0),
      broken: cols.broken[i] === 1,
    });
  return out;
}
