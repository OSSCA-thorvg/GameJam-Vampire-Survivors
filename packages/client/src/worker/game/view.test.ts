import { HIT_INVULN_SEC } from '@vs/shared';
import { expect, it } from 'vitest';
import { cleanupSystem, damageEnemy } from './combat';
import { addChest } from './chests';
import { spawnEnemy } from './enemies';
import { addLight, hitLightsInCircle } from './light-sources';
import { PICKUP_FAMILY_LIGHT, spawnPickup } from './pickups';
import { freezeEnemies } from './systems/freeze';
import { spawnElite } from './systems/elites';
import { createGameView, ELITE_MARKERS } from './view';
import { fakeGameView } from './view-test-helpers';
import { createBaseWorld } from './base-world';

/** The HUD's HP fill: the second-to-last Shape (the 16 elite markers of #15 come first, the XP fill last). */
const hpFill = (byId: (id: string) => { matrix: unknown }[]) =>
  byId('Shape').at(-2) as { matrix: { e11: number; e13: number; e23: number } | null } | undefined;

function setup() {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin('warden');
  const world = createBaseWorld({ seed: 1, enemyPools: view.enemyPools });
  const byId = (id: string) => fake.paints.filter((p) => p.id === id);
  return { ...fake, view, world, byId };
}

it('creates every paint once: ground, garlic, gem, chest, elite marker, enemy, projectile, book and effect pools, player, HP and XP bars, skull, fills and texts', () => {
  const { view, byId, paints } = setup();
  expect(byId('stage.ground')).toHaveLength(96);
  expect(byId('enemy.bat')).toHaveLength(200);
  expect(byId('enemy.ghoul')).toHaveLength(200);
  expect(byId('weapon.magicWand')).toHaveLength(300);
  expect(byId('weapon.knife')).toHaveLength(100);
  expect(byId('weapon.axe')).toHaveLength(30);
  expect(byId('weapon.cross')).toHaveLength(30);
  expect(byId('weapon.fireWand')).toHaveLength(60);
  expect(byId('weapon.kingBible')).toHaveLength(8);
  expect(byId('weapon.garlic')).toHaveLength(1);
  for (const id of ['weapon.whip', 'fx.hit', 'fx.enemyDeath'])
    expect(byId(id), id).toHaveLength(64);
  expect(byId('fx.levelUp')).toHaveLength(2);
  // #15: the bosses, the chests and the evolved art.
  expect(byId('boss.reaper5')).toHaveLength(2);
  expect(byId('boss.reaper10')).toHaveLength(2);
  for (const id of ['skeleton', 'wisp', 'brute', 'wraith'])
    expect(byId(`enemy.${id}`), id).toHaveLength(200);
  expect(byId('boss.death')).toHaveLength(2);
  expect(byId('pickup.chest')).toHaveLength(16);
  expect(byId('weapon.holyWand')).toHaveLength(100);
  for (const id of ['weapon.thousandEdge', 'weapon.deathSpiral'])
    expect(byId(id), id).toHaveLength(30);
  for (const id of ['weapon.heavenSword', 'weapon.hellfire']) expect(byId(id), id).toHaveLength(10);
  expect(byId('weapon.unholyVespers')).toHaveLength(8);
  expect(byId('weapon.soulEater')).toHaveLength(1);
  expect(byId('weapon.bloodyTear')).toHaveLength(4);
  expect(byId('fx.chestOpen')).toHaveLength(2);
  expect(byId('gem.blue')).toHaveLength(200);
  expect(byId('gem.green')).toHaveLength(50);
  expect(byId('gem.red')).toHaveLength(50);
  expect(byId('ui.xpBar')).toHaveLength(1);
  // One sprite per character (#14).
  for (const id of ['player.warden', 'player.ember', 'player.swift', 'player.aurelia'])
    expect(byId(id), id).toHaveLength(1);
  // Light sources, their pickups and the frost overlay (#16).
  for (const id of ['stage.brazier', 'stage.brazierBroken']) expect(byId(id), id).toHaveLength(16);
  for (const id of ['floorChicken', 'rosary', 'orologion', 'vacuum', 'littleClover'])
    expect(byId(`pickup.${id}`), id).toHaveLength(32);
  expect(byId('fx.freeze')).toHaveLength(1);
  expect(byId('ui.hpBar')).toHaveLength(1);
  expect(byId('ui.skull')).toHaveLength(1);
  // The 16 elite markers (#15), the HP fill and the XP fill; the level, the timer and the kill counter.
  expect(byId('Shape')).toHaveLength(18);
  expect(byId('Text')).toHaveLength(3);
  expect(view.countPaints()).toBe(2736);
  expect(paints).toHaveLength(2757);
});

it('follows the camera, snapped to device pixels', () => {
  const { view, world, translations } = setup();
  world.input = { dx: 1, dy: 0 };
  world.step(1 / 60);
  view.render(world);
  const [x, y] = translations.at(-1) ?? [NaN, NaN];
  expect(x * 2).toBe(Math.round((640 - world.player.x) * 2));
  expect(y).toBe(360);
});

it('scales the HP fill by hp / maxHp under the player and keeps the frame 6 units below the feet', () => {
  const { view, world, byId } = setup();
  world.player.x = 100;
  world.player.y = 50;
  world.player.hp = 25;
  view.render(world);
  const fill = hpFill(byId)?.matrix;
  expect(fill?.e11).toBe(0.25);
  expect(fill?.e13).toBe(100 - 19);
  expect(fill?.e23).toBe(50 + 6 + 1);
  // The frame's anchor is its centre (0.5, 0.5); the fake has no offset.
  expect(byId('ui.hpBar')[0]?.matrix?.e23).toBe(50 + 6 + 3);
  world.player.hp = -5;
  view.render(world);
  expect(hpFill(byId)?.matrix?.e11).toBe(0);
});

it('writes the timer text only when the shown second changes, as mm:ss', () => {
  const { view, world, byId } = setup();
  const timer = byId('Text')[1];
  const writes = timer?.textWrites ?? 0;
  for (let i = 0; i < 59; i++) {
    world.time += 1 / 60;
    view.render(world);
  }
  expect(timer?.textWrites).toBe(writes);
  world.time = 61.2;
  view.render(world);
  view.render(world);
  expect(timer?.text).toBe('01:01');
  expect(timer?.textWrites).toBe(writes + 1);
});

it('blinks the player between 255 and 100 every 0.08 s while invulnerable, writing opacity only on change', () => {
  const { view, world, byId } = setup();
  const sprite = byId('player.warden')[0];
  const seen: number[] = [];
  world.player.invulnTime = HIT_INVULN_SEC;
  for (let t = 0; t < 40; t++) {
    view.render(world);
    seen.push(sprite?.opacity ?? -1);
    world.player.invulnTime = Math.max(0, world.player.invulnTime - 1 / 60);
  }
  view.render(world);
  expect(new Set(seen)).toEqual(new Set([100, 255]));
  expect(seen[0]).toBe(100);
  // 0.08 s is 4.8 steps: no phase lasts longer than 5 steps while invulnerable.
  let run = 1;
  for (let i = 1; i < 30; i++) {
    run = seen[i] === seen[i - 1] ? run + 1 : 1;
    expect(run).toBeLessThanOrEqual(5);
  }
  expect(sprite?.opacity).toBe(255);
});

it('hides everything on clear and shows the HUD again on begin', () => {
  const { view, byId } = setup();
  view.clear();
  const shown = (id: string) => byId(id).filter((p) => p.visible).length;
  for (const id of [
    'stage.ground',
    'player.warden',
    'ui.hpBar',
    'ui.skull',
    'ui.xpBar',
    'Shape',
    'Text',
  ])
    expect(shown(id), id).toBe(0);
  view.begin('warden');
  expect(shown('stage.ground')).toBe(96);
  expect(shown('player.warden')).toBe(1);
  expect(shown('ui.xpBar')).toBe(1);
  expect(shown('Shape')).toBe(2);
  expect(shown('Text')).toBe(3);
  expect(byId('Text').map((t) => t.text)).toEqual(['Lv 1', '00:00', '0']);
});

it("shows only the chosen character's sprite on begin (#14)", () => {
  const { view, byId } = setup();
  const shown = (id: string) => byId(id).filter((p) => p.visible).length;
  view.begin('swift');
  expect(shown('player.swift')).toBe(1);
  expect(shown('player.warden') + shown('player.ember') + shown('player.aurelia')).toBe(0);
  view.begin('aurelia');
  expect(shown('player.aurelia')).toBe(1);
  expect(shown('player.swift')).toBe(0);
});

it('dims a hit enemy to 140 while it flashes, writing opacity only on change, and draws bolts and effects', () => {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin('warden');
  const world = createBaseWorld({
    seed: 1,
    enemyPools: view.enemyPools,
    projectilePools: view.projectilePools,
    fxPools: view.fxPools,
  });
  world.weapons.length = 0;
  const bat = spawnEnemy(world, 'bat', 50, 0);
  world.enemies.cols.hp[bat] = 1000;
  const sprite = fake.paints.find((p) => p.id === 'enemy.bat' && p.visible);
  if (!sprite) throw new Error('no bat paint');
  const seen: [number, number][] = [];
  const record = () => seen.push([sprite.opacity, sprite.opacityWrites]);
  const base = sprite.opacityWrites;
  view.render(world);
  record();
  damageEnemy(world, bat, 1, 1, 0, 0, 0);
  world.weaponContext.spawnProjectile('weapon.magicWand', 10, 20, 0, 300, {
    damage: 1,
    weaponSlot: 0,
    knockback: 0,
    radius: 6,
    pierce: 1,
    ttl: 1,
  });
  for (let i = 0; i < 3; i++) view.render(world);
  record();
  for (let i = 0; i < 6; i++) cleanupSystem(world, 1 / 60);
  view.render(world);
  view.render(world);
  record();
  // A fresh slot writes 255 once (the pooled paint may be dimmed from an earlier enemy), then once per change.
  expect(seen).toEqual([
    [255, base + 1],
    [140, base + 2],
    [255, base + 3],
  ]);
  const shown = (id: string) => fake.paints.filter((p) => p.id === id && p.visible);
  const [boltPaint] = shown('weapon.magicWand');
  // The bolt points along its velocity (straight down: 90°) at its position.
  expect(boltPaint?.matrix?.e13).toBeCloseTo(10, 4);
  expect(boltPaint?.matrix?.e23).toBeCloseTo(20, 4);
  expect(boltPaint?.matrix?.e21).toBeCloseTo(1, 4);
  expect(shown('fx.hit')).toHaveLength(1);
});

it('fills the XP bar by xp / xpToNext(level) across the view and writes "Lv n" only when the level changes (#11)', () => {
  const { view, world, byId } = setup();
  const fill = () => byId('Shape').at(-1)?.matrix;
  const level = byId('Text')[0];
  world.player.xp = 2;
  view.render(world);
  expect(fill()?.e11).toBeCloseTo(2 / 5);
  expect([fill()?.e13, fill()?.e23]).toEqual([2, 2]);
  const writes = level?.textWrites ?? 0;
  view.render(world);
  expect(level?.textWrites).toBe(writes);
  world.player.level = 3;
  world.player.xp = 50;
  view.render(world);
  expect(level?.text).toBe('Lv 3');
  expect(fill()?.e11).toBe(1);
  // The frame spans the full 1280-unit width (400 × 3.2); the fake has no anchor offset, so its centre is (640, 6).
  const frame = byId('ui.xpBar')[0]?.matrix;
  expect([frame?.e11, frame?.e22, frame?.e13, frame?.e23]).toEqual([3.2, 1, 640, 6]);
});

it('shows the King Bible books and the garlic aura from the weapon visuals, on the prewarmed paints (#13)', () => {
  const { view, world, byId, paints } = setup();
  const created = paints.length;
  const shown = (id: string) => byId(id).filter((p) => p.visible);
  view.render(world);
  expect(shown('weapon.kingBible')).toHaveLength(0);
  expect(shown('weapon.garlic')).toHaveLength(0);
  const { books, garlic } = world.weaponVisuals;
  books.count = 3;
  books.scale = 1.25;
  for (let i = 0; i < 3; i++) {
    books.x[i] = 10 * i;
    books.y[i] = -5;
  }
  garlic.shown = true;
  garlic.scale = 1.8;
  world.player.x = 40;
  view.render(world);
  expect(
    shown('weapon.kingBible').map((p) => [p.matrix?.e13, p.matrix?.e23, p.matrix?.e11]),
  ).toEqual(
    expect.arrayContaining([
      [0, -5, 1.25],
      [10, -5, 1.25],
      [20, -5, 1.25],
    ]),
  );
  const [aura] = shown('weapon.garlic');
  expect([aura?.matrix?.e13, aura?.matrix?.e11]).toEqual([40, 1.8]);
  books.count = 0;
  view.render(world);
  expect(shown('weapon.kingBible')).toHaveLength(0);
  view.clear();
  view.begin('warden');
  view.render(world);
  // A new run starts with the aura re-acquired from the same pool; nothing was created.
  expect(shown('weapon.garlic')).toHaveLength(1);
  expect(paints).toHaveLength(created);
});

it('draws lights and pickups from their pools and stretches the frost overlay over the view only while frozen (#16)', () => {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin('warden');
  const world = createBaseWorld({
    seed: 1,
    lightPools: view.lightPools,
    pickupPools: view.pickupPools,
  });
  const shown = (id: string) => fake.paints.filter((p) => p.id === id && p.visible);
  addLight(world, 100, 0);
  spawnPickup(world, PICKUP_FAMILY_LIGHT, 0, 200, 0);
  view.render(world);
  expect(shown('stage.brazier')).toHaveLength(1);
  expect(shown('pickup.floorChicken')).toHaveLength(1);
  expect(shown('fx.freeze')).toHaveLength(0);
  hitLightsInCircle(world, 100, 0, 1, 1);
  freezeEnemies(world, 10);
  view.render(world);
  expect(shown('stage.brazier')).toHaveLength(0);
  expect(shown('stage.brazierBroken')).toHaveLength(1);
  const [overlay] = shown('fx.freeze');
  expect(overlay?.opacity).toBe(80);
  expect(overlay?.matrix).toMatchObject({ e11: 1280 / 64, e22: 720 / 64 });
  world.time = 10;
  view.render(world);
  expect(shown('fx.freeze')).toHaveLength(0);
});

it('draws an elite at 1.5× over a pooled red marker sized to its radius, and chests on the chest pool (#15)', () => {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin('warden');
  const world = createBaseWorld({
    seed: 1,
    enemyPools: view.enemyPools,
    chestPool: view.chestPool,
  });
  const created = fake.paints.length;
  const shown = (id: string) => fake.paints.filter((p) => p.id === id && p.visible);
  const markers = fake.paints.filter((p) => p.id === 'Shape').slice(0, ELITE_MARKERS);
  spawnElite(world, 'ghoul', { x: 100, y: 20 });
  spawnEnemy(world, 'bat', -100, 0);
  addChest(world, 30, 40);
  view.render(world);
  expect(markers.filter((m) => m.visible)).toHaveLength(1);
  expect(markers[0]?.translate).toEqual([100, 20]);
  expect(markers[0]?.scale).toBeCloseTo(24 / 10);
  const [ghoul] = shown('enemy.ghoul');
  expect(ghoul?.matrix?.e11).toBeCloseTo(1.5);
  expect(shown('enemy.bat')[0]?.matrix?.e11).toBeCloseTo(1);
  expect(shown('pickup.chest').map((p) => [p.matrix?.e13, p.matrix?.e23])).toEqual([[30, 40]]);
  world.enemies.clear();
  view.render(world);
  expect(markers.filter((m) => m.visible)).toHaveLength(0);
  expect(fake.paints).toHaveLength(created);
});

it('switches the books and the aura to the evolved art once evolved, from prewarmed pools (#15)', () => {
  const { view, world, byId, paints } = setup();
  const created = paints.length;
  const shown = (id: string) => byId(id).filter((p) => p.visible);
  const { books, garlic } = world.weaponVisuals;
  books.count = 2;
  garlic.shown = true;
  view.render(world);
  expect(shown('weapon.kingBible')).toHaveLength(2);
  expect(shown('weapon.garlic')).toHaveLength(1);
  books.evolved = true;
  garlic.evolved = true;
  view.render(world);
  expect(shown('weapon.kingBible')).toHaveLength(0);
  expect(shown('weapon.garlic')).toHaveLength(0);
  expect(shown('weapon.unholyVespers')).toHaveLength(2);
  expect(shown('weapon.soulEater')).toHaveLength(1);
  expect(paints).toHaveLength(created);
});
