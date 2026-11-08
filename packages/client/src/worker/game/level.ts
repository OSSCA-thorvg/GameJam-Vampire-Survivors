import { xpToNext } from '@vs/shared';
import type { LevelUpOption, WorkerToMain } from '../../protocol/worker-messages';
import { spawnFx } from './fx';
import { buildLevelUpOptions } from './levelup-options';
import { addPassive, levelUpPassive } from './passives';
import { recomputeStats } from './stats';
import { addWeapon, levelUpWeapon } from './weapons/owned';
import type { World } from './world';

/** Seconds the `fx.levelUp` ring shows: its whole animation (30 frames at 30 fps). */
export const LEVEL_UP_FX_SEC = 1;

/**
 * After `gemSystem` (#11): while the player's XP covers the next level, spends it, raises the level (mirrored in
 * `world.stats.level`) and queues one level-up choice. A step that levels up shows one `fx.levelUp` at the player.
 */
export function levelSystem(world: World): void {
  const { player } = world;
  const before = player.level;
  for (let need = xpToNext(player.level); player.xp >= need; need = xpToNext(player.level)) {
    player.xp -= need;
    player.level++;
    world.pendingLevelUps++;
  }
  if (player.level === before) return;
  world.stats.level = player.level;
  spawnFx(world, 'fx.levelUp', player.x, player.y, 0, false, LEVEL_UP_FX_SEC);
}

/** XP missing for the next level: what the `L` debug key grants. */
export function xpForNextLevel(world: Pick<World, 'player'>): number {
  return Math.max(0, xpToNext(world.player.level) - world.player.xp);
}

/** Applies one option: adds or upgrades its weapon or passive (then recomputes the stats, #12), or heals, capped at `maxHp`. */
export function applyLevelUpOption(world: World, option: LevelUpOption): void {
  switch (option.kind) {
    case 'newWeapon':
      addWeapon(world, option.weaponId);
      break;
    case 'upgradeWeapon':
      levelUpWeapon(world, option.weaponId);
      break;
    case 'newPassive':
      addPassive(world, option.passiveId);
      recomputeStats(world);
      break;
    case 'upgradePassive':
      levelUpPassive(world, option.passiveId);
      recomputeStats(world);
      break;
    case 'heal':
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + option.amount);
      break;
    default: {
      const never: never = option;
      throw new Error(`Unknown level-up option ${JSON.stringify(never)}`);
    }
  }
}

export interface LevelUpFlowOptions {
  post: (message: Extract<WorkerToMain, { type: 'levelUp' }>) => void;
  /** The loop's pause and resume (the same as #9's pause). */
  pause: () => void;
  resume: () => void;
}

/**
 * The worker side of the level-up choice (#11, ADR 0004): after a step that queued level-ups it pauses the loop and
 * posts one `levelUp`; each `levelUpChoice` applies the option and posts the next one, or resumes when none is left.
 * The world itself does not step while `pendingLevelUps > 0`, so nothing advances behind the screen.
 */
export interface LevelUpFlow {
  /** Whether a choice is on screen. */
  readonly open: boolean;
  /** Call after every `world.step`. */
  afterStep(world: World): void;
  /** The player's choice; an out-of-range index or a choice with no screen open is ignored. */
  choose(world: World, index: number): void;
  /** Forgets the open choice (a new run or the title); does not resume. */
  reset(): void;
}

export function createLevelUpFlow({ post, pause, resume }: LevelUpFlowOptions): LevelUpFlow {
  let options: LevelUpOption[] | null = null;
  const offer = (world: World): void => {
    options = buildLevelUpOptions(world);
    // With several queued, the first offered is the level right after the one before the gain.
    post({
      type: 'levelUp',
      level: world.player.level - world.pendingLevelUps + 1,
      options,
    });
  };
  return {
    get open() {
      return options !== null;
    },
    afterStep(world) {
      if (options || world.state !== 'running' || world.pendingLevelUps <= 0) return;
      pause();
      offer(world);
    },
    choose(world, index) {
      const option = options?.[index];
      if (!option) {
        if (import.meta.env.DEV)
          console.warn(`[worker] levelUpChoice ${String(index)} ignored: no such option`);
        return;
      }
      applyLevelUpOption(world, option);
      world.pendingLevelUps--;
      if (world.pendingLevelUps > 0) {
        offer(world);
        return;
      }
      options = null;
      resume();
    },
    reset() {
      options = null;
    },
  };
}
