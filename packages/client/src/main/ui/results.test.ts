// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import type { RecordBreaks } from '../records/apply';
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
  mount(document.body, { stats: SUMMARY, breaks: null, onRetry: vi.fn(), onTitle: vi.fn() });
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
    breaks: null,
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(text('h2')).toEqual(['Game over']);
  expect(text('[data-stat="time"]')).toEqual(['01:15']);
  expect(document.querySelector<HTMLElement>('[data-list="passives"]')?.parentElement?.hidden).toBe(
    true,
  );
  screen.update({ stats: SUMMARY, breaks: null, onRetry: vi.fn(), onTitle: vi.fn() });
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
    breaks: null,
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(text('[data-stat="character"]')).toEqual(['<b>x</b>']);
  expect(document.querySelector('b, i')).toBeNull();
});

const NONE: RecordBreaks = {
  timeSec: null,
  kills: null,
  level: null,
  firstClear: false,
  weapons: [],
};
const badges = () =>
  Array.from(document.querySelectorAll('.new-best:not([hidden])'), (el) => ({
    best: el.getAttribute('data-best'),
    scope: el.getAttribute('data-scope'),
    weapon: el.getAttribute('data-weapon'),
    text: el.textContent,
  }));

it('marks each broken record with a New best! badge (#143)', () => {
  mount(document.body, {
    stats: SUMMARY,
    breaks: {
      timeSec: 'overall',
      kills: 'character',
      level: 'overall',
      firstClear: true,
      weapons: ['magicWand'],
    },
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(badges()).toEqual([
    { best: 'clear', scope: null, weapon: null, text: 'First clear!' },
    { best: 'time', scope: 'overall', weapon: null, text: 'New best! (all characters)' },
    { best: 'kills', scope: 'character', weapon: null, text: 'New best!' },
    { best: 'level', scope: 'overall', weapon: null, text: 'New best! (all characters)' },
    { best: 'weapon', scope: null, weapon: 'magicWand', text: 'New best!' },
  ]);
  // The stat values stay readable on their own (journeys read them as text).
  expect(text('[data-stat="time"]')).toEqual(['15:12']);
  expect(text('[data-stat="kills"]')).toEqual(['1234']);
  // The badge sits after the value inside the item's dd.
  expect(document.querySelector('[data-best="time"]')?.parentElement?.tagName).toBe('DD');
  expect(text('[data-list="weapons"] dd')).toEqual(['45211 dmg', '1200 dmg New best!']);
});

it('shows no badge for null and all-null breaks', () => {
  const screen = mount(document.body, {
    stats: SUMMARY,
    breaks: null,
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(badges()).toEqual([]);
  screen.update({ stats: SUMMARY, breaks: NONE, onRetry: vi.fn(), onTitle: vi.fn() });
  expect(badges()).toEqual([]);
  screen.update({
    stats: SUMMARY,
    breaks: { ...NONE, firstClear: true },
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(badges().map((b) => b.best)).toEqual(['clear']);
});

it('sets badge text with textContent only', () => {
  mount(document.body, {
    stats: { ...SUMMARY, weapons: [{ id: '<i>w</i>', level: 1, damage: 1 }] },
    breaks: { ...NONE, weapons: ['<i>w</i>'] },
    onRetry: vi.fn(),
    onTitle: vi.fn(),
  });
  expect(document.querySelector('i')).toBeNull();
  expect(document.querySelector('[data-best="weapon"]')?.getAttribute('data-weapon')).toBe(
    '<i>w</i>',
  );
});
