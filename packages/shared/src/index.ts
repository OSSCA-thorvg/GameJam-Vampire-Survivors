export * from './protocol.js';

export { createRng } from './random.js';
export { formatClock } from './clock.js';
export type { Rng } from './random.js';

export * from './assets.js';
export { parseCatalog } from './catalog.js';
export type { CatalogRow } from './catalog.js';
export {
  ENEMY_CAP,
  PROJECTILE_CAP,
  GEM_CAP,
  BASE_MOVE_SPEED,
  BASE_MAX_HP,
  PLAYER_RADIUS,
  HIT_INVULN_SEC,
  MAX_ENEMY_RADIUS,
  MAX_WEAPON_SLOTS,
  BASE_PICKUP_RANGE,
  GEM_COLLECT_RADIUS,
  GEM_FLY_START_SPEED,
  GEM_FLY_ACCEL,
  LEVELUP_CHOICES,
  LEVELUP_HEAL,
  MAX_PASSIVE_SLOTS,
} from './content/constants.js';
export { xpToNext, gemTier } from './content/xp.js';
export type { GemTier } from './content/xp.js';
export { ENEMIES, ENEMY_LIST } from './content/enemies.js';
export type { EnemyDef, EnemyId } from './content/enemies.js';
export { STAGE, validateStage } from './content/stage.js';
export type { StageDef, StageEvent, WaveDef } from './content/stage.js';
export {
  inspectPng,
  MAX_IMAGE_AXIS,
  MAX_IMAGE_DECODED_BYTES,
  MAX_IMAGE_ENCODED_BYTES,
} from './png.js';
export { validateLottie, MAX_LOTTIE_IMAGES, MAX_LOTTIE_DECODED_BYTES } from './lottie.js';
export type { LottieImage, ValidatedLottie } from './lottie.js';
export { WEAPONS, WEAPON_LIST } from './content/weapons.js';
export type {
  BaseWeaponId,
  EvolvedWeaponId,
  WeaponDef,
  WeaponId,
  WeaponLevel,
  WeaponPattern,
} from './content/weapons.js';
export { EVOLUTIONS } from './content/evolutions.js';
export type { EvolutionDef } from './content/evolutions.js';
export {
  EVOLUTION_MIN_TIME_S,
  CHEST_ODDS,
  CHEST_HEAL,
  ELITE,
  CHEST_REWARD_KINDS,
} from './content/chests.js';
export type { ChestReward } from './content/chests.js';
export {
  BASE_STATS,
  STAT_IDS,
  MIN_COOLDOWN_SEC,
  effDamage,
  effArea,
  effCooldown,
  effAmount,
  effSpeed,
  effDuration,
  STAT_LABELS,
  formatModifier,
} from './content/stats.js';
export type { StatId, StatBlock, StatModifier } from './content/stats.js';
export { PASSIVES } from './content/passives.js';
export type { PassiveDef, PassiveId } from './content/passives.js';
export { CHARACTERS, findCharacter } from './content/characters.js';
export type { CharacterDef, CharacterId } from './content/characters.js';
export { PICKUPS, LIGHT_SOURCE, PICKUP_COLLECT_RADIUS } from './content/pickups.js';
export type { PickupDef, PickupEffect } from './content/pickups.js';
export {
  INTERFERENCE,
  INTERFERENCE_RULES,
  INTERFERENCE_SEND_LIMIT,
  interferenceIndex,
} from './content/interference.js';
export type { InterferenceDef, InterferenceEffect } from './content/interference.js';
