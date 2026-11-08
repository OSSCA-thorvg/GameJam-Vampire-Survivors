import {
  INTERFERENCE,
  INTERFERENCE_RULES,
  PICKUP_COLLECT_RADIUS,
  PLAYER_RADIUS,
  interferenceIndex,
  type EnemyId,
  type InterferenceEffect,
  type Rng,
} from '@vs/shared';
import { assertNever } from '../../../protocol/assert-never';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../../constants';
import { ENEMY_FLAG_ELITE, spawnEnemy } from '../enemies';
import { NO_GEM } from '../gems';
import { PICKUP_FAMILY_INTERFERENCE, spawnPickup } from '../pickups';
import type { World } from '../world';
import { makeRoomForEnemy } from './bosses';
import { spawnElite } from './elites';
import { waveAt } from './spawner';

/** Incoming effects waiting for the next step, and collected kinds waiting for the worker to post (#21). */
export const INTERFERENCE_QUEUE = 8;
/** How long the sender's "Sent <label>" toast shows, in simulated seconds. */
export const SENT_TOAST_SEC = 2;

/** A fixed queue of `INTERFERENCE` indices; pushes beyond its size are dropped. */
export interface KindQueue {
  readonly items: Int8Array;
  count: number;
}

export interface InterferenceState {
  /** `rng.fork('interference')`: every interference roll (#21), so the spawn stream never shifts. */
  readonly interferenceRng: Rng;
  /** `world.time` of the last interference drop; `-Infinity` before the first. */
  lastInterferenceDropAt: number;
  /** Effects received from opponents (`applyInterference`), applied at the start of the next step. */
  readonly interferenceIn: KindQueue;
  /** Kinds collected by this player, drained by the worker (`drainCollected`) into `interferenceCollected`. */
  readonly interferenceOut: KindQueue;
  /** The sender's toast: the `INTERFERENCE` index shown, or -1, until `world.time` reaches `sentToastUntil`. */
  sentToast: number;
  sentToastUntil: number;
}

const queue = (): KindQueue => ({ items: new Int8Array(INTERFERENCE_QUEUE), count: 0 });

export function createInterferenceState(rng: Rng): InterferenceState {
  return {
    interferenceRng: rng.fork('interference'),
    lastInterferenceDropAt: -Infinity,
    interferenceIn: queue(),
    interferenceOut: queue(),
    sentToast: -1,
    sentToastUntil: 0,
  };
}

function push(q: KindQueue, index: number): void {
  if (q.count < q.items.length) q.items[q.count++] = index;
}

/** Interference pickups lying in `world`. */
export function interferenceOnGround(world: World): number {
  const { count, cols } = world.pickups;
  let n = 0;
  for (let i = 0; i < count; i++) if (cols.family[i] === PICKUP_FAMILY_INTERFERENCE) n++;
  return n;
}

/** An `INTERFERENCE` index by weight, one draw from `rng`. */
function pickKind(rng: Rng): number {
  let total = 0;
  for (const def of INTERFERENCE) total += def.weight;
  let roll = rng.next() * total;
  for (let k = 0; k < INTERFERENCE.length; k++) {
    roll -= INTERFERENCE[k]?.weight ?? 0;
    if (roll < 0) return k;
  }
  return INTERFERENCE.length - 1;
}

/**
 * Drops (#21), after `cleanupSystem`, versus runs only: each `enemyKilled` event may drop an interference pickup at the
 * kill, once `INTERFERENCE_RULES.notBeforeS` passed, `minIntervalS` after the previous drop and while fewer than
 * `maxOnGround` lie in the world. Elite kills roll `eliteDropChance`, others `dropChancePerKill`. Every draw comes from
 * `world.interferenceRng`.
 */
export function interferenceDropSystem(world: World): void {
  if (world.mode !== 'versus' || world.time < INTERFERENCE_RULES.notBeforeS) return;
  const { items, count } = world.events;
  for (let i = 0; i < count; i++) {
    const event = items[i];
    if (event?.kind !== 'enemyKilled') continue;
    if (world.time - world.lastInterferenceDropAt < INTERFERENCE_RULES.minIntervalS) return;
    if (interferenceOnGround(world) >= INTERFERENCE_RULES.maxOnGround) return;
    const chance =
      (event.flags & ENEMY_FLAG_ELITE) !== 0
        ? INTERFERENCE_RULES.eliteDropChance
        : INTERFERENCE_RULES.dropChancePerKill;
    if (world.interferenceRng.next() >= chance) continue;
    const kind = pickKind(world.interferenceRng);
    if (spawnPickup(world, PICKUP_FAMILY_INTERFERENCE, kind, event.x, event.y) >= 0)
      world.lastInterferenceDropAt = world.time;
  }
}

const REACH = PICKUP_COLLECT_RADIUS + PLAYER_RADIUS;

/**
 * Collection (#21), right after `pickupSystem` and by the same contact rule (no magnet): each interference pickup
 * within reach is removed, queued for the server (`interferenceOut`) and shown on the sender's toast.
 */
export function interferenceCollectSystem(world: World): void {
  const { pickups, pickupBinding, player } = world;
  const { x, y, defIdx, family } = pickups.cols;
  for (let i = pickups.count - 1; i >= 0; i--) {
    if (family[i] !== PICKUP_FAMILY_INTERFERENCE) continue;
    const dx = (x[i] ?? 0) - player.x;
    const dy = (y[i] ?? 0) - player.y;
    if (dx * dx + dy * dy > REACH * REACH) continue;
    const kind = defIdx[i] ?? 0;
    pickupBinding?.unbind(i);
    pickups.remove(i);
    push(world.interferenceOut, kind);
    world.sentToast = kind;
    world.sentToastUntil = world.time + SENT_TOAST_SEC;
  }
}

/**
 * Queues an opponent's interference (#21, the worker's `applyInterference`) for the start of the next step, so one that
 * arrives during a level-up or a chest takes effect when this world resumes. Ignored for an unknown `kind` or once the
 * run is over. Returns whether it was queued.
 */
export function queueInterference(world: World, kind: string): boolean {
  const index = interferenceIndex(kind);
  if (index < 0 || world.state !== 'running') return false;
  push(world.interferenceIn, index);
  return true;
}

/** Applies the queued effects (#21), first in the step, after `inputSystem`. */
export function interferenceApplySystem(world: World): void {
  const q = world.interferenceIn;
  for (let i = 0; i < q.count; i++) {
    const def = INTERFERENCE[q.items[i] ?? -1];
    if (def) applyInterferenceEffect(world, def.effect);
  }
  q.count = 0;
}

/** The current wave's highest-weight enemy (the first on a tie): what Swarm and Elite Call send. */
export function interferenceEnemy(world: World): EnemyId {
  const { enemies } = waveAt(world.time / 60);
  let best = enemies[0];
  for (const entry of enemies) if (best && entry.weight > best.weight) best = entry;
  if (!best) throw new Error('A wave needs at least one enemy');
  return best.enemyId;
}

const HALF_DIAGONAL = Math.hypot(VIEW_WIDTH, VIEW_HEIGHT) / 2;

/** One interference effect on `world` (#21). */
export function applyInterferenceEffect(world: World, effect: InterferenceEffect): void {
  const { player } = world;
  switch (effect.type) {
    case 'spawnPack': {
      const enemyId = interferenceEnemy(world);
      const radius = effect.ringRadiusFactor * HALF_DIAGONAL;
      for (let k = 0; k < effect.count; k++) {
        const angle = (2 * Math.PI * k) / effect.count;
        const x = player.x + Math.cos(angle) * radius;
        const y = player.y + Math.sin(angle) * radius;
        if (spawnEnemy(world, enemyId, x, y) < 0) break;
      }
      break;
    }
    case 'clearGems':
      clearGems(world);
      break;
    case 'spawnElite': {
      const angle = world.interferenceRng.next() * 2 * Math.PI;
      // Like a scheduled elite, a sent one is never lost to a full field.
      makeRoomForEnemy(world);
      spawnElite(world, interferenceEnemy(world), {
        x: player.x + Math.cos(angle) * effect.distance,
        y: player.y + Math.sin(angle) * effect.distance,
      });
      break;
    }
    default:
      assertNever(effect);
  }
}

/** Gem Thief: every gem leaves the world and its paint returns to its pool; XP and level stay. */
function clearGems(world: World): void {
  const { gems, gemBinding } = world;
  for (let i = gems.count - 1; i >= 0; i--) {
    gemBinding?.unbind(i);
    gems.remove(i);
  }
  world.mergeGemUid = NO_GEM;
}

/** Hands each collected kind to `send` and empties the queue (the worker, after every step). */
export function drainCollected(world: World, send: (index: number) => void): void {
  const q = world.interferenceOut;
  for (let i = 0; i < q.count; i++) send(q.items[i] ?? 0);
  q.count = 0;
}

/** Interference debug offset, in world units to the right of the player. */
const DEBUG_OFFSET = 48;
let debugNext = 0;

/**
 * The `J` debug key (#21, dev builds, versus runs only): drops the next `INTERFERENCE` kind, cycling and ignoring the
 * drop rules, `DEBUG_OFFSET` units right of the player. Collection is still driven by walking into it. Returns the
 * kind, or null when nothing was dropped.
 */
export function spawnDebugInterference(world: World): string | null {
  if (world.mode !== 'versus') return null;
  const kind = debugNext;
  const slot = spawnPickup(
    world,
    PICKUP_FAMILY_INTERFERENCE,
    kind,
    world.player.x + DEBUG_OFFSET,
    world.player.y,
  );
  if (slot < 0) return null;
  debugNext = (kind + 1) % INTERFERENCE.length;
  return INTERFERENCE[kind]?.kind ?? null;
}
