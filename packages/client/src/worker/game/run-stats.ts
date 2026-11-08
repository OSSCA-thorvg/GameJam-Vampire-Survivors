import { MAX_WEAPON_SLOTS } from '@vs/shared';
import type { RunSummary } from '../../protocol/worker-messages';
import type { World } from './world';

/** Per-run statistics beyond `world.stats` (#17); each fresh world starts them at zero, so `startRun` clears them. */
export interface RunStatsState {
  runStats: {
    /** Damage dealt by the weapon in slot k (`world.weapons[k]`), counted only up to each enemy's remaining HP. */
    readonly damageBySlot: Float64Array;
  };
}

export function createRunStatsState(): RunStatsState {
  return { runStats: { damageBySlot: new Float64Array(MAX_WEAPON_SLOTS) } };
}

/** The `gameOver` payload (#17): `world.stats`, the character, weapons by damage dealt (descending) and passives. */
export function buildRunSummary(world: World): RunSummary {
  const { damageBySlot } = world.runStats;
  return {
    ...world.stats,
    cleared: world.cleared,
    characterId: world.characterId,
    weapons: world.weapons
      .map((w) => ({ id: w.def.id, level: w.level, damage: Math.round(damageBySlot[w.slot] ?? 0) }))
      .sort((a, b) => b.damage - a.damage),
    passives: world.passives.map((p) => ({ id: p.def.id, level: p.level })),
  };
}
