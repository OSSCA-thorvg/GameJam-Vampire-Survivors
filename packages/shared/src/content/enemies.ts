import type { DrawableAssetId } from '../assets.js';

/** The six normal enemies (#8, #17), the two timed bosses (#15) and Death, the single-player finale (#17). */
export type EnemyId =
  'bat' | 'ghoul' | 'reaper5' | 'reaper10' | 'skeleton' | 'wisp' | 'brute' | 'wraith' | 'death';

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
    // 0.85 × BASE_MOVE_SPEED. Every normal enemy is slower than every character's starting speed (#105, #148;
    // enforced by characters.test.ts).
    speed: 119,
    contactDamage: 5,
    radius: 12,
    knockbackResist: 0,
    xp: 1,
  },
  ghoul: {
    id: 'ghoul',
    assetId: 'enemy.ghoul',
    maxHp: 15,
    speed: 70,
    contactDamage: 8,
    radius: 16,
    knockbackResist: 0.1,
    xp: 1,
  },
  reaper5: {
    id: 'reaper5',
    assetId: 'boss.reaper5',
    maxHp: 2000,
    speed: 60,
    contactDamage: 18,
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
    contactDamage: 26,
    radius: 48,
    knockbackResist: 1,
    xp: 250,
    boss: { tether: true, dropsChest: 'always' },
  },
  skeleton: {
    id: 'skeleton',
    assetId: 'enemy.skeleton',
    maxHp: 30,
    speed: 90,
    contactDamage: 9,
    radius: 16,
    knockbackResist: 0.2,
    xp: 2,
  },
  wisp: {
    id: 'wisp',
    assetId: 'enemy.wisp',
    maxHp: 20,
    // 0.9 × the Warden's 133 (#148): the fastest normal enemy, still slower than every character.
    speed: 125,
    contactDamage: 8,
    radius: 12,
    knockbackResist: 0,
    xp: 5,
  },
  brute: {
    id: 'brute',
    assetId: 'enemy.brute',
    maxHp: 120,
    speed: 55,
    contactDamage: 14,
    radius: 22,
    knockbackResist: 0.5,
    xp: 5,
  },
  wraith: {
    id: 'wraith',
    assetId: 'enemy.wraith',
    maxHp: 300,
    speed: 80,
    contactDamage: 17,
    radius: 24,
    knockbackResist: 0.6,
    xp: 10,
  },
  // Death (#17): appears at the time limit in single player and cannot realistically be killed.
  death: {
    id: 'death',
    assetId: 'boss.death',
    maxHp: 655350,
    speed: 200,
    contactDamage: 65535,
    radius: 48,
    knockbackResist: 1,
    xp: 0,
    boss: { tether: true, dropsChest: 'always' },
    ignoresArmor: true,
  },
};

/** Fixed order; the enemy store's `type` column indexes it. Append only, so stored indices keep their meaning. */
export const ENEMY_LIST: readonly EnemyId[] = [
  'bat',
  'ghoul',
  'reaper5',
  'reaper10',
  'skeleton',
  'wisp',
  'brute',
  'wraith',
  'death',
];
