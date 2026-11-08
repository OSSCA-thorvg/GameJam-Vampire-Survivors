// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { LevelUpOption } from '../../protocol/worker-messages';
import { mount } from './levelup';

const OPTIONS: LevelUpOption[] = [
  {
    kind: 'newWeapon',
    weaponId: 'magicWand',
    name: 'Magic Wand',
    description: 'Fires at the nearest enemy.',
    iconId: 'icon.weapon.magicWand',
  },
  {
    kind: 'upgradeWeapon',
    weaponId: 'whip',
    name: 'Whip',
    toLevel: 2,
    description: 'Fires one more projectile.',
    iconId: 'icon.weapon.whip',
  },
  { kind: 'heal', amount: 30, description: 'Recover 30 HP.', iconId: null },
];

const key = (code: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));

const mounted: { unmount(): void }[] = [];

function setup(options = OPTIONS) {
  document.body.replaceChildren();
  const onChoose = vi.fn();
  const screen = mount(document.body, {
    level: 4,
    options,
    iconUrl: (id) => (id === 'icon.weapon.whip' ? '/icons/weapon-whip.png' : null),
    onChoose,
  });
  mounted.push(screen);
  return {
    onChoose,
    screen,
    cards: [...document.querySelectorAll<HTMLButtonElement>('button.card')],
  };
}

afterEach(() => {
  for (const screen of mounted.splice(0)) screen.unmount();
  document.body.replaceChildren();
});

it('shows a "Level up" dialog titled "Level n" with one card per option, the first focused', () => {
  const { cards } = setup();
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-label')).toBe('Level up');
  expect(dialog?.querySelector('h2')?.textContent).toBe('Level 4');
  expect(cards.map((c) => c.querySelector('.card-name')?.textContent)).toEqual([
    'Magic Wand',
    'Whip',
    'Heal',
  ]);
  expect(cards.map((c) => c.querySelector('.card-tag')?.textContent)).toEqual([
    'NEW',
    'Lv 1 → 2',
    '+30 HP',
  ]);
  expect(cards[1]?.querySelector('.card-desc')?.textContent).toBe('Fires one more projectile.');
  expect(document.activeElement).toBe(cards[0]);
  // An icon with art is an <img alt="">; one without is a magenta box.
  const img = cards[1]?.querySelector('img');
  expect(img?.getAttribute('src')).toBe('/icons/weapon-whip.png');
  expect(img?.getAttribute('alt')).toBe('');
  expect(cards[0]?.querySelector('.icon.missing')).not.toBeNull();
  expect(cards[2]?.querySelector('.icon.heal')).not.toBeNull();
});

it.each([
  ['Digit1', 0],
  ['Digit2', 1],
  ['Digit3', 2],
  ['Numpad2', 1],
])('%s chooses option %i directly', (code, index) => {
  const { onChoose } = setup();
  key(code);
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(index);
});

it('moves the focus with Down/S and Up/W, and Enter chooses the focused card once', () => {
  const { onChoose, cards } = setup();
  key('ArrowDown');
  key('KeyS');
  expect(document.activeElement).toBe(cards[2]);
  key('KeyW');
  expect(document.activeElement).toBe(cards[1]);
  key('Enter');
  key('Enter');
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(1);
});

it('ignores Escape and digits beyond the options', () => {
  const { onChoose } = setup(OPTIONS.slice(2));
  key('Escape');
  key('Digit2');
  key('Digit3');
  expect(onChoose).not.toHaveBeenCalled();
  key('Digit1');
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(0);
});

it('chooses on click, and unmount removes the dialog and every listener', () => {
  const first = setup();
  first.cards[2]?.click();
  expect(first.onChoose).toHaveBeenCalledExactlyOnceWith(2);
  const { onChoose, screen } = setup();
  screen.unmount();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  key('Digit1');
  key('Enter');
  expect(onChoose).not.toHaveBeenCalled();
});

it('shows passive cards like weapon cards (#12): NEW or Lv x → y, the icon and the description, and 4 chooses a 4th card', () => {
  const passives: LevelUpOption[] = [
    ...OPTIONS.slice(0, 2),
    {
      kind: 'newPassive',
      passiveId: 'spinach',
      name: 'Spinach',
      description: 'Damage up by 10%.',
      iconId: 'icon.passive.spinach',
    },
    {
      kind: 'upgradePassive',
      passiveId: 'clover',
      name: 'Clover',
      toLevel: 3,
      description: 'Luck up by 10%.',
      iconId: 'icon.passive.clover',
    },
  ];
  const { cards, onChoose } = setup(passives);
  expect(cards.map((c) => c.getAttribute('data-kind'))).toEqual([
    'newWeapon',
    'upgradeWeapon',
    'newPassive',
    'upgradePassive',
  ]);
  expect(cards.slice(2).map((c) => c.querySelector('.card-tag')?.textContent)).toEqual([
    'NEW',
    'Lv 2 → 3',
  ]);
  expect(cards[2]?.querySelector('.card-name')?.textContent).toBe('Spinach');
  expect(cards[3]?.querySelector('.card-desc')?.textContent).toBe('Luck up by 10%.');
  expect(cards[2]?.querySelector('.icon.missing')).not.toBeNull();
  key('Digit4');
  expect(onChoose).toHaveBeenCalledWith(3);
});
