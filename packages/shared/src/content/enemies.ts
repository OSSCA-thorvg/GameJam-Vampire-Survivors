import type { DrawableAssetId } from '../assets.js';

/** The enemies of this phase and the two bosses (#15). #17 adds `skeleton`, `wisp`, `brute` and `wraith`. */
export type EnemyId = 'bat' | 'ghoul' | 'reaper5' | 'reaper10';

export interface EnemyDef {
  id: EnemyId;
  assetId: DrawableAssetId;
  maxHp: number;
  /** World units per second. */
  speed: number;
  /** Damage per contact, used by #9. */
  contactDamage: number;
  /** Collision and separation radius in world units. */
  radius: number;
  /** 0..1, used by #10. */
  knockbackResist: number;
  /** Gem value, used by #11. */
  xp: number;
  /** A boss (#15): tethered to the player instead of relocated, never an elite, and always drops a chest. */
  boss?: { tether: true; dropsChest: 'always' };
  /** Contact damage ignores the player's armor; used by Death in #17. */
  ignoresArmor?: true;
}

/** Initial values, tune against footage (docs/reference/gameplay.md § Enemies and waves). */
export const ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = {
  bat: {
    id: 'bat',
    assetId: 'enemy.bat',
    maxHp: 5,
    speed: 100,
    contactDamage: 5,
    radius: 12,
    knockbackResist: 0,
    xp: 1,
  },
  ghoul: {
    id: 'ghoul',
    assetId: 'enemy.ghoul',
    maxHp: 15,
    speed: 60,
    contactDamage: 10,
    radius: 16,
    knockbackResist: 0.2,
    xp: 2,
  },
  reaper5: {
    id: 'reaper5',
    assetId: 'boss.reaper5',
    maxHp: 2000,
    speed: 60,
    contactDamage: 20,
    radius: 40,
    knockbackResist: 1,
    xp: 100,
    boss: { tether: true, dropsChest: 'always' },
  },
  reaper10: {
    id: 'reaper10',
    assetId: 'boss.reaper10',
    maxHp: 6000,
    speed: 70,
    contactDamage: 30,
    radius: 48,
    knockbackResist: 1,
    xp: 250,
    boss: { tether: true, dropsChest: 'always' },
  },
};

/** Fixed order; the enemy store's `type` column indexes it. Append only, so stored indices keep their meaning. */
export const ENEMY_LIST: readonly EnemyId[] = ['bat', 'ghoul', 'reaper5', 'reaper10'];
