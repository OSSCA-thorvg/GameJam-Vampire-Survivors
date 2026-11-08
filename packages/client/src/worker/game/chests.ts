import type { Scene } from '@thorvg/webcanvas';
import type { AssetLibrary } from '../assets/library';
import { createStore, type Store } from '../ecs/store';
import { PaintPool, RenderBinding } from '../render/pool';
import { ENEMY_FLAG_BOSS, ENEMY_FLAG_ELITE } from './enemies';
import type { World } from './world';

/** Treasure chests on the ground (#15), dropped by bosses and elites, drawn with `pickup.chest`. */
export const CHEST_SCHEMA = { x: 'f32', y: 'f32', ...RenderBinding.columns } as const;

export type ChestStore = Store<typeof CHEST_SCHEMA>;

/** Chests on the ground at most (initial value); a drop beyond it is skipped. */
export const CHEST_CAP = 16;

export interface ChestState {
  chests: ChestStore;
  /** `null` when the world only simulates (unit tests). One pool, `pickup.chest`. */
  chestBinding: RenderBinding<typeof CHEST_SCHEMA> | null;
}

/** The one chest pool in the `pickups` layer, prewarmed to `CHEST_CAP`. Created once per worker by the game view. */
export function createChestPool(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
): PaintPool {
  return new PaintPool(library, 'pickup.chest', layer, CHEST_CAP);
}

export function createChestState(pool?: PaintPool): ChestState {
  const chests = createStore(CHEST_SCHEMA, CHEST_CAP);
  return { chests, chestBinding: pool ? new RenderBinding(chests, [pool]) : null };
}

/** Puts a chest at (x, y). Returns the slot, or -1 at `CHEST_CAP`. */
export function addChest(world: ChestState, x: number, y: number): number {
  const slot = world.chests.add();
  if (slot < 0) return -1;
  world.chests.cols.x[slot] = x;
  world.chests.cols.y[slot] = y;
  world.chestBinding?.bind(slot, 0);
  return slot;
}

/** Removes the chest in `slot`, unbinding its paint first. */
export function removeChest(world: ChestState, slot: number): void {
  world.chestBinding?.unbind(slot);
  world.chests.remove(slot);
}

const DROPS_CHEST = ENEMY_FLAG_BOSS | ENEMY_FLAG_ELITE;

/** Inserted right after `cleanupSystem` (#15): one chest where each boss or elite of this step's `enemyKilled` died. */
export function chestDropSystem(world: World): void {
  const { items, count } = world.events;
  for (let i = 0; i < count; i++) {
    const event = items[i];
    if (event?.kind === 'enemyKilled' && (event.flags & DROPS_CHEST) !== 0)
      addChest(world, event.x, event.y);
  }
}
