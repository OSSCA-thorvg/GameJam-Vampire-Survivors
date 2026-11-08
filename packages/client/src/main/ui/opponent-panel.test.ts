// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { PlayerInfo, PlayerStatus } from '@vs/shared';
import { mount, shownHp, shownInt } from './opponent-panel';

const p = (id: string, nickname: string, connected = true): PlayerInfo => ({
  id,
  nickname,
  ready: true,
  host: false,
  connected,
});
const st = (over: Partial<PlayerStatus> = {}): PlayerStatus => ({
  hp: 80,
  maxHp: 100,
  level: 5,
  kills: 42,
  alive: true,
  elapsedMs: 1000,
  ...over,
});

function setup(players = [p('me', 'Me'), p('b', 'Bob'), p('c', 'Cleo')]) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const frames: (() => void)[] = [];
  const panel = mount(root, { players, selfId: 'me', raf: (cb) => frames.push(cb) });
  const rows = () => [...root.querySelectorAll<HTMLLIElement>('.opponent')];
  const row = (name: string) =>
    rows().find((r) => r.querySelector('.opponent-name')?.textContent === name);
  return { root, panel, frames, rows, row };
}

it('renders one row per opponent from roomState, without this player (#20)', () => {
  const t = setup();
  expect(t.rows().map((r) => r.querySelector('.opponent-name')?.textContent)).toEqual([
    'Bob',
    'Cleo',
  ]);
  expect(t.root.querySelector('aside')?.getAttribute('aria-label')).toBe('Opponents');
  t.panel.setPlayers([p('me', 'Me'), p('c', 'Cleo')]);
  expect(t.rows()).toHaveLength(1);
});

it('updates on peerStatus at most once per animation frame, with the latest status', () => {
  const t = setup();
  t.panel.status('b', st({ kills: 1 }));
  t.panel.status('b', st({ kills: 2, hp: 25, level: 7 }));
  t.panel.status('c', st({ kills: 9 }));
  expect(t.frames).toHaveLength(1);
  expect(t.row('Bob')?.querySelector('.opponent-kills')?.textContent).toBe('Kills 0');
  t.frames.shift()?.();
  const bob = t.row('Bob');
  expect(bob?.querySelector('.opponent-kills')?.textContent).toBe('Kills 2');
  expect(bob?.querySelector('.opponent-level')?.textContent).toBe('Lv 7');
  expect(bob?.querySelector<HTMLElement>('.hp-fill')?.style.width).toBe('25%');
  expect(bob?.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe('25 / 100');
  expect(t.row('Cleo')?.querySelector('.opponent-kills')?.textContent).toBe('Kills 9');
  t.panel.status('nobody', st());
  expect(t.frames).toHaveLength(0);
});

it('shows each badge: away, disconnected, dead, forfeited', () => {
  const t = setup();
  const badge = (name: string) => t.row(name)?.getAttribute('data-badge');
  t.panel.away('b', true);
  expect(badge('Bob')).toBe('away');
  expect(t.row('Bob')?.querySelector('.badge')?.textContent).toBe('away');
  t.panel.away('b', false);
  expect(badge('Bob')).toBe('');
  expect(t.row('Bob')?.querySelector<HTMLElement>('.badge')?.hidden).toBe(true);
  t.panel.setPlayers([p('me', 'Me'), p('b', 'Bob', false), p('c', 'Cleo')]);
  expect(badge('Bob')).toBe('disconnected');
  t.panel.eliminated('c', 'died');
  expect(badge('Cleo')).toBe('dead');
  expect(t.row('Cleo')?.getAttribute('data-out')).toBe('true');
  expect(t.row('Cleo')?.querySelector<HTMLElement>('.hp-fill')?.style.width).toBe('0%');
  t.panel.setPlayers([p('me', 'Me'), p('b', 'Bob'), p('c', 'Cleo')]);
  t.panel.eliminated('b', 'afk');
  expect(badge('Bob')).toBe('forfeited');
  // The first elimination stands.
  t.panel.eliminated('b', 'disconnected');
  expect(badge('Bob')).toBe('forfeited');
});

it('renders a markup nickname as text and clamps hostile numbers', () => {
  const t = setup([p('me', 'Me'), p('x', '<img src=x onerror=alert(1)>')]);
  expect(t.root.querySelector('img')).toBeNull();
  expect(t.rows()[0]?.querySelector('.opponent-name')?.textContent).toBe(
    '<img src=x onerror=alert(1)>',
  );
  t.panel.status('x', st({ hp: 500, maxHp: 100, kills: 1e12, level: -3 }));
  t.frames.shift()?.();
  const row = t.rows()[0];
  expect(row?.querySelector<HTMLElement>('.hp-fill')?.style.width).toBe('100%');
  expect(row?.querySelector('.opponent-kills')?.textContent).toBe('Kills 999999');
  expect(row?.querySelector('.opponent-level')?.textContent).toBe('Lv 0');
  expect(shownHp({ hp: Number.NaN, maxHp: Number.POSITIVE_INFINITY })).toEqual({ hp: 0, maxHp: 0 });
  expect(shownHp({ hp: 0.2, maxHp: 120 })).toEqual({ hp: 1, maxHp: 120 });
  expect(shownInt(-1)).toBe(0);
  t.panel.unmount();
  expect(t.root.children).toHaveLength(0);
});
