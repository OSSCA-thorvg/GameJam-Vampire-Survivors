import type { WeaponPattern } from '@vs/shared';
import { magicWand } from './magicWand';
import type { WeaponPatternModule } from './types';
import { whip } from './whip';

/** The behaviour module per `WeaponPattern` (ADR 0008). #13 adds the other six; `addWeapon` throws in dev builds for a pattern without one. */
export const PATTERNS: Readonly<Partial<Record<WeaponPattern, WeaponPatternModule>>> = {
  whip,
  magicWand,
};
