import {
  BASE_MAX_HP,
  BASE_MOVE_SPEED,
  BASE_STATS,
  type StatBlock,
  type StatModifier,
} from '@vs/shared';
import type { Axis } from '../../protocol/worker-messages';

export interface PlayerState {
  /** World units, feet position. */
  x: number;
  y: number;
  /** Current normalized input direction; (0, 0) when idle. */
  dirX: number;
  dirY: number;
  /** Last non-zero horizontal input, for the sprite flip and the whip direction (#10). */
  facingX: -1 | 1;
  /** Last non-zero normalized direction, for directional weapons (#10); starts (1, 0). */
  lastDirX: number;
  lastDirY: number;
  /** World units per second: `BASE_MOVE_SPEED * stats.moveSpeed`, set by `recomputeStats` (#12). */
  moveSpeed: number;
  /** Current and maximum HP (#9); both start at `BASE_MAX_HP`. `maxHp` mirrors `stats.maxHp` (#12). */
  hp: number;
  maxHp: number;
  /** Seconds of invulnerability left after a hit; 0 when the player can be hit. */
  invulnTime: number;
  /** Flat damage reduction per hit: `stats.armor`, set by `recomputeStats` (#12). */
  armor: number;
  /** XP toward the next level and the current level (#11); `levelSystem` moves XP into levels. */
  xp: number;
  level: number;
  /**
   * The aggregated stats every system reads (#12). Preallocated and mutated in place by `recomputeStats` when the
   * inventory changes, never re-created and never touched per frame.
   */
  readonly stats: StatBlock;
  /** The character's modifiers, set once by `applyCharacter` (#14). */
  readonly characterModifiers: StatModifier[];
  /** Modifiers gained during the run (#16 pushes Little Clover here). */
  readonly runModifiers: StatModifier[];
}

/** A player at the origin facing right with full HP, moving at `BASE_MOVE_SPEED` (#14 scales it per character). */
export function createPlayer(): PlayerState {
  return {
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 0,
    facingX: 1,
    lastDirX: 1,
    lastDirY: 0,
    moveSpeed: BASE_MOVE_SPEED,
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    invulnTime: 0,
    armor: 0,
    xp: 0,
    level: 1,
    stats: { ...BASE_STATS },
    characterModifiers: [],
    runModifiers: [],
  };
}

/** What `playerMovementSystem` reads: the pressed direction copied by `inputSystem` at the start of the step. */
export interface MovementWorld {
  player: PlayerState;
  moveInput: { dx: Axis; dy: Axis };
}

/**
 * Moves the player at constant speed in the pressed direction; diagonals are normalized so they are as fast as
 * straight moves. The world has no bounds.
 */
export function playerMovementSystem(world: MovementWorld, dt: number): void {
  const { player } = world;
  const { dx, dy } = world.moveInput;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    player.dirX = dx / len;
    player.dirY = dy / len;
    player.lastDirX = player.dirX;
    player.lastDirY = player.dirY;
    if (dx !== 0) player.facingX = dx < 0 ? -1 : 1;
  } else {
    player.dirX = 0;
    player.dirY = 0;
  }
  player.x += player.dirX * player.moveSpeed * dt;
  player.y += player.dirY * player.moveSpeed * dt;
}
