import { ELITE, ENEMY_LIST, VIEW_QUANT, type PlayerView } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { createOpponentFeed } from './opponent-feed';
import { createOpponentView, OPPONENT_RENDER_DELAY_MS } from './opponent-view';
import { fakeGameView } from './view-test-helpers';

function setup() {
  const fake = fakeGameView();
  const { TVG, library, layers } = fake.options;
  const view = createOpponentView({ TVG, library, layers, scale: () => 1 });
  const feed = createOpponentFeed();
  const shown = (id: string) => fake.paints.filter((p) => p.id === id && p.visible);
  return { ...fake, view, feed, shown };
}

const baseView = (over: Partial<PlayerView> = {}): PlayerView => ({
  t: 1000,
  x: 100,
  y: -50,
  f: 0,
  c: 0,
  h: 1000,
  e: [],
  g: [],
  p: [],
  ...over,
});

/** `n` triples of `kind` spread over the view. */
const triples = (n: number, kind: (i: number) => number): number[] =>
  Array.from({ length: n }, (_, i) => [kind(i), (i % 90) - 45, Math.floor(i / 90) - 2]).flat();

describe('createOpponentView', () => {
  it('shows only the ground at (0, 0) before the first view', () => {
    const { view, feed, translations, shown } = setup();
    view.render(feed, 5000);
    expect(translations.at(-1)).toEqual([640, 360]);
    expect(shown('stage.ground')).toHaveLength(117);
    expect(shown('player.warden')).toHaveLength(0);
    expect(view.enemiesShown).toBe(0);
  });

  it('draws enemies, gems, pickups, the sprite and HP bar at their positions from a known view', () => {
    const { view, feed, paints, shown, translations } = setup();
    const batKind = ENEMY_LIST.indexOf('bat') * 2;
    feed.push(
      baseView({
        f: 1,
        c: 1,
        h: 500,
        e: [batKind, 10, -5, batKind + 1, -20, 0],
        g: [0, 3, 3],
        p: [0, -4, 4],
      }),
      1000,
    );
    view.render(feed, 1000 + OPPONENT_RENDER_DELAY_MS + 50);
    expect(translations.at(-1)).toEqual([640 - 100, 360 + 50]);
    const bats = shown('enemy.bat').sort((a, b) => (b.matrix?.e13 ?? 0) - (a.matrix?.e13 ?? 0));
    expect(bats).toHaveLength(2);
    expect(bats[0]?.matrix?.e13).toBe(100 + 10 * VIEW_QUANT);
    expect(bats[0]?.matrix?.e23).toBe(-50 - 5 * VIEW_QUANT);
    // To the player's right: mirrored, as it walks left towards them.
    expect(bats[0]?.matrix?.e11).toBe(-1);
    // The elite at ELITE.scale, facing right.
    expect(bats[1]?.matrix).toMatchObject({ e11: ELITE.scale, e13: 100 - 20 * VIEW_QUANT });
    expect(shown('gem.blue')[0]?.matrix?.e13).toBe(100 + 12);
    expect(shown('pickup.floorChicken')).toHaveLength(1);
    const ember = shown('player.ember');
    expect(ember).toHaveLength(1);
    expect(ember[0]?.matrix).toMatchObject({ e11: -1, e13: 100, e23: -50 });
    expect(shown('ui.hpBar')).toHaveLength(1);
    const hpFill = paints.filter((p) => p.id === 'Shape').at(-1);
    expect(hpFill?.matrix?.e11).toBe(0.5);
    expect([view.enemiesShown, view.gemsShown, view.pickupsShown]).toEqual([2, 1, 1]);
  });

  it('interpolates the player halfway between the two views that bracket the render time', () => {
    const { view, feed } = setup();
    feed.push(baseView({ x: 0, y: 0 }), 1000);
    feed.push(baseView({ x: 40, y: -20 }), 1100);
    view.render(feed, 1050 + OPPONENT_RENDER_DELAY_MS);
    expect(view.cameraX).toBeCloseTo(20, 9);
    expect(view.cameraY).toBeCloseTo(-10, 9);
    // Past the newest: held there.
    view.render(feed, 2000);
    expect(view.cameraX).toBe(40);
    // Before the oldest: held at the oldest.
    view.render(feed, 900);
    expect(view.cameraX).toBe(0);
  });

  it('releases what is no longer in the view and skips unknown kinds', () => {
    const { view, feed, shown } = setup();
    feed.push(baseView({ e: triples(30, () => 0), g: triples(10, () => 0) }), 1000);
    view.render(feed, 2000);
    expect(shown('enemy.bat')).toHaveLength(30);
    feed.push(baseView({ e: [62, 0, 0, 0, 1, 1], g: [9, 0, 0], p: [40, 0, 0] }), 1100);
    view.render(feed, 2100);
    expect(shown('enemy.bat')).toHaveLength(1);
    expect(shown('gem.blue')).toHaveLength(0);
    expect([view.enemiesShown, view.gemsShown, view.pickupsShown]).toEqual([1, 0, 0]);
    view.clear();
    expect(shown('enemy.bat')).toHaveLength(0);
    expect(shown('player.warden')).toHaveLength(0);
  });

  it('holds its caps and creates no paint over 1000 renders with 300 triples per list', () => {
    const { view, feed, paints, shown } = setup();
    const created = view.countPaints();
    const total = paints.length;
    // Bosses (2 paints each) and every other type mixed, plus elites; gems and pickups of every kind.
    const kinds = ENEMY_LIST.length * 2;
    for (let n = 0; n < 1000; n++) {
      feed.push(
        baseView({
          x: n,
          e: triples(300, (i) => (i + n) % kinds),
          g: triples(300, (i) => (i + n) % 3),
          p: triples(300, (i) => (i + n) % 8),
        }),
        n * 100,
      );
      view.render(feed, n * 100 + 50);
      expect(view.enemiesShown).toBeLessThanOrEqual(160);
      expect(view.gemsShown).toBeLessThanOrEqual(48);
      expect(view.pickupsShown).toBeLessThanOrEqual(8);
    }
    expect(view.countPaints()).toBe(created);
    expect(paints.length).toBe(total);
    expect(shown('boss.reaper5').length).toBeLessThanOrEqual(2);
    expect(view.enemiesShown).toBe(160);
    expect(view.gemsShown).toBe(48);
    expect(view.pickupsShown).toBe(8);
  });
});
