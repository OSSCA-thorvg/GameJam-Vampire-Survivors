import { describe, expect, it } from 'vitest';
import { recomputeStats } from '../stats';
import { createWorld, SYSTEMS } from '../world';
import { contactDamageSystem } from './contact-damage';
import { recoverySystem } from './recovery';

const DT = 1 / 60;

describe('recovery', () => {
  it('heals recovery × time: 0.4 HP/s for 10 s heals 4 HP, never above maxHp', () => {
    const world = createWorld({ seed: 1 });
    world.player.runModifiers.push({ stat: 'recovery', add: 0.4 });
    recomputeStats(world);
    world.player.hp = 50;
    for (let i = 0; i < 600; i++) recoverySystem(world, DT);
    expect(world.player.hp).toBeCloseTo(54, 6);
    world.player.hp = 99.9;
    for (let i = 0; i < 600; i++) recoverySystem(world, DT);
    expect(world.player.hp).toBe(100);
  });

  it('does nothing with recovery 0 or at 0 HP, and runs right after contact damage', () => {
    const world = createWorld({ seed: 1 });
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
