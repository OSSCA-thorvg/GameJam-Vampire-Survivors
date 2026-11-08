import { PROJECTILE_CAP, WEAPON_LIST, type WeaponId } from '@vs/shared';
import { expect, it } from 'vitest';
import { PROJECTILE_ASSETS, PROJECTILE_POOL_PREWARM } from '../projectiles';
import { recomputeStats } from '../stats';
import { stepAnsweringLevelUps } from '../test-level-ups';
import { createGameView } from '../view';
import { fakeGameView } from '../view-test-helpers';
import { createWorld } from '../world';
import { addWeapon } from './owned';

/** Two loadouts of six cover all eight weapons. */
const LOADOUTS: WeaponId[][] = [
  ['whip', 'magicWand', 'knife', 'axe', 'cross', 'kingBible'],
  ['knife', 'axe', 'cross', 'fireWand', 'garlic', 'magicWand'],
];

/** A world drawing through a fake game view, holding `loadout` at level 8; HP is refilled every step. */
function maxedRun(loadout: WeaponId[], seed: number) {
  const view = createGameView(fakeGameView().options);
  view.begin('warden');
  const world = createWorld({
    seed,
    enemyPools: view.enemyPools,
    projectilePools: view.projectilePools,
    fxPools: view.fxPools,
    gemPools: view.gemPools,
  });
  world.weapons.length = 0;
  for (const id of loadout) addWeapon(world, id);
  for (const w of world.weapons) w.level = w.def.maxLevel;
  return { view, world };
}

it('covers all eight weapons', () => {
  expect(new Set(LOADOUTS.flat())).toEqual(new Set(WEAPON_LIST));
});

/**
 * Only the projectile pools are checked: standing still, uncollected gems can grow `gem.blue` past its prewarm of 200
 * toward `GEM_CAP` (#11's sizing, retuned by #22).
 */
it(
  'never grows a projectile pool past its prewarm with six weapons at L8 for 60 s',
  { timeout: 60_000 },
  () => {
    for (const loadout of LOADOUTS) {
      const { view, world } = maxedRun(loadout, 11);
      stepAnsweringLevelUps(world, 3600, () => {
        world.player.hp = world.player.maxHp;
        view.render(world);
      });
      expect(world.state).toBe('running');
      for (const [k, id] of PROJECTILE_ASSETS.entries())
        expect(view.projectilePools[k]?.created, `${loadout.join()}: ${id}`).toBe(
          PROJECTILE_POOL_PREWARM[id],
        );
    }
  },
);

it(
  'never exceeds PROJECTILE_CAP with six weapons at L8 and fast stats for 60 s',
  { timeout: 60_000 },
  () => {
    const peaks: number[] = [];
    for (const loadout of LOADOUTS) {
      const { world } = maxedRun(loadout, 7);
      // Cooldowns at their 0.05 s floor, two more shots per burst and 6× lifetimes, to push toward the cap.
      world.player.runModifiers.push(
        { stat: 'cooldown', add: -0.99 },
        { stat: 'amount', add: 2 },
        { stat: 'duration', add: 5 },
      );
      recomputeStats(world);
      let most = 0;
      stepAnsweringLevelUps(world, 3600, () => {
        world.player.hp = world.player.maxHp;
        most = Math.max(most, world.projectiles.count);
      });
      expect(world.state, loadout.join()).toBe('running');
      expect(world.time, loadout.join()).toBeCloseTo(60, 3);
      expect(most, loadout.join()).toBeLessThanOrEqual(PROJECTILE_CAP);
      peaks.push(most);
    }
    // The second loadout holds the cap: spawns past it are skipped (`spawnProjectile` returns -1), never stored.
    expect(peaks[1]).toBe(PROJECTILE_CAP);
  },
);
