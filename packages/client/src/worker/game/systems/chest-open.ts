import {
  CHEST_HEAL,
  CHEST_ODDS,
  EVOLUTIONS,
  EVOLUTION_MIN_TIME_S,
  PLAYER_RADIUS,
  type ChestReward,
  type EvolutionDef,
  type PassiveId,
  type WeaponId,
} from '@vs/shared';
import type { WorkerToMain } from '../../../protocol/worker-messages';
import { removeChest } from '../chests';
import { spawnFx } from '../fx';
import { levelUpPassive } from '../passives';
import { recomputeStats } from '../stats';
import { evolveWeapon, levelUpWeapon } from '../weapons/owned';
import type { World } from '../world';

/** A chest within this distance of the player's centre opens (initial value, untuned). */
export const CHEST_OPEN_RADIUS = PLAYER_RADIUS + 16;
/** Seconds the `fx.chestOpen` burst shows: its whole animation. */
export const CHEST_OPEN_FX_SEC = 1;

/** How many rewards a chest holds: one draw, 5 below `five × luck`, 3 below `(five + three) × luck`, else 1. */
export function rollRewardCount(world: Pick<World, 'chestRng' | 'player'>): 1 | 3 | 5 {
  const { luck } = world.player.stats;
  const r = world.chestRng.next();
  if (r < CHEST_ODDS.five * luck) return 5;
  if (r < (CHEST_ODDS.five + CHEST_ODDS.three) * luck) return 3;
  return 1;
}

/**
 * The first evolution in `EVOLUTIONS` order whose conditions hold (ADR 0008): run time at least
 * `EVOLUTION_MIN_TIME_S`, the weapon owned at `maxLevel`, its passive owned at level 1 or more, and the evolved weapon
 * not owned yet. `null` when none does.
 */
export function availableEvolution(
  world: Pick<World, 'time' | 'weapons' | 'passives'>,
): EvolutionDef | null {
  if (world.time < EVOLUTION_MIN_TIME_S) return null;
  for (const evolution of EVOLUTIONS) {
    const weapon = world.weapons.find((w) => w.def.id === evolution.weaponId);
    if (!weapon || weapon.level < weapon.def.maxLevel) continue;
    if (!world.passives.some((p) => p.def.id === evolution.passiveId && p.level >= 1)) continue;
    if (world.weapons.some((w) => w.def.id === evolution.intoWeaponId)) continue;
    return evolution;
  }
  return null;
}

/** Chooses and applies one reward: an evolution, else a level of a random owned item below max, else a heal. */
function grantReward(world: World): ChestReward {
  const evolution = availableEvolution(world);
  if (evolution) {
    evolveWeapon(world, evolution.weaponId, evolution.intoWeaponId);
    return {
      kind: 'evolve',
      fromWeaponId: evolution.weaponId,
      intoWeaponId: evolution.intoWeaponId,
    };
  }
  const upgradable: (
    { itemKind: 'weapon'; id: WeaponId } | { itemKind: 'passive'; id: PassiveId }
  )[] = [];
  for (const w of world.weapons)
    if (w.level < w.def.maxLevel) upgradable.push({ itemKind: 'weapon', id: w.def.id });
  for (const p of world.passives)
    if (p.level < p.def.maxLevel) upgradable.push({ itemKind: 'passive', id: p.def.id });
  const pick =
    upgradable.length > 0 ? upgradable[world.chestRng.int(upgradable.length)] : undefined;
  if (pick) {
    if (pick.itemKind === 'weapon') {
      levelUpWeapon(world, pick.id);
      const level = world.weapons.find((w) => w.def.id === pick.id)?.level ?? 0;
      return { kind: 'levelUp', itemKind: 'weapon', id: pick.id, newLevel: level };
    }
    levelUpPassive(world, pick.id);
    const level = world.passives.find((p) => p.def.id === pick.id)?.level ?? 0;
    return { kind: 'levelUp', itemKind: 'passive', id: pick.id, newLevel: level };
  }
  world.player.hp = Math.min(world.player.maxHp, world.player.hp + CHEST_HEAL);
  return { kind: 'heal', amount: CHEST_HEAL };
}

/**
 * Opens a chest (#15): rolls the reward count on `world.chestRng`, chooses and applies each reward in turn (so a
 * later one sees the earlier ones), then recomputes the stats once. Never gold (REQUIREMENTS #8). Returns the rewards.
 */
export function openChest(world: World): ChestReward[] {
  const count = rollRewardCount(world);
  const rewards: ChestReward[] = [];
  for (let i = 0; i < count; i++) rewards.push(grantReward(world));
  recomputeStats(world);
  return rewards;
}

/**
 * The last system of a step (#15): the first chest within `CHEST_OPEN_RADIUS` of the player opens, but only while no
 * level-up is pending (otherwise it waits on the ground for a later step). Its rewards go to `world.chestRewards`,
 * which freezes `world.step` until the overlay closes (`createChestFlow`); the chest is removed and `fx.chestOpen`
 * bursts where it was.
 */
export function chestOpenSystem(world: World): void {
  if (world.chestRewards || world.pendingLevelUps > 0) return;
  const { chests, player } = world;
  const { x, y } = chests.cols;
  const r2 = CHEST_OPEN_RADIUS * CHEST_OPEN_RADIUS;
  for (let i = 0; i < chests.count; i++) {
    const cx = x[i] ?? 0;
    const cy = y[i] ?? 0;
    if ((cx - player.x) ** 2 + (cy - player.y) ** 2 > r2) continue;
    world.chestRewards = openChest(world);
    removeChest(world, i);
    spawnFx(world, 'fx.chestOpen', cx, cy, 0, false, CHEST_OPEN_FX_SEC);
    return;
  }
}

export interface ChestFlowOptions {
  post: (message: Extract<WorkerToMain, { type: 'chestOpened' }>) => void;
  /** The loop's pause and resume, as for the level-up choice. */
  pause: () => void;
  resume: () => void;
}

/**
 * The worker side of the chest overlay (#15, ADR 0004): after a step that opened a chest it pauses the loop and posts
 * `chestOpened`; `close` (the `chestClosed` message) clears `world.chestRewards` and resumes, without a time jump.
 */
export interface ChestFlow {
  readonly open: boolean;
  /** Call after every `world.step`. */
  afterStep(world: World): void;
  /** The overlay closed; ignored when none is open. */
  close(world: World): void;
  /** Forgets the open overlay (a new run or the title); does not resume. */
  reset(): void;
}

export function createChestFlow({ post, pause, resume }: ChestFlowOptions): ChestFlow {
  let open = false;
  return {
    get open() {
      return open;
    },
    afterStep(world) {
      if (open || !world.chestRewards || world.state !== 'running') return;
      open = true;
      pause();
      post({ type: 'chestOpened', rewards: world.chestRewards });
    },
    close(world) {
      if (!open) return;
      open = false;
      world.chestRewards = null;
      resume();
    },
    reset() {
      open = false;
    },
  };
}
