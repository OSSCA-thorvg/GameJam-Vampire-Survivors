import { ELITE, ENEMIES, MAX_ENEMY_RADIUS, PLAYER_RADIUS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { cameraSystem } from '../camera';
import { createBaseWorld } from '../base-world';
import { indexEnemies } from '../combat-test-helpers';
import { ENEMY_FLAG_BOSS, ENEMY_FLAG_ELITE, enemyRadius, spawnEnemy } from '../enemies';
import { projectileSystem, spawnProjectile } from '../projectiles';
import { readBosses } from '../snapshot';
import { stepAnsweringLevelUps } from '../test-level-ups';
import { bossTetherSystem, spawnBoss } from './bosses';
import { contactDamageSystem } from './contact-damage';
import { RELOCATE_DISTANCE } from './enemy-relocate';
import { spawnElite } from './elites';

const DT = 1 / 60;

/** A quiet world at `BASE_STATS` (no character armor, #14): no weapons, no spawns. */
function quietWorld() {
  const world = createBaseWorld({ seed: 1 });
  world.weapons.length = 0;
  world.spawnTimer = 1e9;
  return world;
}

describe('elites', () => {
  it('have 10× HP, a 1.5× collision radius, flag bit 2, and land 1.5× contact damage', () => {
    const world = quietWorld();
    const slot = spawnElite(world, 'ghoul', { x: 10, y: 0 });
    const { cols } = world.enemies;
    expect(cols.hp[slot]).toBe(ENEMIES.ghoul.maxHp * ELITE.hp);
    expect(enemyRadius(cols, slot)).toBe(ENEMIES.ghoul.radius * 1.5);
    expect((cols.flags[slot] ?? 0) & ENEMY_FLAG_ELITE).toBe(ENEMY_FLAG_ELITE);
    indexEnemies(world);
    contactDamageSystem(world, DT);
    expect(world.player.hp).toBe(world.player.maxHp - ENEMIES.ghoul.contactDamage * ELITE.damage);
  });

  it('spawn on the spawn ring for "player", and never as a boss', () => {
    const world = quietWorld();
    cameraSystem(world);
    const slot = spawnElite(world, 'bat', 'player');
    const ring = world.camera.viewRect(64);
    const x = world.enemies.cols.x[slot] ?? NaN;
    const y = world.enemies.cols.y[slot] ?? NaN;
    const onEdge = (a: number, b: number) => Math.abs(a - b) < 1e-3;
    expect(
      onEdge(x, ring.left) ||
        onEdge(x, ring.right) ||
        onEdge(y, ring.top) ||
        onEdge(y, ring.bottom),
    ).toBe(true);
    expect(spawnElite(world, 'reaper5', 'player')).toBe(-1);
  });

  it('are touched at their scaled radius: an elite ghoul at PLAYER_RADIUS + 23 hits, a plain one does not', () => {
    for (const elite of [true, false]) {
      const world = quietWorld();
      const at = { x: PLAYER_RADIUS + 23, y: 0 };
      if (elite) spawnElite(world, 'ghoul', at);
      else spawnEnemy(world, 'ghoul', at.x, at.y);
      indexEnemies(world);
      contactDamageSystem(world, DT);
      expect(world.player.hp < world.player.maxHp, String(elite)).toBe(elite);
    }
  });
});

describe('bosses', () => {
  it('are flagged bit 0 and spawn only for boss content', () => {
    const world = quietWorld();
    cameraSystem(world);
    const slot = spawnBoss(world, 'reaper5');
    expect((world.enemies.cols.flags[slot] ?? 0) & ENEMY_FLAG_BOSS).toBe(ENEMY_FLAG_BOSS);
    expect(spawnBoss(world, 'bat')).toBe(-1);
  });

  it('are teleported onto the spawn ring ahead of a moving player when 2000 units away, keeping their HP', () => {
    const world = quietWorld();
    world.player.x = 5000;
    world.player.dirX = 1;
    cameraSystem(world);
    const slot = spawnEnemy(world, 'reaper5', 3000, 0);
    world.enemies.cols.flags[slot] = ENEMY_FLAG_BOSS;
    world.enemies.cols.hp[slot] = 1234;
    bossTetherSystem(world, DT);
    const { x, y, hp } = world.enemies.cols;
    const ring = world.camera.viewRect(64);
    expect(world.enemies.count).toBe(1);
    expect(hp[slot]).toBe(1234);
    expect(x[slot]).toBeGreaterThan(world.player.x);
    expect(x[slot]).toBeLessThanOrEqual(ring.right + 1e-3);
    const d = Math.hypot((x[slot] ?? 0) - world.player.x, (y[slot] ?? 0) - world.player.y);
    expect(d).toBeLessThan(RELOCATE_DISTANCE);
  });

  it('stay put within the relocate distance, and the tether runs every 0.5 s', () => {
    const world = quietWorld();
    cameraSystem(world);
    const slot = spawnBoss(world, 'reaper10');
    world.enemies.cols.x[slot] = RELOCATE_DISTANCE - 10;
    world.enemies.cols.y[slot] = 0;
    bossTetherSystem(world, DT);
    expect(world.enemies.cols.x[slot]).toBe(RELOCATE_DISTANCE - 10);
    world.enemies.cols.x[slot] = 3000;
    bossTetherSystem(world, DT);
    expect(world.enemies.cols.x[slot]).toBe(3000);
    for (let i = 0; i < 30; i++) bossTetherSystem(world, DT);
    expect(world.enemies.cols.x[slot]).not.toBe(3000);
  });

  it('never leave a long walk: 30 s walking right keeps reaper5 within the relocate distance', () => {
    const world = quietWorld();
    world.input = { dx: 1, dy: 0 };
    world.debugInvulnerable = true;
    cameraSystem(world);
    spawnBoss(world, 'reaper5');
    let farthest = 0;
    stepAnsweringLevelUps(world, 30 * 60, () => {
      const bosses = readBosses(world);
      expect(bosses).toHaveLength(1);
      farthest = Math.max(farthest, bosses[0]?.distance ?? Infinity);
    });
    expect(world.player.x).toBeGreaterThan(3000);
    // One tether interval of walking (0.5 s at 140 units/s) past the limit at most.
    expect(farthest).toBeLessThan(RELOCATE_DISTANCE + 80);
  });
});

describe('the safety fact: MAX_ENEMY_RADIUS covers the larger enemies of #15', () => {
  it('is 48, the radius of reaper10', () => {
    expect(MAX_ENEMY_RADIUS).toBe(ENEMIES.reaper10.radius);
  });

  it('lets a boss at PLAYER_RADIUS + 40 (just inside) deal contact damage', () => {
    const world = quietWorld();
    spawnBoss(world, 'reaper5');
    world.enemies.cols.x[0] = PLAYER_RADIUS + 40 - 0.5;
    world.enemies.cols.y[0] = 0;
    indexEnemies(world);
    contactDamageSystem(world, DT);
    expect(world.player.hp).toBe(world.player.maxHp - ENEMIES.reaper5.contactDamage);
  });

  it('lets a projectile at radius + 40 from a boss centre hit it, and reaper10 at radius + 48', () => {
    for (const id of ['reaper5', 'reaper10'] as const) {
      const world = quietWorld();
      const slot = spawnEnemy(world, id, 0, 0);
      const reach = 6 + ENEMIES[id].radius - 0.5;
      spawnProjectile(world, 'weapon.magicWand', reach, 0, 0, 0, {
        damage: 10,
        weaponSlot: 0,
        knockback: 0,
        radius: 6,
        pierce: 1,
        ttl: 1,
      });
      indexEnemies(world);
      projectileSystem(world, DT);
      expect(world.enemies.cols.hp[slot], id).toBe(ENEMIES[id].maxHp - 10);
    }
  });

  it('lets a projectile reach an elite ghoul at its scaled radius', () => {
    const world = quietWorld();
    const slot = spawnElite(world, 'ghoul', { x: 0, y: 0 });
    spawnProjectile(world, 'weapon.magicWand', 6 + 24 - 0.5, 0, 0, 0, {
      damage: 10,
      weaponSlot: 0,
      knockback: 0,
      radius: 6,
      pierce: 1,
      ttl: 1,
    });
    indexEnemies(world);
    projectileSystem(world, DT);
    expect(world.enemies.cols.hp[slot]).toBe(ENEMIES.ghoul.maxHp * ELITE.hp - 10);
  });
});

describe('debugInvulnerable (dev only)', () => {
  it('stops contact damage while set', () => {
    const world = quietWorld();
    spawnEnemy(world, 'ghoul', 0, 0);
    world.debugInvulnerable = true;
    indexEnemies(world);
    contactDamageSystem(world, DT);
    expect(world.player.hp).toBe(world.player.maxHp);
    world.debugInvulnerable = false;
    contactDamageSystem(world, DT);
    expect(world.player.hp).toBeLessThan(world.player.maxHp);
  });
});
