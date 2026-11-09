import { CHARACTERS, lottieProfile, type DrawableAssetId } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import type { AssetInstance } from '../assets/library';
import { createBaseWorld } from './base-world';
import { spawnEnemy } from './enemies';
import { MOTION_RETURN, projectileSystem, spawnProjectile } from './projectiles';
import { enemyMovementSystem } from './systems/enemy-movement';
import { freezeEnemies } from './systems/freeze';
import { createGameView } from './view';
import { fakeGameView } from './view-test-helpers';

function nativeView() {
  const fake = fakeGameView();
  const instances = new Map<AssetInstance, DrawableAssetId>();
  const active = new Set<AssetInstance>();
  const setMotionState = vi.fn();
  const setHitFeedback = vi.fn(() => true);
  const setHitFlash = vi.fn(() => true);
  const setPlaybackDuration = vi.fn();
  const resetPlayback = vi.fn();
  const library = {
    create(id: DrawableAssetId) {
      const instance = fake.options.library.create(id);
      if (
        lottieProfile(id) !== 'flat' ||
        id.startsWith('weapon.') ||
        id.startsWith('fx.') ||
        id === 'stage.brazier'
      )
        instance.lottie = {} as never;
      instances.set(instance, id);
      return instance;
    },
    setPlaybackActive(instance: AssetInstance, playing: boolean) {
      if (playing) active.add(instance);
      else active.delete(instance);
    },
    resetPlayback,
    setMotionState,
    setHitFeedback,
    setHitFlash,
    setPlaybackDuration,
  };
  const view = createGameView({ ...fake.options, library });
  const world = createBaseWorld({
    seed: 1,
    enemyPools: view.enemyPools,
    projectilePools: view.projectilePools,
  });
  return {
    ...fake,
    view,
    world,
    instances,
    active,
    setMotionState,
    setHitFeedback,
    setHitFlash,
    setPlaybackDuration,
    resetPlayback,
  };
}

it('activates only the selected native character and restarts feedback for each new run', () => {
  const test = nativeView();
  for (const character of CHARACTERS) {
    test.view.begin(character.id);
    const player = [...test.instances].find(([, id]) => id === character.spriteId)?.[0];
    if (!player) throw new Error('Selected native player missing');
    expect(
      [...test.active].filter((instance) => test.instances.get(instance)?.startsWith('player.')),
    ).toEqual([player]);
    test.world.player.dirX = -1;
    test.world.player.hp = 80;
    test.world.player.invulnTime = 0.5;
    test.view.render(test.world);
    expect(test.setMotionState).toHaveBeenCalledWith(player, 'move');
    expect(test.setHitFeedback).toHaveBeenLastCalledWith(player, 0.5);
    const events = test.setHitFeedback.mock.calls.length;
    test.world.player.hp = 90;
    test.world.player.invulnTime = 0.4;
    test.view.render(test.world);
    expect(test.setHitFeedback).toHaveBeenCalledTimes(events);
    test.world.player.invulnTime = 0;
    test.view.render(test.world);
    expect(test.setHitFeedback).toHaveBeenLastCalledWith(player, 0);
    test.view.clear();
    expect(test.active.size).toBe(0);
  }
  for (const paint of test.paints.filter((paint) => paint.id.startsWith('player.')))
    expect(paint.opacityWrites).toBe(0);
  expect(test.view.countPaints()).toBe(3666);
});

it('uses idle native enemy poses during freeze and releases the native overlay when freeze expires', () => {
  const test = nativeView();
  test.view.begin('warden');
  const slot = spawnEnemy(test.world, 'bat', 100, 0);
  const handle = test.world.enemies.cols.paintHandle[slot] ?? -1;
  const enemy = test.view.enemyPools[0]?.get(handle);
  if (!enemy) throw new Error('Bound native enemy missing');
  enemyMovementSystem(test.world, 1 / 60);
  test.view.render(test.world);
  expect(test.setMotionState).toHaveBeenCalledWith(enemy, 'move');
  freezeEnemies(test.world, 10);
  enemyMovementSystem(test.world, 1 / 60);
  test.world.enemies.cols.flash[slot] = 0.1;
  test.view.render(test.world);
  expect(test.setMotionState).toHaveBeenCalledWith(enemy, 'idle');
  expect(test.setHitFlash).toHaveBeenLastCalledWith(enemy, true);
  const overlay = [...test.instances].find(([, id]) => id === 'fx.freeze')?.[0];
  if (!overlay) throw new Error('Native frost overlay missing');
  expect(test.active.has(overlay)).toBe(true);
  const resets = test.resetPlayback.mock.calls.length;
  test.view.render(test.world);
  expect(test.resetPlayback).toHaveBeenCalledTimes(resets);
  test.world.time = 10;
  enemyMovementSystem(test.world, 1 / 60);
  test.view.render(test.world);
  expect(test.active.has(overlay)).toBe(false);
  expect(test.setMotionState.mock.calls.filter(([instance]) => instance === enemy).at(-1)).toEqual([
    enemy,
    'move',
  ]);
  for (const paint of test.paints.filter((paint) => paint.id === 'enemy.bat'))
    expect(paint.opacityWrites).toBe(0);
});

it('fits a returning Heaven Sword once per lease while retaining initial aim and simulation rotation', () => {
  const test = nativeView();
  test.view.begin('aurelia');
  const slot = spawnProjectile(test.world, 'weapon.heavenSword', 0, 0, 100, 100, {
    damage: 10,
    weaponSlot: 0,
    knockback: 0,
    radius: 1,
    pierce: 2,
    ttl: 2,
    motion: MOTION_RETURN,
    returnAfter: 1,
  });
  const pool = test.view.projectilePools[test.world.projectiles.cols.poolId[slot] ?? -1];
  if (!pool) throw new Error('Heaven Sword pool missing');
  const handle = test.world.projectiles.cols.paintHandle[slot] ?? -1;
  const instance = pool.get(handle);
  expect(test.setPlaybackDuration).toHaveBeenCalledExactlyOnceWith(instance, 0.5);
  projectileSystem(test.world, 1 / 60);
  expect(test.world.projectiles.cols.rot[slot]).toBeCloseTo(57);
  expect(pool.rotation(handle, test.world.projectiles.cols.rot[slot] ?? 0)).toBeCloseTo(45);
  expect(test.setPlaybackDuration).toHaveBeenCalledTimes(1);
});
