// @vitest-environment happy-dom
import type { PlayerInfo } from '@vs/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canStart, mount, type LobbyProps, type RoomState } from './lobby';

const alice: PlayerInfo = { id: 'a', nickname: 'Alice', ready: false, host: true, connected: true };
const bob: PlayerInfo = { id: 'b', nickname: 'Bob', ready: false, host: false, connected: true };
const roomOf = (players: PlayerInfo[], phase: RoomState['phase'] = 'lobby'): RoomState => ({
  type: 'roomState',
  code: 'K7M2P9',
  maxPlayers: 2,
  players,
  phase,
});

function setup(overrides: Partial<LobbyProps> = {}) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  let clock = 10_000;
  const props: LobbyProps = {
    room: roomOf([alice, bob]),
    selfId: 'a',
    match: null,
    connected: true,
    error: null,
    onReady: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
    onCountdownDone: vi.fn(),
    now: () => clock,
    copy: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const screen = mount(root, props);
  const button = (name: string) => {
    const b = [...root.querySelectorAll('button')].find((x) => x.textContent === name);
    if (!b) throw new Error(`missing button ${name}`);
    return b;
  };
  return {
    root,
    props,
    screen,
    button,
    tick: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    status: () => root.querySelector('.lobby .status')?.textContent,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('canStart', () => {
  const r = (a: boolean, b: boolean) =>
    roomOf([
      { ...alice, ready: a },
      { ...bob, ready: b },
    ]);
  it.each([
    [r(true, true), 'a', true],
    [r(true, false), 'a', false],
    [r(false, true), 'a', false],
    [r(true, true), 'b', false], // not the host
    [roomOf([{ ...alice, ready: true }]), 'a', false], // fewer than 2 players
    [{ ...r(true, true), phase: 'finished' as const }, 'a', false],
  ])('%j as %s → %s', (room, selfId, expected) => {
    expect(canStart(room, selfId)).toBe(expected);
  });
});

describe('lobby screen', () => {
  it('shows the code and the players with host and ready marks', () => {
    const t = setup({ room: roomOf([alice, { ...bob, ready: true }]) });
    expect(t.root.querySelector('.room-code')?.textContent).toBe('K7M2P9');
    const rows = [...t.root.querySelectorAll('.players li')];
    expect(rows.map((r) => r.textContent)).toEqual(['Alice(you)★', 'Bob✓']);
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Alice, host, not ready',
      'Bob, ready',
    ]);
  });

  it('has a keyboard hint and a touch hint (#150), each shown in its input mode by the CSS', () => {
    const t = setup();
    const hints = [...t.root.querySelectorAll('.lobby .hint')];
    expect(hints.map((p) => [p.className, p.textContent])).toEqual([
      ['hint keys-only', 'Share the code. Arrows move, Enter presses, Escape leaves.'],
      ['hint touch-only', 'Share the code. Tap Ready; the host taps Start.'],
    ]);
  });

  it('Start: visible only to the host, enabled only when everyone is ready and there are 2', () => {
    const host = setup();
    expect(host.button('Start').hidden).toBe(false);
    expect(host.button('Start').disabled).toBe(true);
    host.screen.update({ ...host.props, room: roomOf([{ ...alice, ready: true }]) });
    expect(host.button('Start').disabled).toBe(true);
    expect(host.status()).toBe('Waiting for another player…');
    host.screen.update({
      ...host.props,
      room: roomOf([
        { ...alice, ready: true },
        { ...bob, ready: true },
      ]),
    });
    expect(host.button('Start').disabled).toBe(false);
    host.button('Start').click();
    expect(host.props.onStart).toHaveBeenCalledOnce();

    const guest = setup({
      selfId: 'b',
      room: roomOf([alice, bob].map((p) => ({ ...p, ready: true }))),
    });
    expect(guest.button('Start').hidden).toBe(true);
    expect(guest.status()).toBe('Waiting for the host to start');
  });

  it('Ready toggles with the current state, and Enter presses the focused button', () => {
    const t = setup();
    expect(document.activeElement).toBe(t.button('Ready'));
    t.button('Ready').click();
    expect(t.props.onReady).toHaveBeenLastCalledWith(true);
    t.screen.update({ ...t.props, room: roomOf([{ ...alice, ready: true }, bob]) });
    expect(t.button('Not ready').getAttribute('aria-pressed')).toBe('true');
    t.button('Not ready').click();
    expect(t.props.onReady).toHaveBeenLastCalledWith(false);
  });

  it('a notAllReady error shows inline and clears on the next room update', () => {
    const t = setup();
    t.screen.update({ ...t.props, error: { code: 'notAllReady', seq: 1 } });
    expect(t.root.querySelector('.field-error')?.textContent).toBe(
      'Every player must be ready first',
    );
    t.screen.update({ ...t.props, error: { code: 'notAllReady', seq: 1 }, room: roomOf([alice]) });
    expect(t.root.querySelector('.field-error')?.textContent).toBe('');
  });

  it('outside the lobby phase Ready and Start are disabled and it waits for the reset', () => {
    const ready = [alice, bob].map((p) => ({ ...p, ready: true }));
    const t = setup({ room: roomOf(ready, 'finished') });
    expect(t.button('Not ready').disabled).toBe(true);
    expect(t.button('Start').disabled).toBe(true);
    expect(t.status()).toBe('Waiting for the room to reset');
  });

  it('runs the 3-2-1 countdown until startAt, then calls onCountdownDone once', () => {
    vi.useFakeTimers();
    const t = setup();
    const match = { type: 'matchStart' as const, seed: 5, startAt: 10_000 + 2900 };
    t.screen.update({ ...t.props, match, room: roomOf([alice, bob], 'countdown') });
    const timer = t.root.querySelector('[role="timer"]');
    expect(timer?.hasAttribute('hidden')).toBe(false);
    expect(timer?.textContent).toBe('Match starts in3');
    expect(t.button('Ready').disabled).toBe(true);
    t.tick(1000);
    expect(timer?.textContent).toBe('Match starts in2');
    t.tick(1000);
    expect(timer?.textContent).toBe('Match starts in1');
    t.tick(1000);
    expect(t.props.onCountdownDone).toHaveBeenCalledExactlyOnceWith(match);
    expect(timer?.hasAttribute('hidden')).toBe(true);
    t.tick(5000);
    expect(t.props.onCountdownDone).toHaveBeenCalledOnce();
  });

  it('clamps the countdown to 0–5 s whatever startAt says', () => {
    vi.useFakeTimers();
    const far = setup();
    far.screen.update({ ...far.props, match: { type: 'matchStart', seed: 1, startAt: 1e15 } });
    far.tick(4900);
    expect(far.props.onCountdownDone).not.toHaveBeenCalled();
    far.tick(200);
    expect(far.props.onCountdownDone).toHaveBeenCalledOnce();
    const past = setup();
    past.screen.update({ ...past.props, match: { type: 'matchStart', seed: 1, startAt: 0 } });
    expect(past.props.onCountdownDone).toHaveBeenCalledOnce();
  });

  it('Copy writes the code and says Copied for 1.5 s', async () => {
    vi.useFakeTimers();
    const t = setup();
    t.button('Copy').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.props.copy).toHaveBeenCalledWith('K7M2P9');
    expect(t.root.querySelector('.copied')?.textContent).toBe('Copied');
    await vi.advanceTimersByTimeAsync(1500);
    expect(t.root.querySelector('.copied')?.textContent).toBe('');
  });

  it('Escape opens the inline leave row; Stay closes it, Leave the room leaves', () => {
    const t = setup();
    const row = t.root.querySelector('.confirm-row');
    expect(row?.hasAttribute('hidden')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(row?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(t.button('Leave the room'));
    t.button('Stay').click();
    expect(row?.hasAttribute('hidden')).toBe(true);
    expect(t.props.onLeave).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    t.button('Leave the room').click();
    expect(t.props.onLeave).toHaveBeenCalledOnce();
    t.button('Leave').click();
    expect(t.props.onLeave).toHaveBeenCalledTimes(2);
  });

  it('arrow keys move focus between the actions', () => {
    const t = setup({ room: roomOf([alice, bob].map((p) => ({ ...p, ready: true }))) });
    const key = (code: string) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    expect(document.activeElement).toBe(t.button('Not ready'));
    key('ArrowDown');
    expect(document.activeElement).toBe(t.button('Start'));
    key('KeyS');
    expect(document.activeElement).toBe(t.button('Leave'));
    key('ArrowUp');
    expect(document.activeElement).toBe(t.button('Start'));
  });

  it('safety fact: a server nickname with markup renders as text only (ADR 0011)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const t = setup({
      room: roomOf([alice, { ...bob, nickname: evil }, { ...bob, id: 'c', nickname: '<b>x</b>' }]),
    });
    expect(t.root.querySelector('img')).toBeNull();
    expect(t.root.querySelector('b')).toBeNull();
    const names = [...t.root.querySelectorAll('.player-name')].map((n) => n.textContent);
    expect(names).toEqual(['Alice', evil, '<b>x</b>']);
    for (const n of t.root.querySelectorAll('.player-name'))
      expect([...n.childNodes].every((c) => c.nodeType === Node.TEXT_NODE)).toBe(true);
  });

  it('unmount removes every document listener and timer it added', () => {
    vi.useFakeTimers();
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
      added.push(fn);
      add(type, fn, opts);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, opts) => {
      removed.push(fn);
      remove(type, fn, opts);
    });
    const t = setup();
    t.screen.update({ ...t.props, match: { type: 'matchStart', seed: 1, startAt: 12_000 } });
    expect(added.length).toBeGreaterThan(0);
    t.screen.unmount();
    expect(removed).toHaveLength(added.length);
    expect(new Set(removed)).toEqual(new Set(added));
    expect(vi.getTimerCount()).toBe(0);
    expect(t.root.children).toHaveLength(0);
  });
});
