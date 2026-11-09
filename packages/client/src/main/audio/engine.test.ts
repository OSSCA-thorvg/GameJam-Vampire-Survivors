import { MAX_VOICES, MUSIC_FADE_SEC, MUSIC_GAIN, SOUND_RULES, type SfxId } from '@vs/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_SAMPLE_RATE, createAudioEngine, fetchAudioBytes, MAX_AUDIO_BYTES } from './engine';
import type { AudioEntries } from './entries';

/** A recording stand-in for the parts of Web Audio the engine uses. */
class FakeParam {
  value: number;
  calls: [string, number, number?][] = [];
  constructor(value = 1) {
    this.value = value;
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', t]);
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['ramp', v, t]);
    this.value = v;
  }
}
class FakeGain {
  gain = new FakeParam();
  connect = (): void => undefined;
  disconnect = (): void => undefined;
}
class FakeSource {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started: unknown[] | null = null;
  stoppedAt: number | null = null;
  connect = (): void => undefined;
  disconnect = (): void => undefined;
  start(...args: unknown[]) {
    this.started = args;
  }
  stop(t: number) {
    this.stoppedAt = t;
  }
  end() {
    this.onended?.();
  }
}
class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 10;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  failDecode = new Set<number>();
  calls: string[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  decodeAudioData(data: ArrayBuffer) {
    const marker = new Uint8Array(data)[0] ?? 0;
    if (this.failDecode.has(marker)) return Promise.reject(new Error('bad mp3'));
    // Every decoded buffer is 2 s, longer than the manifest's samples (WebKit's silent tail).
    return Promise.resolve({ duration: 2, marker });
  }
  resume() {
    this.calls.push('resume');
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.calls.push('suspend');
    this.state = 'suspended';
    return Promise.resolve();
  }
}

const IDS = ['sfx.hitWhip', 'sfx.levelUp', 'sfx.uiSelect', 'music.title', 'music.stage'] as const;
const entries: AudioEntries = Object.fromEntries(
  IDS.map((id, i) => [
    id,
    {
      file: `audio/${String(i)}.mp3`,
      format: 'mp3',
      samples: 22050 + i,
      loop: id.startsWith('music.'),
    },
  ]),
);

function setup(all: AudioEntries = entries) {
  let t = 1000;
  const ctx = new FakeContext();
  let created = 0;
  const engine = createAudioEngine({
    entries: all,
    baseUrl: 'http://localhost/',
    createContext: () => {
      created++;
      return ctx as unknown as AudioContext;
    },
    fetchBytes: (url) =>
      Promise.resolve(Uint8Array.of(Number(/(\d+)\.mp3$/.exec(url)?.[1] ?? 0)).buffer),
    now: () => t,
  });
  const advance = (ms: number) => {
    t += ms;
  };
  const ready = async () => {
    await engine.load();
    engine.unlock();
    await vi.waitFor(() => {
      expect(engine.snapshot().decoded).toBe(Object.keys(all).length - ctx.failDecode.size);
    });
  };
  return { engine, ctx, created: () => created, advance, ready };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('audio engine (#129)', () => {
  it('creates no context before unlock, and plays nothing while locked', async () => {
    const { engine, created } = setup();
    await engine.load();
    engine.setMusic('music.title');
    expect(engine.play('sfx.hitWhip')).toBe(false);
    expect(created()).toBe(0);
    expect(engine.snapshot()).toMatchObject({
      unlocked: false,
      contextState: 'none',
      music: null,
      decoded: 0,
    });
  });

  it('unlocks once, resumes the context and decodes every file', async () => {
    const { engine, ctx, created, ready } = setup();
    await ready();
    engine.unlock();
    expect(created()).toBe(1);
    expect(ctx.calls.filter((c) => c === 'resume')).toHaveLength(1);
    expect(engine.snapshot()).toMatchObject({
      unlocked: true,
      contextState: 'running',
      decoded: 5,
    });
  });

  it('plays a one-shot for the manifest length, not the decoded tail', async () => {
    const { engine, ctx, ready } = setup();
    await ready();
    expect(engine.play('sfx.levelUp')).toBe(true);
    const source = ctx.sources.at(-1);
    expect(source?.started).toEqual([0, 0, (22050 + 1) / AUDIO_SAMPLE_RATE]);
    expect(engine.snapshot().played['sfx.levelUp']).toBe(1);
  });

  it('holds minIntervalMs and maxVoices per sound, dropping new starts', async () => {
    const { engine, ctx, advance, ready } = setup();
    await ready();
    const rule = SOUND_RULES['sfx.hitWhip'];
    expect(engine.play('sfx.hitWhip')).toBe(true);
    advance(rule.minIntervalMs - 1);
    expect(engine.play('sfx.hitWhip')).toBe(false);
    for (let i = 1; i < rule.maxVoices; i++) {
      advance(rule.minIntervalMs);
      expect(engine.play('sfx.hitWhip')).toBe(true);
    }
    advance(rule.minIntervalMs);
    expect(engine.play('sfx.hitWhip')).toBe(false);
    expect(engine.snapshot().voicesById['sfx.hitWhip']).toBe(rule.maxVoices);
    // Old voices are never stopped; one ending frees a slot.
    expect(ctx.sources.every((s) => s.stoppedAt === null)).toBe(true);
    ctx.sources[0]?.end();
    expect(engine.play('sfx.hitWhip')).toBe(true);
  });

  it('holds the global voice cap', async () => {
    const many: AudioEntries = {};
    const ids = Object.keys(SOUND_RULES) as SfxId[];
    ids.forEach((id, i) => {
      many[id] = { file: `audio/${String(i)}.mp3`, format: 'mp3', samples: 100, loop: false };
    });
    const { engine, advance, ready } = setup(many);
    await ready();
    let started = 0;
    for (let round = 0; round < 10; round++) {
      for (const id of ids) if (engine.play(id)) started++;
      advance(1000);
    }
    expect(started).toBe(MAX_VOICES);
    expect(engine.snapshot().voices).toBe(MAX_VOICES);
  });

  it('is silent while muted or hidden; hidden suspends and visible resumes', async () => {
    const { engine, ctx, advance, ready } = setup();
    await ready();
    engine.setSettings({ muted: true, music: 5, sfx: 7 });
    expect(engine.play('sfx.levelUp')).toBe(false);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    engine.setSettings({ muted: false, music: 5, sfx: 7 });
    engine.setHidden(true);
    expect(ctx.state).toBe('suspended');
    advance(1000);
    expect(engine.play('sfx.levelUp')).toBe(false);
    engine.setHidden(false);
    expect(ctx.state).toBe('running');
    expect(engine.play('sfx.levelUp')).toBe(true);
    expect(engine.snapshot().played['sfx.levelUp']).toBe(1);
  });

  it('sets the bus gains from the settings and the duck', async () => {
    const { engine, ctx, ready } = setup();
    await ready();
    const [master, musicBus, sfxBus] = ctx.gains;
    expect(master?.gain.value).toBe(1);
    expect(musicBus?.gain.value).toBeCloseTo(MUSIC_GAIN * 0.25, 6);
    expect(sfxBus?.gain.value).toBeCloseTo(0.49, 6);
    engine.setDuck(0.3);
    expect(musicBus?.gain.value).toBeCloseTo(MUSIC_GAIN * 0.25 * 0.3, 6);
    expect(engine.snapshot().duck).toBe(0.3);
    engine.setSettings({ muted: false, music: 10, sfx: 0 });
    expect(musicBus?.gain.value).toBeCloseTo(MUSIC_GAIN * 0.3, 6);
    expect(sfxBus?.gain.value).toBe(0);
  });

  it('starts the wished music once unlocked, loops it on the manifest length and crossfades', async () => {
    const { engine, ctx, ready } = setup();
    engine.setMusic('music.title');
    await ready();
    expect(engine.snapshot().music).toBe('music.title');
    const title = ctx.sources.find((s) => s.loop);
    expect(title).toMatchObject({ loopStart: 0, loopEnd: (22050 + 3) / AUDIO_SAMPLE_RATE });
    engine.setMusic('music.title');
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(1);
    engine.setMusic('music.stage');
    expect(title?.stoppedAt).toBe(10 + MUSIC_FADE_SEC);
    const stage = ctx.sources.filter((s) => s.loop)[1];
    expect(stage?.loopEnd).toBe((22050 + 4) / AUDIO_SAMPLE_RATE);
    const fadeIn = ctx.gains.at(-1)?.gain.calls.at(-1);
    expect(fadeIn).toEqual(['ramp', 1, 10 + MUSIC_FADE_SEC]);
    expect(engine.snapshot().music).toBe('music.stage');
    engine.setMusic(null);
    expect(stage?.stoppedAt).toBe(10 + MUSIC_FADE_SEC);
    expect(engine.snapshot().music).toBeNull();
  });

  it('keeps a failed decode silent with one grouped warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { engine, ctx, ready } = setup();
    ctx.failDecode.add(0).add(1);
    await ready();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledTimes(1);
    });
    expect(engine.snapshot().failed.sort()).toEqual(['sfx.hitWhip', 'sfx.levelUp']);
    expect(engine.play('sfx.hitWhip')).toBe(false);
    expect(engine.play('sfx.uiSelect')).toBe(true);
  });

  it('plays a sound asked for during its decode once it decodes', async () => {
    const { engine } = setup();
    await engine.load();
    engine.unlock();
    expect(engine.play('sfx.uiSelect')).toBe(false);
    await vi.waitFor(() => {
      expect(engine.snapshot().played['sfx.uiSelect']).toBe(1);
    });
  });
});

describe('fetchAudioBytes', () => {
  it('refuses a body over 1 MiB and never follows redirects', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array(MAX_AUDIO_BYTES + 1), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAudioBytes('http://localhost/a.mp3')).rejects.toThrow(/bytes/);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/a.mp3', { redirect: 'error' });
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(Uint8Array.of(1, 2, 3))));
    expect(new Uint8Array(await fetchAudioBytes('http://localhost/a.mp3'))).toEqual(
      Uint8Array.of(1, 2, 3),
    );
    vi.unstubAllGlobals();
  });
});
