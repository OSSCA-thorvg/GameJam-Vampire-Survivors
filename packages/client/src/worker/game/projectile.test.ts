import { PROJECTILE_CAP } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { hpByUid, indexEnemies, quietWorld, target } from './combat-test-helpers';
import { projectileSystem, spawnProjectile, type ProjectileOptions } from './projectiles';
import type { World } from './world';

const DT = 1 / 60;
const bolt = (overrides: Partial<ProjectileOptions> = {}): ProjectileOptions => ({
  damage: 10,
  knockback: 0,
  radius: 6,
  pierce: 1,
  ttl: 2,
  ...overrides,
});

function run(world: World, steps: number): void {
  for (let i = 0; i < steps; i++) {
    indexEnemies(world);
    projectileSystem(world, DT);
  }
}

describe('projectiles', () => {
  it('with pierce 2 through three enemies in a row, damages exactly the first two, then is removed', () => {
    const world = quietWorld();
    const uids = [0, 40, 80].map((x) => world.enemies.uid[target(world, 'bat', x, 0)] ?? -1);
    spawnProjectile(world, 'weapon.magicWand', -60, 0, 400, 0, bolt({ pierce: 2 }));
    run(world, 60);
    const hp = hpByUid(world);
    expect(uids.map((uid) => hp.get(uid))).toEqual([990, 990, 1000]);
    expect(world.projectiles.count).toBe(0);
  });

  it('never damages an enemy twice while it stays overlapped for several steps', () => {
    const world = quietWorld();
    const slot = target(world, 'ghoul', 0, 0);
    spawnProjectile(world, 'weapon.magicWand', -5, 0, 10, 0, bolt({ pierce: 5 }));
    run(world, 30);
    expect(world.enemies.cols.hp[slot]).toBe(990);
    expect(world.projectiles.count).toBe(1);
    expect(world.projectiles.cols.pierceLeft[0]).toBe(4);
  });

  it('hits enemy UID 0 once, then ignores it, but a new enemy reusing its index is eligible', () => {
    const world = quietWorld();
    const first = target(world, 'ghoul', 0, 0);
    expect(world.enemies.uid[first]).toBe(0);
    spawnProjectile(world, 'weapon.magicWand', 0, 0, 1, 0, bolt({ pierce: 5, ttl: 10 }));
    run(world, 5);
    expect(world.enemies.cols.hp[first]).toBe(990);
    world.enemies.remove(first);
    const reused = target(world, 'ghoul', 0, 0);
    const uid = world.enemies.uid[reused] ?? 0;
    expect(uid & 0xfff).toBe(0);
    expect(uid).not.toBe(0);
    run(world, 5);
    expect(world.enemies.cols.hp[reused]).toBe(990);
    expect(world.projectiles.cols.hitCount[0]).toBe(2);
  });

  it('keeps the last four UIDs in its ring once more than four were hit', () => {
    const world = quietWorld();
    for (let i = 0; i < 6; i++) target(world, 'bat', i * 30, 0);
    spawnProjectile(world, 'weapon.magicWand', -20, 0, 300, 0, bolt({ pierce: 100 }));
    run(world, 60);
    expect([...hpByUid(world).values()]).toEqual(Array.from({ length: 6 }, () => 990));
    const p = world.projectiles.cols;
    expect(p.hitCount[0]).toBe(4);
    expect(new Set([p.hit0[0], p.hit1[0], p.hit2[0], p.hit3[0]])).toEqual(
      new Set([2, 3, 4, 5].map((i) => world.enemies.uid[i])),
    );
  });

  it('is removed once its ttl runs out', () => {
    const world = quietWorld();
    spawnProjectile(world, 'weapon.magicWand', 0, 0, 100, 0, bolt({ ttl: 0.5 }));
    run(world, 29);
    expect(world.projectiles.count).toBe(1);
    expect(world.projectiles.cols.x[0]).toBeCloseTo(100 * 29 * DT, 3);
    run(world, 2);
    expect(world.projectiles.count).toBe(0);
  });

  it('returns -1 at PROJECTILE_CAP and never holds more', () => {
    const world = quietWorld();
    for (let i = 0; i < PROJECTILE_CAP; i++)
      expect(spawnProjectile(world, 'weapon.magicWand', 0, 0, 1, 0, bolt())).toBe(i);
    expect(spawnProjectile(world, 'weapon.magicWand', 0, 0, 1, 0, bolt())).toBe(-1);
    expect(world.projectiles.count).toBe(PROJECTILE_CAP);
  });
});
