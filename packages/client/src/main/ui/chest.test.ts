// @vitest-environment happy-dom
import type { ChestReward } from '@vs/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { CHEST_CLOSE_MS, mount } from './chest';

const REWARDS: ChestReward[] = [
  { kind: 'evolve', fromWeaponId: 'whip', intoWeaponId: 'bloodyTear' },
  { kind: 'levelUp', itemKind: 'passive', id: 'hollowHeart', newLevel: 2 },
  { kind: 'heal', amount: 30 },
];

const key = (code: string, repeat = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, cancelable: true }));

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup() {
  vi.useFakeTimers();
  document.body.replaceChildren();
  const onClose = vi.fn();
  const screen = mount(document.body, {
    rewards: REWARDS,
    iconUrl: (id) => (id === 'icon.weapon.bloodyTear' ? '/icons/weapon-bloody-tear.png' : null),
    onClose,
  });
  return { onClose, screen };
}

it('titles the panel "Treasure" and lists each reward with its icon, name and tag, as text', () => {
  const { screen } = setup();
  expect(document.querySelector('h2')?.textContent).toBe('Treasure');
  const rows = [...document.querySelectorAll('li.card')];
  expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['evolve', 'levelUp', 'heal']);
  expect(rows.map((r) => r.querySelector('.card-name')?.textContent)).toEqual([
    'Whip',
    'Hollow Heart',
    'Heal',
  ]);
  expect(rows.map((r) => r.querySelector('.card-tag')?.textContent)).toEqual([
    'EVOLVED: Bloody Tear',
    'Lv 1 → 2',
    '+30 HP',
  ]);
  expect(rows[0]?.querySelector('img')?.getAttribute('src')).toBe('/icons/weapon-bloody-tear.png');
  expect(rows[1]?.querySelector('.icon.missing')).not.toBeNull();
  expect(rows[2]?.querySelector('.icon.heal')?.textContent).toBe('♥');
  screen.unmount();
});

it('closes once on Enter, ignoring key repeats, and the timer does not close it again', () => {
  const { onClose, screen } = setup();
  key('Enter', true);
  expect(onClose).not.toHaveBeenCalled();
  key('Enter');
  key('Enter');
  vi.advanceTimersByTime(CHEST_CLOSE_MS);
  expect(onClose).toHaveBeenCalledOnce();
  screen.unmount();
});

it('closes by itself after 3 s, and never after unmount', () => {
  const first = setup();
  vi.advanceTimersByTime(CHEST_CLOSE_MS - 1);
  expect(first.onClose).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(first.onClose).toHaveBeenCalledOnce();
  first.screen.unmount();
  const second = setup();
  second.screen.unmount();
  vi.advanceTimersByTime(CHEST_CLOSE_MS);
  key('Enter');
  expect(second.onClose).not.toHaveBeenCalled();
  expect(document.querySelector('.chest')).toBeNull();
});

it('#149: closes once on a tap anywhere on the overlay', () => {
  const { onClose, screen } = setup();
  document.querySelector<HTMLElement>('li.card')?.click();
  document.querySelector<HTMLElement>('.chest')?.click();
  key('Enter');
  expect(onClose).toHaveBeenCalledOnce();
  screen.unmount();
});
