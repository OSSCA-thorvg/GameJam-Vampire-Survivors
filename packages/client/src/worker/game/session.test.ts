import { expect, it, vi } from 'vitest';
import { createSession } from './session';
import { createGameView } from './view';
import { stepAnsweringLevelUps } from './test-level-ups';
import { fakeGameView } from './view-test-helpers';

it('reuses every pooled paint: five runs, each played until the crowd arrives, create none', () => {
  const fake = fakeGameView();
  const view = createGameView(fake.options);
  const session = createSession(view, () => undefined);
  const created = () => view.pools.map((pool) => pool.created);
  const atBoot = created();
  const perRun: number[][] = [];
  for (let run = 0; run < 5; run++) {
    const world = session.start(1000 + run, 'warden');
    perRun.push(created());
    // Ten seconds: the minute-0 crowd spawns (15 and more bats) and binds paints; gems and level-ups too (#11).
    stepAnsweringLevelUps(world, 600, () => {
      session.render();
    });
    expect(world.enemies.count).toBeGreaterThanOrEqual(15);
  }
  session.end();
  expect(perRun).toEqual(Array.from({ length: 5 }, () => atBoot));
  expect(created()).toEqual(atBoot);
  expect(fake.paints.filter((p) => p.visible)).toEqual([]);
});

it('starts each run fresh and clears the previous enemies', () => {
  const session = createSession(createGameView(fakeGameView().options), () => undefined);
  const first = session.start(1, 'warden');
  for (let i = 0; i < 120; i++) first.step(1 / 60);
  first.player.hp = 3;
  expect(first.enemies.count).toBeGreaterThan(0);
  const second = session.start(2, 'warden');
  expect(first.enemies.count).toBe(0);
  expect(second).not.toBe(first);
  expect(second.player.hp).toBe(120); // Warden's full HP (#14)
  expect(second.time).toBe(0);
  session.end();
  expect(session.world).toBeNull();
});

it('reports the game over through the callback it was created with', () => {
  const onGameOver = vi.fn();
  const session = createSession(createGameView(fakeGameView().options), onGameOver);
  const world = session.start(1, 'warden');
  world.player.hp = 0.5;
  for (let i = 0; i < 60 * 60 && world.state === 'running'; i++) world.step(1 / 60);
  expect(world.state).toBe('dead');
  expect(onGameOver).toHaveBeenCalledTimes(1);
});
