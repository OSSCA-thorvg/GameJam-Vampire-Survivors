/**
 * XP needed to go from `level` to `level + 1`: 5 at level 1, then each level adds 10 up to level 20, 13 up to level
 * 40 and 16 after that. **[unverified]**: the issue's (#11) curve, not yet checked against footage or the wiki
 * (docs/reference/gameplay.md § Level-up and evolution rules).
 */
export function xpToNext(level: number): number {
  let need = 5;
  for (let l = 2; l <= level; l++) need += l <= 20 ? 10 : l <= 40 ? 13 : 16;
  return need;
}

export type GemTier = 'blue' | 'green' | 'red';

/** A gem's colour from its XP value: blue under 5, green under 10, red otherwise (asset IDs `gem.<tier>`). */
export function gemTier(value: number): GemTier {
  return value < 5 ? 'blue' : value < 10 ? 'green' : 'red';
}
