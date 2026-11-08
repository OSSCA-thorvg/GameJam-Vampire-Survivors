import type { WeaponPattern } from '@vs/shared';
import { axe } from './axe';
import { cross } from './cross';
import { fireWand } from './fireWand';
import { garlic } from './garlic';
import { kingBible } from './kingBible';
import { knife } from './knife';
import { magicWand } from './magicWand';
import type { WeaponPatternModule } from './types';
import { whip } from './whip';

/** The behaviour module per `WeaponPattern` (ADR 0008); `addWeapon` throws in dev builds for a pattern without one. */
export const PATTERNS: Readonly<Partial<Record<WeaponPattern, WeaponPatternModule>>> = {
  whip,
  magicWand,
  knife,
  axe,
  cross,
  kingBible,
  fireWand,
  garlic,
};
