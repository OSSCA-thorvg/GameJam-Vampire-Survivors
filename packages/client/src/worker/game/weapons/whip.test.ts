import { WEAPONS } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { hpByUid, indexEnemies, quietWorld, target } from '../combat-test-helpers';
import { addWeapon, levelUpWeapon } from './owned';
import { whip, WHIP_HEIGHT, WHIP_WIDTH } from './patterns/whip';
import { weaponSystem } from './system';

const DT = 1 / 60;
const L1 = WEAPONS.whip.levels[0];
if (!L1) throw new Error('no whip L1');

/** A quiet world holding only the Whip at `level`, about to strike (its cooldown ends on the next step). */
function armed(level: number) {
  const world = quietWorld();
  addWeapon(world, 'whip');
  for (let l = 1; l < level; l++) levelUpWeapon(world, 'whip');
  const w = world.weapons[0];
  if (!w) throw new Error('no whip');
  w.cooldownLeft = DT;
  return { world, w };
}

describe('whip', () => {
  it('damages enemies inside the box on the facing side, pushing them away, and none outside it', () => {
    const { world, w } = armed(1);
    const inside = [
      target(world, 'bat', 30, 0),
      target(world, 'bat', WHIP_WIDTH - 5, 15),
      // The box edge is at y = 20; a bat of radius 12 at y = 30 still overlaps it.
      target(world, 'bat', 80, WHIP_HEIGHT / 2 + 10),
    ].map((s) => world.enemies.uid[s] ?? -1);
    const outside = [
      target(world, 'bat', 80, 60),
      target(world, 'bat', WHIP_WIDTH + 20, 0),
      target(world, 'bat', -40, 0),
    ].map((s) => world.enemies.uid[s] ?? -1);
    indexEnemies(world);
    whip.fire(world.weaponContext, w, L1, 0);
    const hp = hpByUid(world);
    expect(inside.map((uid) => hp.get(uid))).toEqual([990, 990, 990]);
    expect(outside.map((uid) => hp.get(uid))).toEqual([1000, 1000, 1000]);
    // Knockback points from the player to the enemy: the first bat is pushed straight right.
    expect(world.enemies.cols.kbX[0]).toBeCloseTo(L1.knockback, 4);
    expect(world.enemies.cols.kbY[0]).toBeCloseTo(0, 4);
    // The strike effect sits over the box, unflipped on the right.
    expect(world.fx.cols.x[world.fx.count - 1]).toBe(WHIP_WIDTH / 2);
    expect(world.fx.cols.flip[world.fx.count - 1]).toBe(0);
  });

  it('strikes left when the player faces left, with the effect flipped', () => {
    const { world, w } = armed(1);
    world.player.facingX = -1;
    const left = target(world, 'bat', -50, 0);
    const right = target(world, 'bat', 50, 0);
    indexEnemies(world);
    weaponSystem(world, DT);
    expect(world.enemies.cols.hp[left]).toBe(990);
    expect(world.enemies.cols.hp[right]).toBe(1000);
    expect(w.burstFacingX).toBe(-1);
    const strike = world.fx.count - 1;
    expect(world.fx.cols.x[strike]).toBe(-WHIP_WIDTH / 2);
    expect(world.fx.cols.flip[strike]).toBe(1);
  });

  it('leaves an enemy behind the player untouched at L1 and hits it 0.1 s later at L2', () => {
    for (const [level, expected] of [
      [1, 1000],
      [2, 990],
    ] as const) {
      const { world } = armed(level);
      const front = target(world, 'bat', 60, 0);
      const behind = target(world, 'bat', -60, 0);
      const hits: number[] = [];
      for (let i = 1; i <= 30; i++) {
        indexEnemies(world);
        const before = world.enemies.cols.hp[behind];
        weaponSystem(world, DT);
        if (world.enemies.cols.hp[behind] !== before) hits.push(i);
      }
      expect(world.enemies.cols.hp[front], `L${String(level)}`).toBe(990);
      expect(world.enemies.cols.hp[behind], `L${String(level)}`).toBe(expected);
      expect(hits).toEqual(level === 2 ? [7] : []);
    }
  });

  it('damages each enemy once per strike, also in a dense crowd', () => {
    const { world, w } = armed(1);
    for (let i = 0; i < 100; i++)
      target(world, 'bat', 10 + (i % 10) * 14, -15 + Math.floor(i / 10) * 3);
    indexEnemies(world);
    whip.fire(world.weaponContext, w, L1, 0);
    expect(new Set(hpByUid(world).values())).toEqual(new Set([990]));
  });

  it('scales the box with area: at L4 (area 1.1) it reaches 176 units', () => {
    const { world, w } = armed(4);
    const lv = WEAPONS.whip.levels[3];
    if (!lv) throw new Error('no L4');
    expect(lv.area).toBe(1.1);
    const edge = target(world, 'bat', 160 + 12 + 10, 0);
    indexEnemies(world);
    whip.fire(world.weaponContext, w, lv, 0);
    expect(world.enemies.cols.hp[edge]).toBe(1000 - lv.damage);
    expect(world.fx.cols.scale[world.fx.count - 1]).toBeCloseTo(1.1, 6);
  });
});
