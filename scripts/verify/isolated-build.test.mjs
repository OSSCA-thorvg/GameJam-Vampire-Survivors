import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectIsolatedBuildCard } from '../../e2e/helpers/isolated-build.ts';

const card = (kind, name) => ({ kind, name });
const choose = (cards, wantedNames = [], blockedNames = []) =>
  selectIsolatedBuildCard(cards, { wantedNames, blockedNames });

test('prefers the wanted Garlic over an eligible passive upgrade', () => {
  const hand = [card('upgradePassive', 'Bracer'), card('newWeapon', 'Garlic')];
  assert.equal(choose(hand, ['Garlic']), 1);
});

test('takes a wanted Candelabrador acquisition or upgrade', () => {
  for (const kind of ['newPassive', 'upgradePassive']) {
    const hand = [card('upgradePassive', 'Clover'), card(kind, 'Candelabrador')];
    assert.equal(choose(hand, ['Candelabrador']), 1);
  }
});

test('honors blocked names even when they are wanted or safe fallback passives', () => {
  const hand = [
    card('newWeapon', 'Garlic'),
    card('upgradePassive', 'Candelabrador'),
    card('upgradePassive', 'Bracer'),
    card('newPassive', 'Hollow Heart'),
  ];
  assert.equal(choose(hand, ['Garlic', 'Candelabrador'], ['Garlic', 'Candelabrador', 'Bracer']), 3);
});

test('prefers a safe upgrade and preserves display order between equal choices', () => {
  const hand = [
    card('newPassive', 'Clover'),
    card('newPassive', 'Spellbinder'),
    card('upgradePassive', 'Pummarola'),
    card('upgradePassive', 'Bracer'),
  ];
  assert.equal(choose(hand), 2);
  assert.equal(choose(hand.slice(0, 2)), 0);
});

test('refuses other new weapons even when named as wanted', () => {
  const hand = [card('newWeapon', 'Axe'), card('newWeapon', 'Garlic'), card('newWeapon', 'Knife')];
  assert.equal(choose(hand, ['Axe', 'Knife']), null);
});

test('returns null when no eligible card can preserve the build', () => {
  const hand = [
    card('upgradeWeapon', 'Whip'),
    card('upgradeWeapon', 'Garlic'),
    card('upgradePassive', 'Candelabrador'),
    card('newPassive', 'Spinach'),
    card('upgradePassive', 'Empty Tome'),
    card('heal', 'Heal'),
    card(null, 'Bracer'),
  ];
  assert.equal(choose(hand, ['Whip', 'Garlic', 'Spinach', 'Empty Tome']), null);
  assert.equal(choose([]), null);
});
