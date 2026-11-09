// The worker's sound cues (#129, ADR 0004): the worker has no `AudioContext`, so systems set bits in `world.sfxMask`
// and the frame that renders posts the mask once as `{ type: 'sfx', mask }`; the main thread plays the sounds. The
// mask is write-only for the simulation: no system reads it, so it never changes what the same seed produces.
import { HIT_SFX, WORLD_SFX, type WeaponPattern, type WorldSfxId } from '@vs/shared';
import type { WorkerToMain } from '../../protocol/worker-messages';

/** The part of the world that carries the cues. */
export interface SfxState {
  /** Bit `i` is set when `WORLD_SFX[i]` was cued since the last rendered frame. */
  sfxMask: number;
}

/** Each world sound's bit, precomputed so a cue is one lookup and one `|=`. */
export const SFX_BIT = Object.fromEntries(WORLD_SFX.map((id, i) => [id, 1 << i])) as Record<
  WorldSfxId,
  number
>;
/** Each weapon pattern's hit-sound bit. */
const HIT_BIT = Object.fromEntries(
  Object.entries(HIT_SFX).map(([pattern, id]) => [pattern, SFX_BIT[id]]),
) as Record<WeaponPattern, number>;

export function cueSfx(world: SfxState, id: WorldSfxId): void {
  world.sfxMask |= SFX_BIT[id];
}

/** A hit by a weapon of `pattern` (`damageEnemy`). */
export function cueHit(world: SfxState, pattern: WeaponPattern): void {
  world.sfxMask |= HIT_BIT[pattern];
}

/**
 * Posts the cues since the last frame, once, and clears them; called after a rendered frame only. Hidden-tab ticks
 * never render, so a hidden versus world posts nothing.
 */
export function drainSfx(
  world: SfxState | null | undefined,
  post: (m: WorkerToMain) => void,
): void {
  if (!world || world.sfxMask === 0) return;
  const mask = world.sfxMask;
  world.sfxMask = 0;
  post({ type: 'sfx', mask });
}

/** Drops cues that piled up while nothing rendered (a hidden tab, a fast-forward), so no backlog plays. */
export function clearSfx(world: SfxState | null | undefined): void {
  if (world) world.sfxMask = 0;
}
