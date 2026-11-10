// #171, ADR 0025: the safety fact. The cover fit is presentation only: laying the view out for a cropped visible
// area changes nothing the simulation reads. `camera.viewRect` stays the full 1280×720 view and the same seed gives
// the same spawns, positions and kills, whether the HUD is laid out for the full view, a phone or a 4:3 tablet (cropped to the floor width).
import { expect, it } from 'vitest';
import type { Axis } from '../../protocol/worker-messages';
import { FULL_VIEW, VIEW_HEIGHT, VIEW_WIDTH, type VisibleRect } from '../constants';
import { createSession } from './session';
import { stepAnsweringLevelUps } from './test-level-ups';
import { createGameView } from './view';
import { fakeGameView } from './view-test-helpers';

const PHONE: VisibleRect = { x: 0, y: 64.5, width: 1280, height: 591 };
const TABLET: VisibleRect = { x: 30, y: 0, width: 1220, height: 720 };

/** Thirty seconds of the same scripted input in a real session, rendered every step under `visible`. */
function run(visible: VisibleRect | null, relayoutEvery = 0) {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  if (visible) view.layout(visible);
  const session = createSession(view, () => undefined);
  const world = session.start(4242, 'warden');
  const paintsAfterStart = fake.paints.length;
  const dirs: [Axis, Axis][] = [
    [1, 0],
    [0, 1],
    [-1, -1],
    [0, 0],
  ];
  let step = 0;
  stepAnsweringLevelUps(world, 1800, () => {
    const [dx, dy] = dirs[Math.floor(step / 240) % dirs.length] ?? [0, 0];
    world.input = { dx, dy };
    // A switch of input mode in the middle of the run: the layout flips between the letterbox and the crop.
    if (visible && relayoutEvery > 0 && step % relayoutEvery === 0)
      view.layout(Math.floor(step / relayoutEvery) % 2 === 0 ? FULL_VIEW : visible);
    step++;
    session.render();
  });
  const rect = { ...world.camera.viewRect(0) };
  return {
    world,
    rect,
    camera: [world.camera.x, world.camera.y],
    paintsCreatedByRun: fake.paints.length - paintsAfterStart,
    poolsCreated: view.pools.map((pool) => pool.created),
    worldTranslate: fake.translations.at(-1),
  };
}

it('keeps the simulation view at 1280×720 and the run identical under the cover fit', () => {
  const base = run(null);
  expect(base.world.enemies.count).toBeGreaterThan(0);
  for (const visible of [PHONE, TABLET]) {
    for (const relayoutEvery of [0, 97]) {
      const cover = run(visible, relayoutEvery);
      // The spawner's and the culling's rectangle: the full view around the camera.
      expect(cover.rect.right - cover.rect.left).toBe(VIEW_WIDTH);
      expect(cover.rect.bottom - cover.rect.top).toBe(VIEW_HEIGHT);
      expect(cover.rect).toEqual(base.rect);
      expect(cover.camera).toEqual(base.camera);
      // The same world: enemies, their positions and types, kills, XP, time.
      expect(cover.world.enemies.count).toBe(base.world.enemies.count);
      expect(cover.world.enemies.cols.x).toEqual(base.world.enemies.cols.x);
      expect(cover.world.enemies.cols.y).toEqual(base.world.enemies.cols.y);
      expect(cover.world.enemies.cols.type).toEqual(base.world.enemies.cols.type);
      expect(cover.world.stats).toEqual(base.world.stats);
      expect(cover.world.player.xp).toBe(base.world.player.xp);
      expect([cover.world.player.x, cover.world.player.y]).toEqual([
        base.world.player.x,
        base.world.player.y,
      ]);
      // The world layer still centres the camera in the full view; only the root scene is moved by the crop.
      expect(cover.worldTranslate).toEqual(base.worldTranslate);
      // ADR 0003: no Paint is created by a layout, during the run or by a switch.
      expect(cover.paintsCreatedByRun).toBe(base.paintsCreatedByRun);
      expect(cover.poolsCreated).toEqual(base.poolsCreated);
    }
  }
});
