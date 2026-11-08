import { HIT_INVULN_SEC } from '@vs/shared';
import { expect, it } from 'vitest';
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

it('creates every paint once: ground, enemy pools, player, HP bar, skull, fill and two texts', () => {
  const { view, byId, paints } = setup();
  expect(byId('stage.ground')).toHaveLength(96);
  expect(byId('enemy.bat')).toHaveLength(200);
  expect(byId('enemy.ghoul')).toHaveLength(200);
  expect(byId('player.warden')).toHaveLength(1);
  expect(byId('ui.hpBar')).toHaveLength(1);
  expect(byId('ui.skull')).toHaveLength(1);
  expect(byId('Shape')).toHaveLength(1);
  expect(byId('Text')).toHaveLength(2);
  expect(view.countPaints()).toBe(499);
  expect(paints).toHaveLength(502);
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
  const timer = byId('Text')[0];
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
  for (const id of ['stage.ground', 'player.warden', 'ui.hpBar', 'ui.skull', 'Shape', 'Text'])
    expect(shown(id), id).toBe(0);
  view.begin();
  expect(shown('stage.ground')).toBe(96);
  expect(shown('player.warden')).toBe(1);
  expect(shown('Text')).toBe(2);
  expect(byId('Text').map((t) => t.text)).toEqual(['00:00', '0']);
});
