import type { PlayerState } from '../player';

/**
 * Recovery (#12), right after `contactDamageSystem`: heals `stats.recovery` HP per second, capped at `maxHp`. A dead
 * world never steps, so this only runs while the player is alive.
 */
export function recoverySystem(world: { player: PlayerState }, dt: number): void {
  const { player } = world;
  const rate = player.stats.recovery;
  if (rate <= 0 || player.hp <= 0 || player.hp >= player.maxHp) return;
  player.hp = Math.min(player.maxHp, player.hp + rate * dt);
}
