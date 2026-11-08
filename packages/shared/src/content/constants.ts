/** Initial vector-art budgets (ADR 0007); #22 measures changes to these caps. */
export const ENEMY_CAP = 400;
export const PROJECTILE_CAP = 600;
export const GEM_CAP = 400;

/**
 * Player move speed in world units per second, about 0.11 view widths per second (initial value, tune against
 * footage; docs/reference/gameplay.md § Core loop). Characters scale it in #14.
 */
export const BASE_MOVE_SPEED = 140;
