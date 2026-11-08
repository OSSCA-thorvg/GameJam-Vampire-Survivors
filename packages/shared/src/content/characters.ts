import type { DrawableAssetId } from '../assets.js';
import type { StatModifier } from './stats.js';
import type { WeaponId } from './weapons.js';

/** The playable characters (ADR 0008, REQUIREMENTS 4 and 5): all selectable from the start, nothing unlocked. */
export type CharacterId = 'warden' | 'ember' | 'swift' | 'aurelia';

export interface CharacterDef {
  id: CharacterId;
  displayName: string;
  /** One line, shown on the character card. */
  description: string;
  /** The in-world sprite, `player.<id>`. */
  spriteId: DrawableAssetId;
  /** The character-select portrait, `portrait.<id>`. */
  portraitId: DrawableAssetId;
  /** Owned at level 1 when the run starts; every character's differs. */
  startingWeaponId: WeaponId;
  /** Applied once at run start, after `BASE_STATS` and before passives (`recomputeStats`). */
  modifiers: readonly StatModifier[];
}

/**
 * The roster, in card order; the first is the default. Initial values, untuned: the owner chose not to tune them
 * against the original game (#14).
 */
export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'warden',
    displayName: 'Warden',
    description: 'A sturdy guard who holds the line up close.',
    spriteId: 'player.warden',
    portraitId: 'portrait.warden',
    startingWeaponId: 'whip',
    modifiers: [
      { stat: 'maxHp', add: 20 },
      { stat: 'armor', add: 1 },
      { stat: 'moveSpeed', add: -0.05 },
    ],
  },
  {
    id: 'ember',
    displayName: 'Ember',
    description: 'A fire mage who hits hard but breaks easily.',
    spriteId: 'player.ember',
    portraitId: 'portrait.ember',
    startingWeaponId: 'fireWand',
    modifiers: [
      { stat: 'might', add: 0.1 },
      { stat: 'area', add: 0.1 },
      { stat: 'maxHp', add: -10 },
    ],
  },
  {
    id: 'swift',
    displayName: 'Swift',
    description: 'An elf scout who runs fast and gathers everything.',
    spriteId: 'player.swift',
    portraitId: 'portrait.swift',
    startingWeaponId: 'knife',
    modifiers: [
      { stat: 'moveSpeed', add: 0.15 },
      { stat: 'magnet', add: 0.3 },
      { stat: 'cooldown', add: -0.05 },
    ],
  },
  {
    id: 'aurelia',
    displayName: 'Aurelia',
    description: 'A paladin whose holy light mends and lingers.',
    spriteId: 'player.aurelia',
    portraitId: 'portrait.aurelia',
    startingWeaponId: 'cross',
    modifiers: [
      { stat: 'recovery', add: 0.2 },
      { stat: 'duration', add: 0.1 },
      { stat: 'maxHp', add: 10 },
    ],
  },
];

/** The character with `id`, or `undefined` for an unknown id (the worker then falls back to `CHARACTERS[0]`). */
export function findCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
