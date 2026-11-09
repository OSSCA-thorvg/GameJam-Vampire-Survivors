import { BASE_MAX_HP, BASE_STATS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { recomputeStats } from '../stats';
import { SYSTEMS } from '../world';
import { createBaseWorld } from '../base-world';
import { contactDamageSystem } from './contact-damage';
import { recoverySystem } from './recovery';

const DT = 1 / 60;

describe('recovery', () => {
  it('heals recovery × time: BASE_STATS.recovery + 0.4 HP/s for 10 s, never above maxHp', () => {
    const world = createBaseWorld({ seed: 1 });
    world.player.runModifiers.push({ stat: 'recovery', add: 0.4 });
    recomputeStats(world);
    world.player.hp = 50;
    for (let i = 0; i < 600; i++) recoverySystem(world, DT);
    expect(world.player.hp).toBeCloseTo(50 + (BASE_STATS.recovery + 0.4) * 10, 6);
    world.player.hp = BASE_MAX_HP - 0.1;
    for (let i = 0; i < 600; i++) recoverySystem(world, DT);
    expect(world.player.hp).toBe(BASE_MAX_HP);
  });

  it('does nothing with recovery 0 or at 0 HP, and runs right after contact damage', () => {
    const world = createBaseWorld({ seed: 1 });
    // BASE_STATS carries 0.2 HP/s since #148: zero it to test the no-recovery case.
    world.player.stats.recovery = 0;
    world.player.hp = 50;
    recoverySystem(world, 1);
    expect(world.player.hp).toBe(50);
    world.player.stats.recovery = 1;
    world.player.hp = 0;
    recoverySystem(world, 1);
    expect(world.player.hp).toBe(0);
    expect(SYSTEMS.indexOf(recoverySystem)).toBe(SYSTEMS.indexOf(contactDamageSystem) + 1);
  });
});
