// @vitest-environment happy-dom
import { DUCK, WORLD_SFX, type AudioSettings, type SfxId } from '@vs/shared';
import { describe, expect, it, vi } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import { createAudioDirector, duckFor, musicFor, type SoundScreen } from './director';
import type { AudioEngine } from './engine';

function fakeEngine() {
  const calls = {
    unlock: 0,
    played: [] as SfxId[],
    music: [] as (string | null)[],
    duck: [] as number[],
    hidden: [] as boolean[],
    settings: [] as AudioSettings[],
  };
  const engine: AudioEngine = {
    unlock: () => {
      calls.unlock++;
    },
    load: () => Promise.resolve(),
    play: (id) => {
      calls.played.push(id);
      return true;
    },
    setMusic: (id) => calls.music.push(id),
    setDuck: (d) => calls.duck.push(d),
    setSettings: (s) => calls.settings.push(s),
    setHidden: (h) => calls.hidden.push(h),
    snapshot: () => {
      throw new Error('unused');
    },
  };
  return { engine, calls };
}

function setup(trusted = true) {
  const { engine, calls } = fakeEngine();
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const save = vi.fn();
  const director = createAudioDirector({
    engine,
    doc: document,
    root,
    initial: { muted: false, music: 5, sfx: 7 },
    save,
    trusted: () => trusted,
  });
  return { director, calls, root, save };
}

const key = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }));

const summary = (cleared: boolean): RunSummary => ({
  timeSec: 1,
  kills: 0,
  level: 1,
  cleared,
  characterId: 'warden',
  weapons: [],
  passives: [],
});

describe('audio director (#129)', () => {
  it('does not unlock on an untrusted synthetic keydown', () => {
    const { engine, calls } = fakeEngine();
    createAudioDirector({
      engine,
      doc: document,
      root: document.body,
      initial: { muted: false, music: 5, sfx: 7 },
    });
    key('Enter');
    document.dispatchEvent(new PointerEvent('pointerdown'));
    expect(calls.unlock).toBe(0);
  });

  it('unlocks on a trusted key or pointer gesture', () => {
    const { calls } = setup();
    key('Enter');
    document.dispatchEvent(new PointerEvent('pointerdown'));
    expect(calls.unlock).toBe(2);
  });

  it('unlocks on a gesture during the splash but starts no music and no sound', () => {
    const { director, calls } = setup();
    director.screen({ name: 'booting' });
    key('Space');
    expect(calls.unlock).toBe(1);
    expect(calls.music).toEqual([null]);
    expect(calls.played).toEqual([]);
  });

  it('toggles mute on M, saves it, and ignores M in a text field, with modifiers or repeated', () => {
    const { director, save, root } = setup();
    const seen: boolean[] = [];
    director.onSettings((s) => seen.push(s.muted));
    key('KeyM');
    expect(director.settings().muted).toBe(true);
    expect(save).toHaveBeenLastCalledWith({ muted: true, music: 5, sfx: 7 });
    const input = document.createElement('input');
    root.append(input);
    key('KeyM', {}, input);
    key('KeyM', { ctrlKey: true });
    key('KeyM', { repeat: true });
    expect(director.settings().muted).toBe(true);
    key('KeyM');
    expect(seen).toEqual([true, false]);
  });

  it('plays the click sound for every button under the root', () => {
    const { calls, root } = setup();
    const button = document.createElement('button');
    button.append(document.createElement('span'));
    root.append(button, document.createElement('p'));
    button.click();
    (button.firstChild as HTMLElement).click();
    (root.lastChild as HTMLElement).click();
    expect(calls.played).toEqual(['sfx.uiSelect', 'sfx.uiSelect']);
  });

  it('maps every screen to its music and duck', () => {
    const table: [SoundScreen, string | null, number][] = [
      [{ name: 'booting' }, null, 1],
      [{ name: 'title' }, 'music.title', 1],
      [{ name: 'characterSelect', selectedId: 'warden', purpose: 'single' }, 'music.title', 1],
      [{ name: 'multiplayerEntry', characterId: 'warden' }, 'music.title', 1],
      [{ name: 'playing', paused: false }, 'music.stage', 1],
      [{ name: 'playing', paused: true }, 'music.stage', DUCK.pause],
      [{ name: 'levelUp', level: 2, options: [] }, 'music.stage', DUCK.dialog],
      [{ name: 'chest', rewards: [] }, 'music.stage', DUCK.dialog],
      [{ name: 'results', stats: summary(false) }, 'music.title', 1],
    ];
    for (const [state, music, duck] of table) {
      expect(musicFor(state)).toBe(music);
      expect(duckFor(state)).toBe(duck);
    }
    const room = { code: 'ABCDEF', phase: 'playing', hostId: 'a', players: [] } as never;
    const versus = { room, selfId: 'a', characterId: 'warden' as const, offline: false };
    expect(duckFor({ name: 'versusPlaying', overlay: null, ...versus })).toBe(1);
    expect(
      duckFor({ name: 'versusPlaying', overlay: { kind: 'chest', rewards: [] }, ...versus }),
    ).toBe(DUCK.dialog);
    expect(musicFor({ name: 'versusPlaying', overlay: null, ...versus })).toBe('music.stage');
    expect(musicFor({ name: 'versusResult', result: {} as never, ...versus })).toBe('music.title');
  });

  it('cues each worker message once', () => {
    const { director, calls } = setup();
    director.worker({ type: 'sfx', mask: (1 << 0) | (1 << WORLD_SFX.indexOf('sfx.gemPickup')) });
    director.worker({ type: 'levelUp', level: 2, options: [] });
    director.worker({ type: 'chestOpened', rewards: [] });
    director.worker({ type: 'gameOver', stats: summary(false) });
    director.worker({ type: 'gameOver', stats: summary(true) });
    director.worker({ type: 'interferenceCollected', kind: 'swarm' });
    director.cue('sfx.interferenceReceive');
    expect(calls.played).toEqual([
      'sfx.hitWhip',
      'sfx.gemPickup',
      'sfx.levelUp',
      'sfx.chestOpen',
      'sfx.playerDeath',
      'sfx.interferenceSend',
      'sfx.interferenceReceive',
    ]);
  });

  it('suspends while the tab is hidden and resumes when it shows', () => {
    const { calls } = setup();
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls.hidden).toEqual([true, false]);
    state.mockRestore();
  });
});
