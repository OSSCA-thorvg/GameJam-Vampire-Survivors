import { HIT_INVULN_SEC } from '@vs/shared';
import { expect, it } from 'vitest';
import { cleanupSystem, damageEnemy } from './combat';
import { spawnEnemy } from './enemies';
import { createGameView } from './view';
import { fakeGameView } from './view-test-helpers';
import { createWorld } from './world';

function setup() {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin();
  const world = createWorld({ seed: 1, enemyPools: view.enemyPools });
  const byId = (id: string) => fake.paints.filter((p) => p.id === id);
  return { ...fake, view, world, byId };
}

it('creates every paint once: ground, gem, enemy, projectile and effect pools, player, HP and XP bars, skull, fills and texts', () => {
  const { view, byId, paints } = setup();
  expect(byId('stage.ground')).toHaveLength(96);
  expect(byId('enemy.bat')).toHaveLength(200);
  expect(byId('enemy.ghoul')).toHaveLength(200);
  expect(byId('weapon.magicWand')).toHaveLength(300);
  for (const id of ['weapon.whip', 'fx.hit', 'fx.enemyDeath'])
    expect(byId(id), id).toHaveLength(64);
  expect(byId('fx.levelUp')).toHaveLength(2);
  expect(byId('gem.blue')).toHaveLength(200);
  expect(byId('gem.green')).toHaveLength(50);
  expect(byId('gem.red')).toHaveLength(50);
  expect(byId('ui.xpBar')).toHaveLength(1);
  expect(byId('player.warden')).toHaveLength(1);
  expect(byId('ui.hpBar')).toHaveLength(1);
  expect(byId('ui.skull')).toHaveLength(1);
  // The HP fill and the XP fill; the level, the timer and the kill counter.
  expect(byId('Shape')).toHaveLength(2);
  expect(byId('Text')).toHaveLength(3);
  expect(view.countPaints()).toBe(1294);
  expect(paints).toHaveLength(1299);
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
  const fill = byId('Shape')[0]?.matrix;
  expect(fill?.e11).toBe(0.25);
  expect(fill?.e13).toBe(100 - 19);
  expect(fill?.e23).toBe(50 + 6 + 1);
  // The frame's anchor is its centre (0.5, 0.5); the fake has no offset.
  expect(byId('ui.hpBar')[0]?.matrix?.e23).toBe(50 + 6 + 3);
  world.player.hp = -5;
  view.render(world);
  expect(byId('Shape')[0]?.matrix?.e11).toBe(0);
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
  view.begin();
  expect(shown('stage.ground')).toBe(96);
  expect(shown('player.warden')).toBe(1);
  expect(shown('ui.xpBar')).toBe(1);
  expect(shown('Shape')).toBe(2);
  expect(shown('Text')).toBe(3);
  expect(byId('Text').map((t) => t.text)).toEqual(['Lv 1', '00:00', '0']);
});

it('dims a hit enemy to 140 while it flashes, writing opacity only on change, and draws bolts and effects', () => {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  view.begin();
  const world = createWorld({
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
  damageEnemy(world, bat, 1, 1, 0, 0);
  world.weaponContext.spawnProjectile('weapon.magicWand', 10, 20, 0, 300, {
    damage: 1,
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
  const fill = () => byId('Shape')[1]?.matrix;
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
