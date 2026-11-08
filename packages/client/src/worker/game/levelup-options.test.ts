import { createRng, LEVELUP_HEAL, WEAPONS, type WeaponDef, type WeaponId } from '@vs/shared';
import { expect, it } from 'vitest';
import { buildLevelUpOptions, type LevelUpOptionsWorld } from './levelup-options';

const owned = (def: WeaponDef, level: number) => ({ def, level });
const at = (seed: number, weapons: LevelUpOptionsWorld['weapons']): LevelUpOptionsWorld => ({
  weapons,
  levelUpRng: createRng(seed).fork('levelup'),
});
/** Six fake weapon defs (only two real ones exist before #13). */
const FAKES: WeaponDef[] = Array.from({ length: 7 }, (_, i) => ({
  ...WEAPONS.whip,
  id: `fake${String(i)}` as WeaponId,
  name: `Fake ${String(i)}`,
}));
const fake = (i: number): WeaponDef => FAKES[i] ?? WEAPONS.whip;

it('offers at most 3 distinct options, every candidate eventually, and never gold', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 200; seed++) {
    const options = buildLevelUpOptions(at(seed, [owned(fake(0), 1)]), FAKES);
    expect(options.length).toBe(3);
    const keys = options.map((o) => `${o.kind}:${o.kind === 'heal' ? '' : o.weaponId}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) seen.add(k);
    for (const o of options) expect(['newWeapon', 'upgradeWeapon', 'heal']).toContain(o.kind);
  }
  // The upgrade of fake0 plus the six fakes not owned.
  expect(seen.size).toBe(7);
});

it('describes a new weapon by its description and an upgrade by the next level text', () => {
  const options = buildLevelUpOptions(at(1, [owned(WEAPONS.whip, 3)]));
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
  const options = buildLevelUpOptions(at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 7)]));
  expect(options).toEqual([
    expect.objectContaining({ kind: 'upgradeWeapon', weaponId: 'magicWand', toLevel: 8 }),
  ]);
});

it('offers no new weapon when all 6 slots are full', () => {
  const six = FAKES.slice(0, 6).map((def) => owned(def, 8));
  six[0] = owned(fake(0), 2);
  for (let seed = 0; seed < 50; seed++) {
    const options = buildLevelUpOptions(at(seed, six), FAKES);
    expect(options.map((o) => o.kind)).toEqual(['upgradeWeapon']);
  }
});

it('offers a single heal when nothing is left', () => {
  const options = buildLevelUpOptions(at(1, [owned(WEAPONS.whip, 8), owned(WEAPONS.magicWand, 8)]));
  expect(options).toEqual([
    expect.objectContaining({ kind: 'heal', amount: LEVELUP_HEAL, iconId: null }),
  ]);
});

it('is deterministic for a given seed', () => {
  const one = at(1, [owned(fake(0), 1)]);
  const two = at(1, [owned(fake(0), 1)]);
  for (let i = 0; i < 20; i++)
    expect(buildLevelUpOptions(two, FAKES)).toEqual(buildLevelUpOptions(one, FAKES));
});
