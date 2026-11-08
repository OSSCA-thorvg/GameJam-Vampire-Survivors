/** King Bible books drawn at most, the size of the view's book pool (initial value). */
export const MAX_BOOKS = 8;

/**
 * What the persistent weapons (#13) show this step, written by their patterns and read by the game view, which keeps
 * one pooled paint per book and one for the garlic aura. Preallocated per world; nothing here is created per step.
 */
export interface WeaponVisuals {
  /** King Bible: `count` books (0 while inactive) at world positions `x[i]`, `y[i]`, drawn at `scale`. */
  readonly books: {
    count: number;
    scale: number;
    readonly x: Float32Array;
    readonly y: Float32Array;
  };
  /** Garlic: shown around the player while owned, at `scale` (`garlicDrawScale`: the art's visible ring is the hit radius). */
  readonly garlic: { shown: boolean; scale: number };
}

export function createWeaponVisuals(): WeaponVisuals {
  return {
    books: { count: 0, scale: 1, x: new Float32Array(MAX_BOOKS), y: new Float32Array(MAX_BOOKS) },
    garlic: { shown: false, scale: 1 },
  };
}
