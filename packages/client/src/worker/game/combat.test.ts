import { ENEMIES } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { cleanupSystem, damageEnemy, HIT_FLASH_SEC, KNOCKBACK_SEC } from './combat';
import { indexEnemies, quietWorld, target } from './combat-test-helpers';
import { ENEMY_FLAG_DEAD } from './enemies';
import { enemyMovementSystem } from './systems/enemy-movement';

const DT = 1 / 60;

describe('combat', () => {
  it('scales knockback by the enemy resistance', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 100, 0);
    const ghoul = target(world, 'ghoul', 200, 0);
    damageEnemy(world, bat, 1, 1, 0, 100, 0);
    damageEnemy(world, ghoul, 1, 0, -1, 100, 0);
    const { kbX, kbY, kbTime } = world.enemies.cols;
    expect(kbX[bat]).toBeCloseTo(100, 5);
    expect(kbY[bat]).toBe(0);
    expect(kbY[ghoul]).toBeCloseTo(-100 * (1 - ENEMIES.ghoul.knockbackResist), 5);
    expect(kbTime[ghoul]).toBeCloseTo(KNOCKBACK_SEC, 6);
  });

  it('pushes the enemy along the knockback for 0.12 s, then it chases again', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 100, 0);
    damageEnemy(world, bat, 1, 1, 0, 300, 0);
    const { x, vx } = world.enemies.cols;
    let pushed = 0;
    for (let i = 0; i < 20; i++) {
      enemyMovementSystem(world, DT);
      if ((vx[bat] ?? 0) > 0) pushed++;
    }
    // 0.12 s is 7.2 steps: the push lasts 8 steps, then the bat walks back toward the player at the origin.
    expect(pushed).toBe(Math.ceil(KNOCKBACK_SEC / DT));
    expect(vx[bat]).toBeLessThan(0);
    expect(x[bat]).toBeGreaterThan(100);
  });

  it('applies no knockback when the impulse is 0, but still flashes', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 50, 0);
    damageEnemy(world, bat, 3, 1, 0, 0, 0);
    expect(world.enemies.cols.kbTime[bat]).toBe(0);
    expect(world.enemies.cols.flash[bat]).toBeCloseTo(HIT_FLASH_SEC, 6);
    expect(world.enemies.cols.hp[bat]).toBe(997);
    expect(world.fx.count).toBe(1);
  });

  it('turns a kill from two hits in one step into exactly one enemyKilled event and one kill', () => {
    const world = quietWorld();
    target(world, 'ghoul', 300, 0);
    const bat = target(world, 'bat', 40, 10, ENEMIES.bat.maxHp);
    damageEnemy(world, bat, 10, 1, 0, 0, 0);
    damageEnemy(world, bat, 10, 1, 0, 0, 0);
    expect(world.enemies.cols.hp[bat]).toBe(-5);
    expect((world.enemies.cols.flags[bat] ?? 0) & ENEMY_FLAG_DEAD).toBe(ENEMY_FLAG_DEAD);
    cleanupSystem(world, DT);
    expect(world.enemies.count).toBe(1);
    expect(world.stats.kills).toBe(1);
    expect(world.events.count).toBe(1);
    expect(world.events.items[0]).toMatchObject({
      kind: 'enemyKilled',
      x: 40,
      y: 10,
      enemyId: 'bat',
      xp: ENEMIES.bat.xp,
    });
    cleanupSystem(world, DT);
    expect(world.stats.kills).toBe(1);
  });

  it('kills once when a direct hit and a bolt both reach a bat in the same full step', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 60, 0, 1);
    indexEnemies(world);
    world.weaponContext.spawnProjectile('weapon.magicWand', 60, 0, 1, 0, {
      damage: 10,
      weaponSlot: 0,
      knockback: 0,
      radius: 6,
      pierce: 1,
      ttl: 1,
    });
    world.weaponContext.damageEnemy(bat, 10, 1, 0, 0, 0);
    // The step runs the projectile system (the bolt overlaps the dead bat and must not hit it again) and the cleanup.
    world.step(DT);
    const kills = world.events.items
      .slice(0, world.events.count)
      .filter((e) => e.kind === 'enemyKilled');
    expect(kills).toHaveLength(1);
    expect(world.stats.kills).toBe(1);
  });

  it('counts the hit flash down in the cleanup and spawns the death puff', () => {
    const world = quietWorld();
    const bat = target(world, 'bat', 0, 50, 100);
    damageEnemy(world, bat, 1, 0, 1, 0, 0);
    for (let i = 0; i < 6; i++) cleanupSystem(world, DT);
    expect(world.enemies.cols.flash[bat]).toBe(0);
    damageEnemy(world, bat, 1000, 0, 1, 0, 0);
    const before = world.fx.count;
    cleanupSystem(world, DT);
    expect(world.fx.count).toBe(before + 1);
  });
});
