interface BuildCard {
  readonly kind: string | null;
  readonly name: string;
}

interface IsolatedBuildOptions {
  readonly wantedNames: readonly string[];
  readonly blockedNames: readonly string[];
}

const SAFE_PASSIVES = new Set(['Bracer', 'Clover', 'Hollow Heart', 'Pummarola', 'Spellbinder']);

/** Returns a zero-based card index for the Garlic journey, or null if the hand cannot preserve the build. */
export function selectIsolatedBuildCard(
  cards: readonly BuildCard[],
  { wantedNames, blockedNames }: IsolatedBuildOptions,
): number | null {
  let upgrade: number | null = null;
  let acquisition: number | null = null;

  for (const [index, { kind, name }] of cards.entries()) {
    if (blockedNames.includes(name)) continue;
    const wanted = wantedNames.includes(name);
    if (kind === 'newWeapon' && name === 'Garlic' && wanted) return index;
    if (kind !== 'newPassive' && kind !== 'upgradePassive') continue;

    const safe = SAFE_PASSIVES.has(name);
    if (wanted && (name === 'Candelabrador' || safe)) return index;
    if (!safe) continue;
    if (kind === 'upgradePassive') upgrade ??= index;
    else acquisition ??= index;
  }

  return upgrade ?? acquisition;
}
