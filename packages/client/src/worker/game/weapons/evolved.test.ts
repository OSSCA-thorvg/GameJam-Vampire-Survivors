import { EVOLUTIONS, WEAPONS, type WeaponId } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { indexEnemies, target } from '../combat-test-helpers';
import { FX_ASSETS } from '../fx';
import { PROJECTILE_ASSETS } from '../projectiles';
import { createGameView } from '../view';
import { fakeGameView } from '../view-test-helpers';
import { createWorld } from '../world';
import { armed, DT, effectiveLevel, flyProjectiles } from './arm-test-helpers';
import { evolveWeapon } from './owned';
import { axe } from './patterns/axe';
import { kingBible } from './patterns/kingBible';
import { whip } from './patterns/whip';
import { weaponSystem } from './system';

describe('evolved weapons (#15)', () => {
  it('Bloody Tear heals 1 HP on every 10th hit, capped at max HP', () => {
    const { world, w } = armed('bloodyTear');
    for (let i = 0; i < 10; i++) target(world, 'bat', 20 + i * 12, 0, 1e6);
    indexEnemies(world);
    world.player.hp = 50;
    const lv = effectiveLevel(world, w);
    whip.fire(world.weaponContext, w, lv, 0);
    expect(w.hits).toBe(10);
    expect(world.player.hp).toBe(51);
    whip.fire(world.weaponContext, w, lv, 0);
    expect(world.player.hp).toBe(52);
    world.player.hp = world.player.maxHp;
    whip.fire(world.weaponContext, w, lv, 0);
    expect(world.player.hp).toBe(world.player.maxHp);
  });

  it('Soul Eater heals 1 HP per 10 hits from its aura', () => {
    const { world, w } = armed('soulEater');
    for (let i = 0; i < 5; i++) target(world, 'bat', i * 10 - 20, 5, 1e6);
    indexEnemies(world);
    world.player.hp = 50;
    const lv = effectiveLevel(world, w);
    for (let tick = 0; tick < 2; tick++) weaponSystem(world, 10);
    expect(w.hits).toBe(10);
    expect(world.player.hp).toBe(51);
    expect(lv.healEveryHits).toBe(10);
    // The Soul Eater art's visible ring lies on the hit radius, like the garlic's (#91).
    expect(world.weaponVisuals.garlic.evolved).toBe(true);
    expect(world.weaponVisuals.garlic.scale).toBeCloseTo((lv.area * 50) / 56);
  });

  it('Heaven Sword crits about 20% of its hits for double damage', () => {
    const { world, w } = armed('heavenSword');
    const lv = effectiveLevel(world, w);
    let crits = 0;
    let hits = 0;
    for (let n = 0; n < 400; n++) {
      const slot = target(world, 'bat', 0, 0, 1e6);
      indexEnemies(world);
      world.weaponContext.weaponHit(w, lv, slot, 1, 0);
      const dealt = 1e6 - (world.enemies.cols.hp[slot] ?? 0);
      if (dealt === lv.damage * 2) crits++;
      else expect(dealt).toBe(lv.damage);
      hits++;
      world.enemies.clear();
    }
    expect(crits / hits).toBeGreaterThan(0.14);
    expect(crits / hits).toBeLessThan(0.26);
  });

  it('Death Spiral fires 9 scythes evenly around the player, straight out and with no gravity', () => {
    const { world, w } = armed('deathSpiral');
    const lv = effectiveLevel(world, w);
    for (let shot = 0; shot < 9; shot++) axe.fire(world.weaponContext, w, lv, shot);
    const { vx, vy } = world.projectiles.cols;
    const angles = Array.from(
      { length: 9 },
      (_, i) => Math.round((Math.atan2(vy[i] ?? 0, vx[i] ?? 0) * 180) / Math.PI + 360) % 360,
    );
    expect(angles).toEqual([0, 40, 80, 120, 160, 200, 240, 280, 320]);
    const before = vy[2];
    flyProjectiles(world, 10);
    expect(world.projectiles.cols.vy[2]).toBeCloseTo(before ?? NaN);
  });

  it('Unholy Vespers keeps its books out: never hidden over 20 s', () => {
    const { world, w } = armed('unholyVespers');
    const lv = effectiveLevel(world, w);
    kingBible.fire(world.weaponContext, w, lv, 0);
    for (let i = 0; i < 20 * 60; i++) {
      kingBible.update?.(world.weaponContext, w, lv, DT);
      expect(world.weaponVisuals.books.count).toBe(lv.amount);
    }
    expect(world.weaponVisuals.books.evolved).toBe(true);
  });

  it('keeps the slot and the timers through evolveWeapon, and refuses a second copy', () => {
    const { world, w } = armed('whip', 8);
    w.cooldownLeft = 0.7;
    expect(evolveWeapon(world, 'whip', 'bloodyTear')).toBe(true);
    expect(world.weapons[0]).toBe(w);
    expect(w).toMatchObject({ slot: 0, level: 1, cooldownLeft: 0.7 });
    expect(w.def).toBe(WEAPONS.bloodyTear);
    expect(evolveWeapon(world, 'whip', 'bloodyTear')).toBe(false);
  });

  it('draws every evolution with its own art, from the existing projectile and effect pools', () => {
    const projectileArt: readonly string[] = PROJECTILE_ASSETS;
    const fxArt: readonly string[] = FX_ASSETS;
    for (const { intoWeaponId } of EVOLUTIONS) {
      const def = WEAPONS[intoWeaponId];
      const persistent = def.pattern === 'kingBible' || def.pattern === 'garlic';
      const pool = def.pattern === 'whip' ? fxArt : projectileArt;
      if (!persistent) expect(pool, intoWeaponId).toContain(def.assetId);
    }
    // One real step per projectile evolution, on the view's pools: the bound pool draws the evolved art.
    const fake = fakeGameView();
    const view = createGameView(fake.options);
    view.begin('warden');
    const ids: WeaponId[] = ['holyWand', 'thousandEdge', 'deathSpiral', 'heavenSword', 'hellfire'];
    for (const id of ids) {
      const world = createWorld({
        seed: 3,
        projectilePools: view.projectilePools,
        fxPools: view.fxPools,
      });
      world.weapons.length = 0;
      world.spawnTimer = 1e9;
      const { weapons } = world;
      weapons.push({ ...armed(id).w, slot: 0, cooldownLeft: DT });
      world.step(DT);
      expect(world.projectiles.count, id).toBeGreaterThan(0);
      expect(PROJECTILE_ASSETS[world.projectiles.cols.poolId[0] ?? -1], id).toBe(
        WEAPONS[id].assetId,
      );
      view.clear();
      view.begin('warden');
    }
  });
});
