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
