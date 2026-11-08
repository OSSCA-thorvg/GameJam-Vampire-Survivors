import {
  createRng,
  LEVELUP_HEAL,
  PASSIVES,
  WEAPONS,
  type PassiveDef,
  type WeaponDef,
  type WeaponId,
} from '@vs/shared';
import { expect, it } from 'vitest';
import type { LevelUpOption } from '../../protocol/worker-messages';
import { buildLevelUpOptions, type LevelUpOptionsWorld } from './levelup-options';

const owned = <T>(def: T, level: number) => ({ def, level });
const at = (
  seed: number,
  weapons: LevelUpOptionsWorld['weapons'],
  passives: LevelUpOptionsWorld['passives'] = [],
  luck = 1,
): LevelUpOptionsWorld => ({
  weapons,
  passives,
  player: { stats: { luck } },
  levelUpRng: createRng(seed).fork('levelup'),
});
/** The weapon-only tests from #11 offer no passives: an empty passive catalog. */
const NONE: PassiveDef[] = [];
const itemKey = (o: LevelUpOption): string =>
  o.kind === 'heal' ? 'heal' : `${o.kind}:${'weaponId' in o ? o.weaponId : o.passiveId}`;
/** Six fake weapon defs (only two real ones exist before #13). */
const FAKES: WeaponDef[] = Array.from({ length: 7 }, (_, i) => ({
  ...WEAPONS.whip,
  id: `fake${String(i)}` as WeaponId,
  name: `Fake ${String(i)}`,
}));
const fake = (i: number): WeaponDef => FAKES[i] ?? WEAPONS.whip;
const passive = (i: number): PassiveDef => {
  const def = PASSIVES[i];
  if (!def) throw new Error(`no passive ${String(i)}`);
  return def;
};

it('offers at most 3 distinct options, every candidate eventually, and never gold', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const options = buildLevelUpOptions(at(seed, [owned(fake(0), 1)]), FAKES, NONE);
    expect(options.length).toBe(3);
    const keys = options.map(itemKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) seen.add(k);
    for (const o of options) expect(['newWeapon', 'upgradeWeapon', 'heal']).toContain(o.kind);
  }
  // The upgrade of fake0 plus the six fakes not owned.
  expect(seen.size).toBe(7);
});

it('describes a new weapon by its description and an upgrade by the next level text', () => {
  const options = buildLevelUpOptions(at(1, [owned(WEAPONS.whip, 3)]), undefined, NONE);
  expect(options).toHaveLength(2);
  expect(options).toContainEqual({
    kind: 'upgradeWeapon',
    weaponId: 'whip',
    name: 'Whip',
    toLevel: 4,
    description: WEAPONS.whip.levelText[2],
    iconId: 'icon.weapon.whip',
  });
  expect(options).toContainEqual({
    kind: 'newWeapon',
    weaponId: 'magicWand',
    name: WEAPONS.magicWand.name,
    description: WEAPONS.magicWand.description,
    iconId: 'icon.weapon.magicWand',
  });
});

it('never upgrades a weapon at its max level', () => {
  const options = buildLevelUpOptions(
    at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 7)]),
    undefined,
    NONE,
  );
  expect(options).toEqual([
    expect.objectContaining({ kind: 'upgradeWeapon', weaponId: 'magicWand', toLevel: 8 }),
  ]);
});

it('offers no new weapon when all 6 slots are full', () => {
  const six = FAKES.slice(0, 6).map((def) => owned(def, 8));
  six[0] = owned(fake(0), 2);
  for (let seed = 0; seed < 50; seed++) {
    const options = buildLevelUpOptions(at(seed, six), FAKES, NONE);
    expect(options.map((o) => o.kind)).toEqual(['upgradeWeapon']);
  }
});

it('offers a single heal when nothing is left', () => {
  const options = buildLevelUpOptions(
    at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)]),
    undefined,
    NONE,
  );
  expect(options).toEqual([
    expect.objectContaining({ kind: 'heal', amount: LEVELUP_HEAL, iconId: null }),
  ]);
});

it('is deterministic for a given seed', () => {
  const one = at(1, [owned(fake(0), 1)]);
  const two = at(1, [owned(fake(0), 1)]);
  for (let i = 0; i < 20; i++)
    expect(buildLevelUpOptions(two, FAKES)).toEqual(buildLevelUpOptions(one, FAKES));
  const lucky = (seed: number) => at(seed, [owned(fake(0), 1)], [owned(passive(0), 1)], 1.5);
  for (let seed = 0; seed < 20; seed++)
    expect(buildLevelUpOptions(lucky(seed), FAKES)).toEqual(
      buildLevelUpOptions(lucky(seed), FAKES),
    );
});

const allPassivesAt = (level: number, count = 6) =>
  PASSIVES.slice(0, count).map((def) => owned(def, level));

it('offers passives: NEW with the description and icon, and upgrades as Lv x → x+1 below max', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 200; seed++)
    for (const o of buildLevelUpOptions(at(seed, [owned(WEAPONS.whip, 8)], [owned(passive(6), 2)])))
      seen.add(itemKey(o));
  // Spinach's upgrade, the 7 passives not owned and the Magic Wand.
  expect(seen).toEqual(
    new Set([
      'upgradePassive:spinach',
      ...PASSIVES.filter((p) => p.id !== 'spinach').map((p) => `newPassive:${p.id}`),
      'newWeapon:magicWand',
    ]),
  );
  const spinach = passive(6);
  const options = buildLevelUpOptions(
    at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)], [owned(spinach, 2)]),
    undefined,
    [spinach],
  );
  expect(options).toEqual([
    {
      kind: 'upgradePassive',
      passiveId: 'spinach',
      name: 'Spinach',
      toLevel: 3,
      description: spinach.description,
      iconId: 'icon.passive.spinach',
    },
  ]);
  const fresh = buildLevelUpOptions(
    at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)]),
    undefined,
    [spinach],
  );
  expect(fresh).toEqual([
    {
      kind: 'newPassive',
      passiveId: 'spinach',
      name: 'Spinach',
      description: spinach.description,
      iconId: 'icon.passive.spinach',
    },
  ]);
});

it('never offers a 7th weapon or passive, nor an item at its max level', () => {
  const sixWeapons = FAKES.slice(0, 6).map((def) => owned(def, 3));
  for (let seed = 0; seed < 200; seed++) {
    const options = buildLevelUpOptions(at(seed, sixWeapons, allPassivesAt(3), 1.5), FAKES);
    for (const o of options) expect(['upgradeWeapon', 'upgradePassive']).toContain(o.kind);
  }
  for (let seed = 0; seed < 100; seed++) {
    const options = buildLevelUpOptions(
      at(seed, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)], allPassivesAt(5), 1.5),
    );
    expect(options.map((o) => o.kind)).toEqual(['heal']);
  }
  const oneLeft = allPassivesAt(5);
  oneLeft[2] = owned(passive(2), 4);
  const last = buildLevelUpOptions(
    at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)], oneLeft),
  );
  expect(last).toEqual([
    expect.objectContaining({ kind: 'upgradePassive', passiveId: 'bracer', toLevel: 5 }),
  ]);
});

it('adds a 4th card only when luck is above 1, at most half the time', () => {
  const count = (luck: number) => {
    let fours = 0;
    for (let seed = 0; seed < 400; seed++) {
      const options = buildLevelUpOptions(at(seed, [owned(WEAPONS.whip, 1)], [], luck));
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(new Set(options.map(itemKey)).size).toBe(options.length);
      if (options.length === 4) fours++;
    }
    return fours;
  };
  expect(count(1)).toBe(0);
  const low = count(1.1);
  const high = count(3);
  expect(low).toBeGreaterThan(10);
  expect(low).toBeLessThan(80);
  expect(high).toBeGreaterThan(160);
  expect(high).toBeLessThan(240);
  // With only 3 candidates (the Whip's upgrade and two passives) there is no 4th, whatever the luck.
  for (let seed = 0; seed < 50; seed++)
    expect(
      buildLevelUpOptions(
        at(seed, [owned(WEAPONS.whip, 1)], [], 3),
        [WEAPONS.whip],
        [passive(0), passive(1)],
      ),
    ).toHaveLength(3);
});

it('draws upgrades a little more often than new items (weights 1.2 and 1)', () => {
  let upgrades = 0;
  let news = 0;
  // One upgrade and one new candidate per slot: 1 of 3 picks from 2 upgrades and 2 news is the first card.
  for (let seed = 0; seed < 4000; seed++) {
    const [first] = buildLevelUpOptions(
      at(seed, [owned(WEAPONS.whip, 1)], [owned(passive(0), 1)]),
      [WEAPONS.whip, WEAPONS.magicWand],
      [passive(0), passive(1)],
    );
    if (first?.kind.startsWith('upgrade')) upgrades++;
    else news++;
  }
  // Expected share 1.2 / 2.2 ≈ 0.545 for upgrades.
  expect(upgrades / (upgrades + news)).toBeGreaterThan(0.51);
  expect(upgrades / (upgrades + news)).toBeLessThan(0.58);
});
