/** Orologion's freeze (#16): global, so enemies spawned while it lasts are frozen too. */
export interface FreezeState {
  /** `world.time` at which the freeze ends; 0 (never frozen) at the start of a run. */
  freezeUntil: number;
}

/** True while an Orologion freeze lasts. Read by enemy movement (chase, separation) and contact damage only. */
export function isFrozen(world: FreezeState & { time: number }): boolean {
  return world.time < world.freezeUntil;
}

/** Starts or extends the freeze to `seconds` from now. */
export function freezeEnemies(world: FreezeState & { time: number }, seconds: number): void {
  world.freezeUntil = Math.max(world.freezeUntil, world.time + seconds);
}
