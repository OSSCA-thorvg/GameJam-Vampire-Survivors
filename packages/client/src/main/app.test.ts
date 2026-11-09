// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ChestReward } from '@vs/shared';
import type { LevelUpOption, MainToWorker, RunSummary } from '../protocol/worker-messages';
import {
  CONNECTION_LOST,
  createApp,
  effects,
  reduce,
  SILENT_SOUND,
  type AppEvent,
  type AppSound,
  type AppState,
} from './app';
import { createVersusController } from './match/versusController';
import { NetClient, type OpenSocket, type SocketHandlers } from './net/client';
import type { RecordBreaks } from './records/apply';
import { createMemoryRecords, type RecordsStore } from './records/store';

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
    [selectSwift, playing, [{ type: 'startRun', seed: 7, characterId: 'swift', mode: 'single' }]],
    [results, playing, [{ type: 'startRun', seed: 7, characterId: 'warden', mode: 'single' }]],
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
      { type: 'startRun', seed: 7, characterId: 'ember', mode: 'single' },
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
  it('#129: tells the sound every state, including the first, and hands the pause screen the settings', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const screens: AppState[] = [];
    let settings = { muted: false, music: 5, sfx: 7 };
    const listeners: ((s: typeof settings) => void)[] = [];
    const sound: AppSound = {
      screen: (state) => screens.push(state),
      cue: () => undefined,
      settings: () => settings,
      setSettings: (s) => {
        settings = s;
        for (const fn of listeners) fn(s);
      },
      onSettings: (fn) => {
        listeners.push(fn);
        return () => undefined;
      },
    };
    const app = createApp(
      root,
      () => undefined,
      () => 1,
      undefined,
      undefined,
      undefined,
      undefined,
      sound,
    );
    app.dispatch({ type: 'start' });
    app.dispatch({ type: 'confirm' });
    app.dispatch({ type: 'pauseToggle' });
    expect(screens.map((s) => s.name)).toEqual(['title', 'characterSelect', 'playing', 'playing']);
    expect(screens.at(-1)).toEqual(paused);
    const music = () => root.querySelector('[data-volume="music"]')?.textContent;
    expect(music()).toBe('5');
    button('Music +')?.click();
    expect(settings.music).toBe(6);
    expect(music()).toBe('6');
    // A change from elsewhere (the M key, the corner toggle) updates the open pause screen.
    sound.setSettings({ ...settings, muted: true });
    expect(button('Sound: off')).toBeDefined();
  });

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
      { type: 'startRun', seed: 1, characterId: 'warden', mode: 'single' },
      { type: 'pause' },
      { type: 'resume' },
      { type: 'startRun', seed: 2, characterId: 'warden', mode: 'single' },
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
      { type: 'startRun', seed: 1, characterId: 'swift', mode: 'single' },
      { type: 'startRun', seed: 2, characterId: 'swift', mode: 'single' },
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

  it('a build without a server says so on the entry screen and opens no socket (ADR 0017)', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp(
      root,
      () => undefined,
      () => 1,
      () => null,
      () => null,
    );
    app.dispatch({ type: 'multiplayer' });
    app.dispatch({ type: 'confirm' });
    expect(app.state.name).toBe('multiplayerEntry');
    expect(root.querySelector('.status')?.textContent).toBe(
      'Multiplayer is not available: no game server is configured for this site',
    );
    expect(button('Retry')?.hidden).toBe(true);
    expect(button('Create room')?.disabled).toBe(true);
    expect(button('Join room')?.disabled).toBe(true);
    key('Escape');
    expect(app.state.name).not.toBe('multiplayerEntry');
  });

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

describe('versus match (#20)', () => {
  const vRoom = { room: playingRoom, selfId: 'a', characterId: 'swift' as const, offline: false };
  const vPlaying: AppState = { name: 'versusPlaying', overlay: null, ...vRoom };
  const official = {
    kind: 'official' as const,
    headline: 'Win' as const,
    ranking: [{ playerId: 'a', nickname: 'Alice', alive: true, kills: 3 }],
    out: {},
    note: null,
  };
  const vResult: AppState = { name: 'versusResult', result: official, ...vRoom };

  it.each<[AppState, AppEvent, AppState]>([
    [{ ...lobby, match }, { type: 'versusStarted' }, { ...vPlaying, room }],
    [vPlaying, { type: 'roomState', room, selfId: 'a' }, { ...vPlaying, room }],
    [
      vPlaying,
      { type: 'levelUp', level: 2, options },
      { ...vPlaying, overlay: { kind: 'levelUp', level: 2, options } },
    ],
    [
      { ...vPlaying, overlay: { kind: 'levelUp', level: 2, options } },
      { type: 'chosen', index: 1 },
      vPlaying,
    ],
    [
      vPlaying,
      { type: 'chestOpened', rewards },
      { ...vPlaying, overlay: { kind: 'chest', rewards } },
    ],
    [{ ...vPlaying, overlay: { kind: 'chest', rewards } }, { type: 'chestClosed' }, vPlaying],
    [vPlaying, { type: 'versusOffline' }, { ...vPlaying, offline: true }],
    [vPlaying, { type: 'connectionLost' }, { ...vPlaying, offline: true }],
    [vPlaying, { type: 'versusOver', result: official }, vResult],
    [
      vResult,
      { type: 'rematch' },
      { name: 'lobby', room: playingRoom, selfId: 'a', characterId: 'swift' },
    ],
    [vResult, { type: 'leave' }, title],
    [vResult, { type: 'connectionLost' }, { ...vResult, offline: true }],
  ])('%j + %j → %j', (state, event, next) => {
    expect(reduce(state, event)).toEqual(next);
  });

  it.each<[AppState, AppEvent]>([
    [vPlaying, { type: 'pauseToggle' }],
    [vPlaying, { type: 'hidden' }],
    [vPlaying, { type: 'quitToTitle' }],
    [vPlaying, { type: 'gameOver', stats }],
    [vPlaying, { type: 'matchStart', match }],
    [vPlaying, { type: 'chosen', index: 0 }],
    [
      { ...vPlaying, overlay: { kind: 'levelUp', level: 2, options } },
      { type: 'chosen', index: 9 },
    ],
    [{ ...vResult, offline: true }, { type: 'rematch' }],
    [vResult, { type: 'gameOver', stats }],
    [lobby, { type: 'versusOver', result: official }],
  ])('%j ignores %j', (state, event) => {
    expect(reduce(state, event)).toBe(state);
  });

  it('effects: dialogs answer the worker; leaving the match ends the run', () => {
    const lu: AppState = { ...vPlaying, overlay: { kind: 'levelUp', level: 2, options } };
    expect(effects(lu, vPlaying, () => 1, { type: 'chosen', index: 1 })).toEqual([
      { type: 'levelUpChoice', index: 1 },
    ]);
    expect(
      effects({ ...vPlaying, overlay: { kind: 'chest', rewards } }, vPlaying, () => 1),
    ).toEqual([{ type: 'chestClosed' }]);
    expect(effects(vPlaying, vResult, () => 1)).toEqual([]);
    expect(effects(vResult, title, () => 1)).toEqual([{ type: 'endRun' }]);
    expect(effects(vResult, lobby, () => 1)).toEqual([{ type: 'endRun' }]);
    expect(effects({ ...lobby, match }, vPlaying, () => 1)).toEqual([]);
  });
});

describe('createApp versus flow (happy-dom, fake socket and worker port)', () => {
  const button = (name: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === name);

  async function inLobby(sound: AppSound = SILENT_SOUND, records?: RecordsStore) {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const sockets: { on: SocketHandlers; sent: string[] }[] = [];
    const open: OpenSocket = (_url, on) => {
      const socket = { on, sent: [] as string[] };
      sockets.push(socket);
      return { send: (d) => socket.sent.push(d), close: () => undefined };
    };
    const posted: MainToWorker[] = [];
    let versusCreated = 0;
    const panes: number[] = [];
    const app = createApp(
      root,
      (m) => posted.push(m),
      () => 1,
      () => null,
      () => new NetClient('ws://test/ws', open),
      (opts) => {
        versusCreated++;
        return createVersusController(opts);
      },
      (n) => panes.push(n),
      sound,
      records,
    );
    const socket = () => {
      const s = sockets.at(-1);
      if (!s) throw new Error('no socket');
      return s;
    };
    const serverSays = (m: unknown) => {
      socket().on.message(JSON.stringify(m));
    };
    const sent = () => socket().sent.map((d) => JSON.parse(d) as { type: string });
    app.dispatch({ type: 'multiplayer' });
    app.dispatch({ type: 'confirm' });
    socket().on.open();
    serverSays({ type: 'welcome', playerId: 'a' });
    await Promise.resolve();
    const both = {
      ...room,
      players: [
        ...room.players,
        { id: 'b', nickname: 'Bob', ready: true, host: false, connected: true },
      ],
    };
    serverSays(both);
    serverSays({ ...match, startAt: Date.now() });
    serverSays({ ...both, phase: 'countdown' });
    return { root, app, posted, sent, serverSays, both, versus: () => versusCreated, panes };
  }

  it('#129: forwards the incoming interference cue and follows the versus screens', async () => {
    const cues: string[] = [];
    const screens: string[] = [];
    const t = await inLobby({
      ...SILENT_SOUND,
      screen: (state) => screens.push(state.name),
      cue: (id) => cues.push(id),
    });
    expect(t.app.state.name).toBe('versusPlaying');
    t.serverSays({
      type: 'interferenceIncoming',
      kind: 'swarm',
      fromPlayerId: 'b',
      fromNickname: 'Bob',
    });
    expect(cues).toEqual(['sfx.interferenceReceive']);
    // Room updates are transitions too, so names repeat.
    expect([...new Set(screens)]).toEqual([
      'title',
      'characterSelect',
      'multiplayerEntry',
      'lobby',
      'versusPlaying',
    ]);
  });

  it('the countdown starts a versus run (once); status is relayed; a death sends died; matchResult shows Lose; Rematch returns to the lobby', async () => {
    // `startAt` is now: the lobby's countdown ends at once and calls `startVersus`.
    const t = await inLobby();
    expect(t.app.state.name).toBe('versusPlaying');
    expect(t.versus()).toBe(1);
    // #115: two panes for the match.
    expect(t.panes).toEqual([2]);
    expect(t.posted).toEqual([
      { type: 'setBackgroundPolicy', policy: 'simulate' },
      { type: 'startRun', mode: 'versus', seed: 9, characterId: 'warden', finale: 'end' },
    ]);
    expect(t.root.querySelector('.opponent-name')?.textContent).toBe('Bob');
    // Escape does not pause a versus match.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(t.app.state.name).toBe('versusPlaying');
    t.app.status({
      type: 'status',
      hp: 10,
      maxHp: 120,
      level: 2,
      kills: 4,
      alive: true,
      elapsedMs: 250,
    });
    expect(t.sent().at(-1)).toEqual({
      type: 'status',
      status: { hp: 10, maxHp: 120, level: 2, kills: 4, alive: true, elapsedMs: 250 },
    });
    t.app.dispatch({ type: 'gameOver', stats });
    expect(t.sent().at(-1)).toEqual({ type: 'died', kills: 3, elapsedMs: 75_400 });
    expect(t.app.state.name).toBe('versusPlaying');
    expect(t.root.querySelector('.results')).toBeNull();
    t.serverSays({
      type: 'matchResult',
      outcome: 'win',
      winnerId: 'b',
      ranking: [
        { playerId: 'b', nickname: 'Bob', alive: true, kills: 8 },
        { playerId: 'a', nickname: 'Alice', alive: false, kills: 3 },
      ],
    });
    expect(t.app.state.name).toBe('versusResult');
    // The result keeps the last split frame underneath.
    expect(t.panes).toEqual([2]);
    expect(t.root.querySelector('h2')?.textContent).toBe('Lose');
    expect(t.root.querySelector('.opponent-panel')).toBeNull();
    expect(t.posted.slice(2)).toEqual([
      { type: 'forceEnd', reason: 'matchOver' },
      { type: 'setBackgroundPolicy', policy: 'pause' },
    ]);
    t.serverSays({ ...t.both, phase: 'finished' });
    button('Rematch')?.click();
    expect(t.app.state.name).toBe('lobby');
    expect(t.panes).toEqual([2, 1]);
    expect(t.posted.at(-1)).toEqual({ type: 'endRun' });
    expect(t.root.querySelector('.lobby .status')?.textContent).toBe(
      'Waiting for the room to reset',
    );
    t.serverSays({
      ...t.both,
      phase: 'lobby',
      players: t.both.players.map((p) => ({ ...p, ready: false })),
    });
    expect(t.root.querySelectorAll('.players li[data-ready="false"]')).toHaveLength(2);
  });

  it('Leave on the result sends leaveRoom and returns to the title; level-ups still work in versus', async () => {
    const t = await inLobby();
    expect(t.app.state.name).toBe('versusPlaying');
    t.app.dispatch({ type: 'levelUp', level: 2, options });
    expect(t.root.querySelector('.levelup, [role="dialog"]')).not.toBeNull();
    t.app.dispatch({ type: 'chosen', index: 0 });
    expect(t.posted.at(-1)).toEqual({ type: 'levelUpChoice', index: 0 });
    t.app.dispatch({ type: 'gameOver', stats: { ...stats, cleared: true } });
    expect(t.sent().at(-1)).toEqual({ type: 'survived', kills: 3 });
    expect(t.root.querySelector('.versus-banner')?.textContent).toBe(
      'Survived! Waiting for others',
    );
    t.serverSays({ type: 'matchResult', outcome: 'draw', winnerId: null, ranking: [] });
    expect(t.root.querySelector('h2')?.textContent).toBe('Draw');
    button('Leave')?.click();
    expect(t.sent().at(-1)).toEqual({ type: 'leaveRoom' });
    expect(t.app.state).toEqual(title);
    expect(t.posted.at(-1)).toEqual({ type: 'endRun' });
    expect(t.panes).toEqual([2, 1]);
  });

  it('#143 safety fact: a versus gameOver (died and survived) and its result record nothing', async () => {
    const { store, calls } = countingRecords();
    const t = await inLobby(SILENT_SOUND, store);
    expect(t.app.state.name).toBe('versusPlaying');
    t.app.dispatch({ type: 'gameOver', stats });
    t.app.dispatch({ type: 'gameOver', stats: { ...stats, cleared: true } });
    t.serverSays({ type: 'matchResult', outcome: 'draw', winnerId: null, ranking: [] });
    expect(t.app.state.name).toBe('versusResult');
    button('Leave')?.click();
    expect(t.app.state).toEqual(title);
    expect(calls.record).toEqual([]);
    expect(t.app.recordsSnapshot().data.totals.runs).toBe(0);
    expect(t.app.recordsSnapshot().lastBreaks).toBeNull();
  });

  it('safety fact: a single-player run creates no versusController, relays no status and opens no WebSocket', () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const posted: MainToWorker[] = [];
    let nets = 0;
    let versus = 0;
    const app = createApp(
      root,
      (m) => posted.push(m),
      () => 5,
      () => null,
      () => {
        nets++;
        return new NetClient('ws://test/ws', () => {
          throw new Error('no socket in single player');
        });
      },
      (opts) => {
        versus++;
        return createVersusController(opts);
      },
    );
    app.dispatch({ type: 'start' });
    app.dispatch({ type: 'confirm' });
    expect(posted).toEqual([{ type: 'startRun', seed: 5, characterId: 'warden', mode: 'single' }]);
    // Even a stray worker status (the worker posts none in single mode) goes nowhere.
    app.status({
      type: 'status',
      hp: 1,
      maxHp: 1,
      level: 1,
      kills: 0,
      alive: true,
      elapsedMs: 250,
    });
    app.startVersus({
      seed: 1,
      startAt: 0,
      roomCode: 'ABCDEF',
      selfId: 'a',
      players: [],
      characterId: 'warden',
    });
    app.dispatch({ type: 'gameOver', stats });
    expect(app.state).toEqual(results);
    expect(root.querySelector('.results')).not.toBeNull();
    expect(nets).toBe(0);
    expect(versus).toBe(0);
    expect(posted).toEqual([{ type: 'startRun', seed: 5, characterId: 'warden', mode: 'single' }]);
  });
});

/** A `RecordsStore` that counts calls over the real in-memory store (#143). */
function countingRecords() {
  const inner = createMemoryRecords();
  const calls = { record: [] as RunSummary[], reset: 0 };
  const store: RecordsStore = {
    read: () => inner.read(),
    record(summary, at): RecordBreaks {
      calls.record.push(summary);
      return inner.record(summary, at);
    },
    reset() {
      calls.reset++;
      inner.reset();
    },
    get persisted() {
      return inner.persisted;
    },
  };
  return { store, calls };
}

describe('records (#143)', () => {
  const recordsState: AppState = { name: 'records', confirming: false };
  const confirming: AppState = { name: 'records', confirming: true };

  it.each<[AppState, AppEvent, AppState]>([
    [title, { type: 'records' }, recordsState],
    [recordsState, { type: 'back' }, title],
    [recordsState, { type: 'resetRequest' }, confirming],
    [confirming, { type: 'resetCancel' }, recordsState],
    [confirming, { type: 'resetConfirm' }, recordsState],
  ])('reduce %j + %j', (from, event, to) => {
    expect(reduce(from, event)).toEqual(to);
  });

  it.each<[AppState, AppEvent]>([
    [recordsState, { type: 'resetCancel' }],
    [recordsState, { type: 'resetConfirm' }],
    [confirming, { type: 'resetRequest' }],
    [recordsState, { type: 'start' }],
    [recordsState, { type: 'gameOver', stats }],
    [playing, { type: 'records' }],
  ])('keeps %j on %j', (from, event) => {
    expect(reduce(from, event)).toBe(from);
  });

  it('sends no worker message for the records transitions', () => {
    for (const [from, to] of [
      [title, recordsState],
      [recordsState, confirming],
      [confirming, recordsState],
      [recordsState, title],
    ] as const)
      expect(effects(from, to, () => 1)).toEqual([]);
  });

  function setup(store: RecordsStore) {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp(
      root,
      () => undefined,
      () => 1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      store,
    );
    return { root, app };
  }
  const key = (code: string) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const button = (name: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === name);

  it('records a single-player run once on playing → results, and again after Retry', () => {
    const { store, calls } = countingRecords();
    const { app, root } = setup(store);
    app.dispatch({ type: 'start' });
    app.dispatch({ type: 'confirm' });
    app.dispatch({ type: 'gameOver', stats });
    expect(calls.record).toEqual([stats]);
    expect(app.recordsSnapshot().data.totals.runs).toBe(1);
    expect(app.recordsSnapshot().lastBreaks?.timeSec).toBe('overall');
    expect(root.querySelector('[data-best="time"]')?.getAttribute('data-scope')).toBe('overall');
    // A second gameOver while on results is no transition.
    app.dispatch({ type: 'gameOver', stats });
    expect(calls.record).toHaveLength(1);
    app.dispatch({ type: 'retry' });
    app.dispatch({ type: 'gameOver', stats });
    expect(calls.record).toHaveLength(2);
    // Equal values: no badge this time.
    expect(root.querySelector('[data-best="time"]')).toBeNull();
  });

  it('does not record a run quit from the pause screen', () => {
    const { store, calls } = countingRecords();
    const { app } = setup(store);
    app.dispatch({ type: 'start' });
    app.dispatch({ type: 'confirm' });
    app.dispatch({ type: 'pauseToggle' });
    app.dispatch({ type: 'quitToTitle' });
    expect(app.state).toEqual(title);
    expect(calls.record).toEqual([]);
  });

  it('shows the bests on the character select', () => {
    const { store } = countingRecords();
    store.record({ ...stats, characterId: 'swift', timeSec: 754.6, cleared: true }, 1);
    const { app, root } = setup(store);
    app.dispatch({ type: 'start' });
    expect(root.querySelector('[data-best-time="swift"]')?.textContent).toBe('Best 12:34');
    expect(root.querySelector('[data-character="swift"] .character-cleared')?.textContent).toBe(
      'Cleared',
    );
    expect(root.querySelector('[data-best-time="warden"]')?.textContent).toBe('Best --:--');
  });

  it('title → Records → reset request → confirm resets once; cancel keeps the data; Escape goes back', () => {
    const { store, calls } = countingRecords();
    store.record(stats, 1);
    const { app, root } = setup(store);
    key('ArrowDown');
    key('ArrowDown');
    expect(document.activeElement).toBe(button('Records'));
    button('Records')?.click();
    expect(app.state).toEqual(recordsState);
    expect(root.querySelectorAll('[data-run-index]')).toHaveLength(1);
    // resetConfirm without a request does nothing.
    app.dispatch({ type: 'resetConfirm' });
    expect(calls.reset).toBe(0);
    button('Reset records')?.click();
    expect(app.state).toEqual(confirming);
    button('Cancel')?.click();
    expect(app.state).toEqual(recordsState);
    expect(calls.reset).toBe(0);
    expect(store.read().totals.runs).toBe(1);
    button('Reset records')?.click();
    button('Delete records')?.click();
    expect(calls.reset).toBe(1);
    expect(app.recordsSnapshot()).toEqual({
      data: createMemoryRecords().read(),
      lastBreaks: null,
      persisted: false,
    });
    expect(root.querySelector('p.hint')?.textContent).toBe('No runs yet.');
    key('Escape');
    expect(app.state).toEqual(title);
  });
});
