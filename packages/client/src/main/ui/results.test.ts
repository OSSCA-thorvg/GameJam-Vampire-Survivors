// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import { mount } from './results';

const SUMMARY: RunSummary = {
  timeSec: 912.4,
  kills: 1234,
  level: 31,
  cleared: true,
  characterId: 'ember',
  weapons: [
    { id: 'bloodyTear', level: 8, damage: 45210.6 },
    { id: 'magicWand', level: 3, damage: 1200 },
  ],
  passives: [{ id: 'spinach', level: 2 }],
};

afterEach(() => {
  document.body.replaceChildren();
});

const text = (selector: string): string[] =>
  Array.from(document.querySelectorAll(selector), (el) => el.textContent);

it('shows "Stage cleared" with time, kills, level, character, weapons by damage and passives', () => {
  mount(document.body, { stats: SUMMARY, onRetry: vi.fn(), onTitle: vi.fn() });
  expect(text('h2')).toEqual(['Stage cleared']);
  expect(text('[data-stat="time"]')).toEqual(['15:12']);
  expect(text('[data-stat="kills"]')).toEqual(['1234']);
  expect(text('[data-stat="level"]')).toEqual(['31']);
  expect(text('[data-stat="character"]')).toEqual(['Ember']);
  expect(text('[data-list="weapons"] dt')).toEqual(['Bloody Tear Lv 8', 'Magic Wand Lv 3']);
  expect(text('[data-list="weapons"] dd')).toEqual(['45211 dmg', '1200 dmg']);
  expect(text('[data-list="passives"] dt')).toEqual(['Spinach']);
  expect(text('[data-list="passives"] dd')).toEqual(['Lv 2']);
});

it('shows "Game over" for a run that ended before the limit, and updates in place', () => {
  const screen = mount(document.body, {
    stats: { ...SUMMARY, cleared: false, timeSec: 75.4, passives: [] },
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(text('h2')).toEqual(['Game over']);
  expect(text('[data-stat="time"]')).toEqual(['01:15']);
  expect(document.querySelector<HTMLElement>('[data-list="passives"]')?.parentElement?.hidden).toBe(
    true,
  );
  screen.update({ stats: SUMMARY, onRetry: vi.fn(), onTitle: vi.fn() });
  expect(text('h2')).toEqual(['Stage cleared']);
  expect(document.querySelectorAll('h2')).toHaveLength(1);
});

it('shows unknown ids as text, never as markup', () => {
  mount(document.body, {
    stats: {
      ...SUMMARY,
      characterId: '<b>x</b>',
      weapons: [{ id: '<i>w</i>', level: 1, damage: 1 }],
    },
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(text('[data-stat="character"]')).toEqual(['<b>x</b>']);
  expect(document.querySelector('b, i')).toBeNull();
});
