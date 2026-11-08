/** Initial vector-art budgets (ADR 0007); #22 measures changes to these caps. */
export const ENEMY_CAP = 400;
export const PROJECTILE_CAP = 600;
export const GEM_CAP = 400;

/**
 * Player move speed in world units per second, about 0.11 view widths per second (initial value, tune against
 * footage; docs/reference/gameplay.md § Core loop). Characters scale it in #14.
 */
export const BASE_MOVE_SPEED = 140;

/** Player HP at the start of a run (initial value, tune against footage). Passives raise it in #12. */
export const BASE_MAX_HP = 100;
/** Player collision radius in world units for contact damage (initial value, tune against footage). */
export const PLAYER_RADIUS = 14;
/**
 * Seconds of invulnerability after a hit, so a crowd lands at most one hit per window (initial value, untuned;
 * docs/reference/gameplay.md § Core loop).
 */
export const HIT_INVULN_SEC = 0.5;
/** The largest enemy radius any content may use; the contact query reaches `PLAYER_RADIUS + MAX_ENEMY_RADIUS`. */
export const MAX_ENEMY_RADIUS = 24;
/** Weapons the player can hold at once (ADR 0008); the owned array's index is the slot. */
export const MAX_WEAPON_SLOTS = 6;

/** Gem magnet radius in world units, before #12's magnet stat (initial value, untuned; gameplay.md § Experience gems). */
export const BASE_PICKUP_RANGE = 60;
/** A flying gem within this distance of the player is collected (initial value, untuned). */
export const GEM_COLLECT_RADIUS = 14;
/** A gem's speed when the magnet catches it, and its acceleration toward the player (units/s, units/s²; untuned). */
export const GEM_FLY_START_SPEED = 150;
export const GEM_FLY_ACCEL = 600;
/** Options offered per level-up (ADR 0008: 3, or 4 with luck in #12; initial value). */
export const LEVELUP_CHOICES = 3;
/** HP healed by the fallback option when nothing is left to offer (initial value; never gold, REQUIREMENTS #8, #9). */
export const LEVELUP_HEAL = 30;
/** Passives the player can hold at once (ADR 0008); used from #12. */
export const MAX_PASSIVE_SLOTS = 6;
