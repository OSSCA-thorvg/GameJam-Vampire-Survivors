import type { WeaponLevel } from '@vs/shared';
import type { WeaponContext } from '../context';
import type { OwnedWeapon } from '../owned';

/** The behaviour code behind a `WeaponPattern` (ADR 0008). */
export interface WeaponPatternModule {
  /** One shot of a burst; `shot` counts from 0 within the burst of `lv.amount` shots. */
  fire(ctx: WeaponContext, w: OwnedWeapon, lv: WeaponLevel, shot: number): void;
  /** Every step before the cooldown, for persistent effects (orbiting books, the garlic aura; #13). */
  update?(ctx: WeaponContext, w: OwnedWeapon, lv: WeaponLevel, dt: number): void;
}
