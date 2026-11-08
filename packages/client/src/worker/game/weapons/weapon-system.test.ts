import { MAX_WEAPON_SLOTS, WEAPONS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { quietWorld } from '../combat-test-helpers';
import { addWeapon, grantNextWeapon, levelUpWeapon } from './owned';
import { weaponSystem } from './system';

const DT = 1 / 60;

describe('weapon system', () => {
  it('fires a 1.35 s cooldown exactly 4 times in 6 s of steps', () => {
    const world = quietWorld();
    addWeapon(world, 'whip');
    expect(WEAPONS.whip.levels[0]?.cooldownSec).toBe(1.35);
    const fireSteps: number[] = [];
    for (let i = 1; i <= 360; i++) {
      const before = world.fx.count;
      weaponSystem(world, DT);
      if (world.fx.count > before) fireSteps.push(i);
    }
    // No enemies: each strike adds only its `weapon.whip` effect, and nothing expires without the fx system.
    expect(fireSteps).toEqual([81, 162, 243, 324]);
  });

  it('fires a burst of amount 3 as 3 projectiles 0.1 s apart', () => {
    const world = quietWorld();
    addWeapon(world, 'magicWand');
    for (let i = 0; i < 3; i++) levelUpWeapon(world, 'magicWand');
    const wand = world.weapons[0];
    if (!wand) throw new Error('no wand');
    expect(wand.level).toBe(4);
    expect(WEAPONS.magicWand.levels[3]?.amount).toBe(3);
    wand.cooldownLeft = DT;
    const fireSteps: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const before = world.projectiles.count;
      weaponSystem(world, DT);
      if (world.projectiles.count > before) fireSteps.push(i);
    }
    // 0.1 s is 6 steps.
    expect(fireSteps).toEqual([1, 7, 13]);
    expect(world.projectiles.count).toBe(3);
  });

  it('adds each weapon once, into at most MAX_WEAPON_SLOTS, and levels it up to maxLevel only', () => {
    const world = quietWorld();
    expect(addWeapon(world, 'whip')).toBe(true);
    expect(addWeapon(world, 'whip')).toBe(false);
    expect(levelUpWeapon(world, 'magicWand')).toBe(false);
    for (let level = 2; level <= 8; level++) expect(levelUpWeapon(world, 'whip')).toBe(true);
    expect(levelUpWeapon(world, 'whip')).toBe(false);
    expect(world.weapons[0]?.level).toBe(8);
    // `G` follows `WEAPON_LIST` until the six slots are full.
    for (const id of ['magicWand', 'knife', 'axe', 'cross', 'kingBible'])
      expect(grantNextWeapon(world)).toBe(id);
    expect(grantNextWeapon(world)).toBeNull();
    expect(world.weapons.map((w) => w.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    const full = quietWorld();
    const filler = world.weapons[0];
    if (!filler) throw new Error('no whip');
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) full.weapons.push({ ...filler });
    expect(addWeapon(full, 'magicWand')).toBe(false);
  });

  it('reads stats from the content data: a shorter cooldown in the data fires sooner with no code change', () => {
    const world = quietWorld();
    addWeapon(world, 'whip');
    const weapon = world.weapons[0];
    if (!weapon) throw new Error('no whip');
    const faster = {
      ...WEAPONS.whip,
      levels: WEAPONS.whip.levels.map((lv) => ({ ...lv, cooldownSec: 0.5 })),
    };
    weapon.def = faster;
    weapon.cooldownLeft = 0.5;
    let fires = 0;
    for (let i = 0; i < 360; i++) {
      const before = world.fx.count;
      weaponSystem(world, DT);
      if (world.fx.count > before) fires++;
    }
    expect(fires).toBe(12);
  });
});
