// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { LevelUpOption, MainToWorker } from '../protocol/worker-messages';
import { createApp, effects, reduce, type AppEvent, type AppState } from './app';

const stats = { timeSec: 75.4, kills: 3, level: 1 };
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
const selectWarden: AppState = { name: 'characterSelect', selectedId: 'warden' };
const selectSwift: AppState = { name: 'characterSelect', selectedId: 'swift' };

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
  ])('%j + %j → %j', (state, event, next) => {
    expect(reduce(state, event)).toEqual(next);
  });

  it('starts the select screen on the character chosen last this session', () => {
    expect(reduce(title, { type: 'start' }, 'ember')).toEqual({
      name: 'characterSelect',
      selectedId: 'ember',
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
    expect(app.state).toEqual({ name: 'characterSelect', selectedId: 'aurelia' });
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
});
