// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ChestReward } from '@vs/shared';
import type { LevelUpOption, MainToWorker, RunSummary } from '../protocol/worker-messages';
import { CONNECTION_LOST, createApp, effects, reduce, type AppEvent, type AppState } from './app';
import { NetClient, type OpenSocket, type SocketHandlers } from './net/client';

const stats: RunSummary = {
  timeSec: 75.4,
  kills: 3,
  level: 1,
  cleared: false,
  characterId: 'warden',
  weapons: [{ id: 'whip', level: 1, damage: 40 }],
  passives: [],
};
const title: AppState = { name: 'title' };
const playing: AppState = { name: 'playing', paused: false };
const paused: AppState = { name: 'playing', paused: true };
const results: AppState = { name: 'results', stats };
const options: LevelUpOption[] = [
  { kind: 'heal', amount: 30, description: 'Recover 30 HP.', iconId: null },
  {
    kind: 'newWeapon',
    weaponId: 'magicWand',
    name: 'Magic Wand',
    description: 'Zap.',
    iconId: 'icon.weapon.magicWand',
  },
];
const levelUp: AppState = { name: 'levelUp', level: 2, options };
const selectWarden: AppState = { name: 'characterSelect', selectedId: 'warden', purpose: 'single' };
const selectSwift: AppState = { name: 'characterSelect', selectedId: 'swift', purpose: 'single' };
const rewards: ChestReward[] = [
  { kind: 'evolve', fromWeaponId: 'whip', intoWeaponId: 'bloodyTear' },
];
const chest: AppState = { name: 'chest', rewards };

const room = {
  type: 'roomState' as const,
  code: 'ABCDEF',
  maxPlayers: 2,
  phase: 'lobby' as const,
  players: [{ id: 'a', nickname: 'Alice', ready: false, host: true, connected: true }],
};
const playingRoom = { ...room, phase: 'playing' as const };
const match = { type: 'matchStart' as const, seed: 9, startAt: 1000 };
const selectVersus: AppState = { name: 'characterSelect', selectedId: 'swift', purpose: 'versus' };
const entry: AppState = { name: 'multiplayerEntry', characterId: 'swift' };
const lobby: AppState = { name: 'lobby', room, selfId: 'a', characterId: 'swift' };

describe('reduce (#19 multiplayer)', () => {
  it.each<[AppState, AppEvent, AppState]>([
    [title, { type: 'multiplayer' }, { ...selectWarden, purpose: 'versus' }],
    [selectVersus, { type: 'select', id: 'ember' }, { ...selectVersus, selectedId: 'ember' }],
    [selectVersus, { type: 'confirm' }, entry],
    [selectVersus, { type: 'back' }, title],
    [entry, { type: 'back' }, title],
    [entry, { type: 'roomState', room, selfId: 'a' }, lobby],
    [entry, { type: 'connectionLost' }, { ...entry, error: CONNECTION_LOST }],
    [lobby, { type: 'roomState', room: playingRoom, selfId: 'a' }, { ...lobby, room: playingRoom }],
    [lobby, { type: 'matchStart', match }, { ...lobby, match }],
    [
      { ...lobby, match },
      { type: 'roomState', room: playingRoom, selfId: 'a' },
      { ...lobby, room: playingRoom, match },
    ],
    [{ ...lobby, room: playingRoom, match }, { type: 'roomState', room, selfId: 'a' }, lobby],
    [lobby, { type: 'leave' }, title],
    [lobby, { type: 'connectionLost' }, { ...entry, error: CONNECTION_LOST }],
  ])('%j + %j → %j', (state, event, next) => {
    expect(reduce(state, event)).toEqual(next);
  });

  it.each<[AppState, AppEvent]>([
    [title, { type: 'roomState', room, selfId: 'a' }],
    [title, { type: 'connectionLost' }],
    [selectVersus, { type: 'roomState', room, selfId: 'a' }],
    [entry, { type: 'matchStart', match }],
    [entry, { type: 'start' }],
    [lobby, { type: 'back' }],
    [lobby, { type: 'pauseToggle' }],
    [playing, { type: 'connectionLost' }],
    [playing, { type: 'roomState', room, selfId: 'a' }],
  ])('ignores %j + %j', (state, event) => {
    expect(reduce(state, event)).toBe(state);
  });

  it('sends no worker message anywhere in the multiplayer flow', () => {
    const seed = () => 1;
    for (const [from, to] of [
      [title, selectVersus],
      [selectVersus, entry],
      [entry, lobby],
      [lobby, title],
      [entry, title],
      [selectVersus, title],
    ] as const)
      expect(effects(from, to, seed)).toEqual([]);
  });
});

describe('reduce', () => {
  it.each<[AppState, AppEvent, AppState]>([
    [title, { type: 'start' }, selectWarden],
    [selectWarden, { type: 'select', id: 'swift' }, selectSwift],
    [selectSwift, { type: 'confirm' }, playing],
    [selectSwift, { type: 'back' }, title],
    [playing, { type: 'pauseToggle' }, paused],
    [paused, { type: 'pauseToggle' }, playing],
    [playing, { type: 'hidden' }, paused],
    [paused, { type: 'quitToTitle' }, title],
    [playing, { type: 'gameOver', stats }, results],
    [results, { type: 'retry' }, playing],
    [results, { type: 'quitToTitle' }, title],
    [playing, { type: 'levelUp', level: 2, options }, levelUp],
    [paused, { type: 'levelUp', level: 2, options }, levelUp],
    [levelUp, { type: 'chosen', index: 1 }, playing],
    [playing, { type: 'chestOpened', rewards }, chest],
    [chest, { type: 'chestClosed' }, playing],
  ])('%j + %j → %j', (state, event, next) => {
    expect(reduce(state, event)).toEqual(next);
  });

  it('starts the select screen on the character chosen last this session', () => {
    expect(reduce(title, { type: 'start' }, 'ember')).toEqual({
      name: 'characterSelect',
      selectedId: 'ember',
      purpose: 'single',
    });
  });

  it.each<[AppState, AppEvent]>([
    [title, { type: 'pauseToggle' }],
    [title, { type: 'hidden' }],
    [title, { type: 'retry' }],
    [title, { type: 'gameOver', stats }],
    [title, { type: 'quitToTitle' }],
    [playing, { type: 'start' }],
    [playing, { type: 'retry' }],
    [paused, { type: 'hidden' }],
    [results, { type: 'pauseToggle' }],
    [results, { type: 'hidden' }],
    [results, { type: 'start' }],
    [results, { type: 'gameOver', stats }],
    [title, { type: 'levelUp', level: 2, options }],
    [results, { type: 'levelUp', level: 2, options }],
    [playing, { type: 'chosen', index: 0 }],
    [levelUp, { type: 'pauseToggle' }],
    [chest, { type: 'pauseToggle' }],
    [chest, { type: 'hidden' }],
    [chest, { type: 'quitToTitle' }],
    [title, { type: 'chestOpened', rewards }],
    [levelUp, { type: 'hidden' }],
    [levelUp, { type: 'quitToTitle' }],
    [levelUp, { type: 'chosen', index: 2 }],
    [levelUp, { type: 'chosen', index: -1 }],
    [selectWarden, { type: 'select', id: 'warden' }],
    [selectWarden, { type: 'select', id: 'nobody' as never }],
    [selectWarden, { type: 'start' }],
    [selectWarden, { type: 'pauseToggle' }],
    [selectWarden, { type: 'hidden' }],
    [selectWarden, { type: 'retry' }],
    [selectWarden, { type: 'quitToTitle' }],
    [title, { type: 'confirm' }],
    [playing, { type: 'back' }],
  ])('ignores %j + %j (same state object)', (state, event) => {
    expect(reduce(state, event)).toBe(state);
  });
});

describe('effects', () => {
  const seed = () => 7;
  it.each<[AppState, AppState, MainToWorker[]]>([
    [selectSwift, playing, [{ type: 'startRun', seed: 7, characterId: 'swift' }]],
    [results, playing, [{ type: 'startRun', seed: 7, characterId: 'warden' }]],
    [title, selectWarden, []],
    [selectWarden, selectSwift, []],
    [selectSwift, title, []],
    [playing, paused, [{ type: 'pause' }]],
    [paused, playing, [{ type: 'resume' }]],
    [paused, title, [{ type: 'endRun' }]],
    [results, title, [{ type: 'endRun' }]],
    [playing, results, []],
    [title, title, []],
  ])('%j → %j sends %j', (from, to, messages) => {
    expect(effects(from, to, seed)).toEqual(messages);
  });

  it('retries as the character chosen last', () => {
    expect(effects(results, playing, seed, { type: 'retry' }, 'ember')).toEqual([
      { type: 'startRun', seed: 7, characterId: 'ember' },
    ]);
  });

  it('sends the chosen index when leaving the level-up screen, and nothing when entering it', () => {
    expect(effects(playing, levelUp, seed, { type: 'levelUp', level: 2, options })).toEqual([]);
    expect(effects(playing, chest, seed, { type: 'chestOpened', rewards })).toEqual([]);
    expect(effects(chest, playing, seed, { type: 'chestClosed' })).toEqual([
      { type: 'chestClosed' },
    ]);
    expect(effects(levelUp, playing, seed, { type: 'chosen', index: 1 })).toEqual([
      { type: 'levelUpChoice', index: 1 },
    ]);
  });
});

describe('createApp (happy-dom)', () => {
  const key = (code: string) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const button = (name: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === name);

  it('drives title → playing → pause → results → retry → title with the keyboard, mounting one screen at a time', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const sent: MainToWorker[] = [];
    let n = 0;
    const app = createApp(
      root,
      (m) => sent.push(m),
      () => ++n,
    );

    expect(app.state).toEqual(title);
    expect(document.activeElement).toBe(button('Start'));
    button('Start')?.click();
    expect(app.state).toEqual(selectWarden);
    key('Enter');
    expect(app.state).toEqual(playing);
    expect(root.children).toHaveLength(0);

    key('Escape');
    expect(app.state).toEqual(paused);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Paused');
    expect(document.activeElement).toBe(button('Resume'));
    key('ArrowDown');
    expect(document.activeElement).toBe(button('Quit to title'));
    key('KeyW');
    expect(document.activeElement).toBe(button('Resume'));
    key('Escape');
    expect(app.state).toEqual(playing);
    expect(root.children).toHaveLength(0);

    app.dispatch({ type: 'gameOver', stats });
    expect(root.querySelector('[data-stat="time"]')?.textContent).toBe('01:15');
    expect(root.querySelector('[data-stat="kills"]')?.textContent).toBe('3');
    expect(root.querySelector('[data-stat="level"]')?.textContent).toBe('1');
    expect(document.activeElement).toBe(button('Retry'));
    // Escape does nothing outside a run.
    key('Escape');
    expect(app.state.name).toBe('results');
    button('Retry')?.click();
    expect(app.state).toEqual(playing);
    app.dispatch({ type: 'gameOver', stats });
    key('KeyS');
    button('Title')?.click();
    expect(app.state).toEqual(title);
    expect(root.children).toHaveLength(1);

    expect(sent).toEqual([
      { type: 'startRun', seed: 1, characterId: 'warden' },
      { type: 'pause' },
      { type: 'resume' },
      { type: 'startRun', seed: 2, characterId: 'warden' },
      { type: 'endRun' },
    ]);
  });

  it('mounts the level-up screen on levelUp, ignores Escape there, and a digit sends levelUpChoice', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const sent: MainToWorker[] = [];
    const app = createApp(
      root,
      (m) => sent.push(m),
      () => 1,
    );
    button('Start')?.click();
    key('Enter');
    app.dispatch({ type: 'levelUp', level: 2, options });
    expect(app.state).toEqual(levelUp);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Level up');
    key('Escape');
    expect(app.state).toEqual(levelUp);
    key('Digit2');
    expect(app.state).toEqual(playing);
    expect(root.children).toHaveLength(0);
    // The worker posts the next level-up right away when more are pending.
    app.dispatch({ type: 'levelUp', level: 3, options });
    key('Enter');
    expect(app.state).toEqual(playing);
    expect(sent.slice(1)).toEqual([
      { type: 'levelUpChoice', index: 1 },
      { type: 'levelUpChoice', index: 0 },
    ]);
  });

  it('Enter activates the first button when focus is elsewhere', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp(
      root,
      () => undefined,
      () => 1,
    );
    button('Start')?.blur();
    key('Enter');
    expect(app.state).toEqual(selectWarden);
  });

  it('chooses a character with the keyboard, goes back with Escape, remembers the choice and retries as it (#14)', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const sent: MainToWorker[] = [];
    let n = 0;
    const app = createApp(
      root,
      (m) => sent.push(m),
      () => ++n,
    );
    const selected = () => root.querySelector('[role="option"][aria-selected="true"]');
    button('Start')?.click();
    expect(root.querySelectorAll('[role="listbox"] [role="option"]')).toHaveLength(4);
    expect(document.activeElement).toBe(selected());
    key('ArrowRight');
    key('KeyD');
    expect(app.state).toEqual(selectSwift);
    expect(selected()?.getAttribute('data-character')).toBe('swift');
    expect(document.activeElement).toBe(selected());
    key('Escape');
    expect(app.state).toEqual(title);
    button('Start')?.click();
    // Not confirmed, so the select screen starts on the default again.
    expect(app.state).toEqual(selectWarden);
    key('ArrowLeft');
    expect(app.state).toEqual({
      name: 'characterSelect',
      selectedId: 'aurelia',
      purpose: 'single',
    });
    key('KeyA');
    expect(app.state).toEqual(selectSwift);
    key('Enter');
    expect(app.state).toEqual(playing);
    app.dispatch({ type: 'gameOver', stats });
    button('Retry')?.click();
    app.dispatch({ type: 'pauseToggle' });
    button('Quit to title')?.click();
    button('Start')?.click();
    expect(app.state).toEqual(selectSwift);
    expect(sent).toEqual([
      { type: 'startRun', seed: 1, characterId: 'swift' },
      { type: 'startRun', seed: 2, characterId: 'swift' },
      { type: 'pause' },
      { type: 'endRun' },
    ]);
  });

  it('mounts the chest overlay on chestOpened, ignores Escape there, and Enter sends chestClosed', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const sent: MainToWorker[] = [];
    const app = createApp(
      root,
      (m) => sent.push(m),
      () => 1,
    );
    button('Start')?.click();
    key('Enter');
    app.dispatch({ type: 'chestOpened', rewards });
    expect(app.state).toEqual(chest);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Treasure');
    key('Escape');
    expect(app.state).toEqual(chest);
    key('Enter');
    expect(app.state).toEqual(playing);
    expect(root.children).toHaveLength(0);
    expect(sent.slice(1)).toEqual([{ type: 'chestClosed' }]);
  });
});

describe('createApp multiplayer flow (happy-dom, fake socket)', () => {
  const key = (code: string) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const button = (name: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === name);

  function setup() {
    document.body.replaceChildren();
    localStorage.clear();
    const root = document.createElement('div');
    document.body.append(root);
    const sockets: { on: SocketHandlers; sent: string[] }[] = [];
    const open: OpenSocket = (_url, on) => {
      const socket = { on, sent: [] as string[] };
      sockets.push(socket);
      return { send: (d) => socket.sent.push(d), close: () => undefined };
    };
    const created: NetClient[] = [];
    const posted: MainToWorker[] = [];
    const app = createApp(
      root,
      (m) => posted.push(m),
      () => 1,
      () => null,
      () => {
        const net = new NetClient('ws://test/ws', open);
        created.push(net);
        return net;
      },
    );
    const socket = () => {
      const s = sockets.at(-1);
      if (!s) throw new Error('no socket');
      return s;
    };
    const serverSays = (m: unknown) => {
      socket().on.message(JSON.stringify(m));
    };
    return { root, app, sockets, created, posted, socket, serverSays };
  }

  it('creates no socket in single player', () => {
    const t = setup();
    button('Start')?.click();
    key('Enter');
    expect(t.app.state).toEqual(playing);
    expect(t.created).toHaveLength(0);
  });

  it('title → Multiplayer → character → entry connects, creates a room and shows the lobby; Leave sends leaveRoom and closes', async () => {
    const t = setup();
    button('Multiplayer')?.click();
    expect(t.app.state).toEqual({ ...selectWarden, purpose: 'versus' });
    expect(t.created).toHaveLength(0);
    key('ArrowRight');
    key('ArrowRight');
    key('Enter');
    expect(t.app.state).toEqual(entry);
    expect(t.created).toHaveLength(1);
    expect(t.created[0]?.state).toBe('connecting');
    t.socket().on.open();
    t.serverSays({ type: 'welcome', playerId: 'a' });
    await Promise.resolve();
    const nickname = t.root.querySelector<HTMLInputElement>('#mp-nickname');
    if (!nickname) throw new Error('no nickname field');
    expect(document.activeElement).toBe(nickname);
    nickname.value = 'Alice';
    nickname.dispatchEvent(new Event('input'));
    expect(button('Create room')?.disabled).toBe(false);
    nickname.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(t.socket().sent.at(-1)).toBe('{"type":"createRoom","nickname":"Alice"}');
    expect(localStorage.getItem('vs.nickname')).toBe('Alice');
    t.serverSays(room);
    expect(t.app.state).toEqual(lobby);
    expect(t.root.querySelector('.room-code')?.textContent).toBe('ABCDEF');
    button('Leave')?.click();
    expect(t.socket().sent.at(-1)).toBe('{"type":"leaveRoom"}');
    expect(t.app.state).toEqual(title);
    expect(t.created[0]?.state).toBe('closed');
    expect(t.posted).toEqual([]);
    // The next visit pre-fills the nickname.
    button('Multiplayer')?.click();
    key('Enter');
    expect(t.root.querySelector<HTMLInputElement>('#mp-nickname')?.value).toBe('Alice');
    expect(t.created).toHaveLength(2);
  });

  it('a server error shows its mapped message and stays on the entry screen', async () => {
    const t = setup();
    t.app.dispatch({ type: 'multiplayer' });
    t.app.dispatch({ type: 'confirm' });
    t.socket().on.open();
    t.serverSays({ type: 'welcome', playerId: 'b' });
    await Promise.resolve();
    const nickname = t.root.querySelector<HTMLInputElement>('#mp-nickname');
    const code = t.root.querySelector<HTMLInputElement>('#mp-code');
    if (!nickname || !code) throw new Error('fields missing');
    nickname.value = 'Bob';
    nickname.dispatchEvent(new Event('input'));
    button('Join room')?.click();
    code.value = 'zzzzzz';
    code.dispatchEvent(new Event('input'));
    button('Join')?.click();
    expect(t.socket().sent.at(-1)).toBe('{"type":"joinRoom","code":"ZZZZZZ","nickname":"Bob"}');
    t.serverSays({ type: 'error', code: 'roomNotFound', message: '<img src=x onerror=alert(1)>' });
    expect(t.app.state.name).toBe('multiplayerEntry');
    expect(t.root.querySelector('#mp-code-error')?.textContent).toBe(
      'Room not found or not joinable',
    );
    expect(t.root.textContent).not.toContain('onerror');
    expect(t.root.querySelector('img')).toBeNull();
  });

  it('an unexpected close in the lobby returns to the entry screen with the notice and the nickname kept', async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.app.dispatch({ type: 'multiplayer' });
      t.app.dispatch({ type: 'confirm' });
      t.socket().on.open();
      t.serverSays({ type: 'welcome', playerId: 'a' });
      await vi.advanceTimersByTimeAsync(0);
      const nickname = t.root.querySelector<HTMLInputElement>('#mp-nickname');
      if (!nickname) throw new Error('no nickname field');
      nickname.value = 'Alice';
      nickname.dispatchEvent(new Event('input'));
      button('Create room')?.click();
      t.serverSays(room);
      expect(t.app.state.name).toBe('lobby');
      t.socket().on.close(1006);
      expect(t.root.querySelector('.lobby .status')?.textContent).toBe('Reconnecting…');
      for (const delay of [1000, 2000, 4000]) {
        await vi.advanceTimersByTimeAsync(delay);
        t.socket().on.close(1006);
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(t.app.state).toEqual({ ...entry, characterId: 'warden', error: CONNECTION_LOST });
      expect(t.root.querySelector('.notice')?.textContent).toBe(CONNECTION_LOST);
      expect(t.root.querySelector<HTMLInputElement>('#mp-nickname')?.value).toBe('Alice');
      // The entry screen tries again on mount; with the server still down it offers Retry.
      expect(t.root.querySelector('.status')?.textContent).toBe('Connecting to the game server…');
      t.socket().on.close(1006);
      await vi.advanceTimersByTimeAsync(0);
      expect(t.root.querySelector('.status')?.textContent).toBe('Cannot reach the game server');
      expect(button('Retry')?.hidden).toBe(false);
      expect(button('Create room')?.disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
