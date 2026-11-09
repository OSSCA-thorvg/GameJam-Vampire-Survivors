import { ENEMIES, type PassiveId, type WeaponId } from '@vs/shared';
import { expect, it } from 'vitest';
import type { LevelUpOption } from '../../../protocol/worker-messages';
import { enemyRadius } from '../enemies';
import { createLevelUpFlow } from '../level';
import { addPassive, levelUpPassive } from '../passives';
import { buildRunSummary } from '../run-stats';
import { recomputeStats } from '../stats';
import { createWorld } from '../world';
import { addWeapon, levelUpWeapon } from './owned';

interface Build {
  weapons: readonly (readonly [WeaponId, number])[];
  passives: readonly (readonly [PassiveId, number])[];
}

// The two recorded area 1.5 builds from #84. Their original browser seeds and timers were not recorded.
const buildA: Build = {
  weapons: [
    ['whip', 3],
    ['magicWand', 5],
    ['axe', 3],
    ['cross', 2],
    ['garlic', 1],
  ],
  passives: [
    ['bracer', 5],
    ['pummarola', 5],
    ['candelabrador', 5],
    ['hollowHeart', 5],
    ['emptyTome', 1],
  ],
};
const buildB: Build = {
  weapons: [
    ['whip', 7],
    ['fireWand', 7],
    ['knife', 3],
    ['magicWand', 7],
    ['garlic', 1],
  ],
  passives: [
    ['bracer', 4],
    ['emptyTome', 5],
    ['spellbinder', 5],
    ['candelabrador', 5],
    ['hollowHeart', 1],
    ['clover', 1],
  ],
};

const dt = 1 / 60;
const steps = 30 * 60;
const ring = 75;
const minimum = 3;

/** The historical chooser is used only in these controls to reproduce their sample starvation. */
function historicalChoice(cards: readonly LevelUpOption[]): number {
  const blocked = new Set(['Candelabrador', 'Spinach', 'Garlic']);
  const allowed = (card: LevelUpOption): boolean => !('name' in card && blocked.has(card.name));
  for (const kind of ['upgradePassive', 'upgradeWeapon', 'newPassive']) {
    const index = cards.findIndex((card) => card.kind === kind && allowed(card));
    if (index >= 0) return index;
  }
  const index = cards.findIndex(
    (card) =>
      card.kind !== 'newWeapon' && allowed(card) && (!('name' in card) || card.name !== 'Whip'),
  );
  return index >= 0 ? index : Math.max(0, cards.findIndex(allowed));
}

function observe(seed: number, build: Build) {
  const world = createWorld({ seed, characterId: 'warden' });
  for (const [id, level] of build.weapons) {
    if (id !== 'whip') expect(addWeapon(world, id)).toBe(true);
    for (let i = 1; i < level; i++) expect(levelUpWeapon(world, id)).toBe(true);
  }
  for (const [id, level] of build.passives) {
    expect(addPassive(world, id)).toBe(true);
    for (let i = 1; i < level; i++) expect(levelUpPassive(world, id)).toBe(true);
  }
  recomputeStats(world);
  expect(world.player.stats).toMatchObject({ area: 1.5, might: 1 });
  const garlic = world.weapons.find(({ def }) => def.id === 'garlic');
  if (!garlic) throw new Error('Missing Garlic in the recorded build');

  let options: LevelUpOption[] = [];
  const flow = createLevelUpFlow({
    post: (message) => {
      options = message.options;
    },
    pause: () => undefined,
    resume: () => undefined,
  });
  const result = {
    samples: 0,
    garlicSteps: 0,
    unmatchedSteps: 0,
    ringOccupiedSteps: 0,
    outsideOtherKills: 0,
  };
  for (let step = 1; step <= steps && world.state === 'running'; step++) {
    const before = { time: world.time, ...world.damageDealt };
    const garlicBefore = world.runStats.damageBySlot[garlic.slot] ?? 0;
    world.step(dt);
    flow.afterStep(world);
    while (flow.open) flow.choose(world, historicalChoice(options));

    const garlicHit = (world.runStats.damageBySlot[garlic.slot] ?? 0) > garlicBefore;
    const hits = world.damageDealt.hits - before.hits;
    const damage = world.damageDealt.total - before.total;
    // Same isolated-delta filter as journey 15. Its final six rows are reserved for classifying knockback.
    if (step + 6 <= steps) {
      if (garlicHit) result.garlicSteps++;
      const accepted =
        hits > 0 && Math.abs(damage - hits * 5) <= 1e-6 && world.time - before.time <= 0.02;
      if (accepted) result.samples++;
      if (accepted !== garlicHit) result.unmatchedSteps++;
    }

    const { x, y } = world.player;
    const { cols, count } = world.enemies;
    for (let i = 0; i < count; i++) {
      if (Math.hypot((cols.x[i] ?? 0) - x, (cols.y[i] ?? 0) - y) - enemyRadius(cols, i) <= ring) {
        result.ringOccupiedSteps++;
        break;
      }
    }
    if (garlicHit) continue;
    for (let i = 0; i < world.events.count; i++) {
      const event = world.events.items[i];
      if (
        event?.kind === 'enemyKilled' &&
        event.enemyId &&
        Math.hypot(event.x - x, event.y - y) - ENEMIES[event.enemyId].radius > ring
      )
        result.outsideOtherKills++;
    }
  }
  expect(world.time).toBeCloseTo(30, 8);
  expect(world.player.stats).toMatchObject({ area: 1.5, might: 1 });
  expect(garlic.level).toBe(1);
  return { ...result, damageByWeapon: buildRunSummary(world).weapons };
}

it.each([1, 2, 3, 731, 999])('build A has too few Garlic damage steps with seed %i', (seed) => {
  const observed = observe(seed, buildA);
  expect(observed.unmatchedSteps).toBe(0);
  expect(observed.samples).toBeLessThanOrEqual(minimum);
  expect(observed.ringOccupiedSteps).toBeGreaterThan(0);
  expect(observed.outsideOtherKills).toBeGreaterThan(0);
});

it.each([1, 2, 3, 731, 999])(
  'build B kills outside before any enemy reaches Garlic with seed %i',
  (seed) => {
    const observed = observe(seed, buildB);
    expect(observed).toMatchObject({
      samples: 0,
      garlicSteps: 0,
      unmatchedSteps: 0,
      ringOccupiedSteps: 0,
    });
    expect(observed.damageByWeapon).toContainEqual({ id: 'garlic', level: 1, damage: 0 });
    expect(observed.outsideOtherKills).toBeGreaterThan(0);
  },
);
