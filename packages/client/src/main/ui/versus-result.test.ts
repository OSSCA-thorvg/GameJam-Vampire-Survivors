// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { mount, UNOFFICIAL_NOTE, type VersusResultProps } from './versus-result';

const ranking = [
  { playerId: 'b', nickname: '<b>Bob</b>', alive: true, kills: 30 },
  { playerId: 'a', nickname: 'Alice', alive: false, kills: 12 },
];

function setup(over: Partial<VersusResultProps> = {}) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const onRematch = vi.fn();
  const onLeave = vi.fn();
  const screen = mount(root, {
    result: { kind: 'official', headline: 'Lose', ranking, out: { a: 'afk' }, note: null },
    selfId: 'a',
    canRematch: true,
    onRematch,
    onLeave,
    ...over,
  });
  const button = (name: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent === name);
  return { root, screen, onRematch, onLeave, button };
}

it('shows the headline and the ranking as text, Rematch focused (#20)', () => {
  const t = setup();
  expect(t.root.querySelector('h2')?.textContent).toBe('Lose');
  const rows = [...t.root.querySelectorAll('tbody tr')].map((r) =>
    [...r.querySelectorAll('td')].map((c) => c.textContent),
  );
  expect(rows).toEqual([
    ['<b>Bob</b>', 'alive', '30'],
    ['Alice (you)', 'forfeited', '12'],
  ]);
  expect(t.root.querySelector('tbody b')).toBeNull();
  expect(document.activeElement).toBe(t.button('Rematch'));
  t.button('Rematch')?.click();
  t.button('Leave')?.click();
  expect(t.onRematch).toHaveBeenCalledOnce();
  expect(t.onLeave).toHaveBeenCalledOnce();
});

it('shows Win, Draw and a deadline note', () => {
  const t = setup({
    result: { kind: 'official', headline: 'Draw', ranking, out: {}, note: 'Time ran out' },
  });
  expect(t.root.querySelector('h2')?.textContent).toBe('Draw');
  expect(t.root.querySelector('.note')?.textContent).toBe('Time ran out');
  t.screen.update({
    result: { kind: 'official', headline: 'Win', ranking, out: {}, note: null },
    selfId: 'b',
    canRematch: true,
    onRematch: t.onRematch,
    onLeave: t.onLeave,
  });
  expect(t.root.querySelector('h2')?.textContent).toBe('Win');
  expect(t.root.querySelector('.note')).toBeNull();
  // Out without a known reason.
  expect(t.root.querySelectorAll('tbody td')[4]?.textContent).toBe('out');
});

it('an unofficial result shows the local run, the notice and only Leave', () => {
  const t = setup({
    canRematch: false,
    result: {
      kind: 'unofficial',
      stats: {
        timeSec: 125,
        kills: 8,
        level: 3,
        cleared: false,
        characterId: 'warden',
        weapons: [],
        passives: [],
      },
    },
  });
  expect(t.root.querySelector('h2')?.textContent).toBe('Unofficial result');
  expect(t.root.querySelector('.notice')?.textContent).toBe(UNOFFICIAL_NOTE);
  expect(t.root.querySelector('[data-stat="time"]')?.textContent).toBe('02:05');
  expect(t.button('Rematch')?.hidden).toBe(true);
  t.button('Rematch')?.click();
  expect(t.onRematch).not.toHaveBeenCalled();
  t.screen.unmount();
  expect(t.root.children).toHaveLength(0);
});
