// The sound engine (#129, ADRs 0004 and 0021): Web Audio on the main thread, since the worker has no `AudioContext`.
// Files are fetched once after the boot assets; the context is created only inside the first trusted gesture
// (browser autoplay policy), and then every file is decoded once into an `AudioBuffer`. Sound effects start one
// buffer source each under per-sound and global voice caps; music loops crossfade on their own bus. Playback lengths
// and loop points come from the manifest's `samples`, never from the decoded buffer: WebKit decodes five effects with
// up to 1152 frames of extra silent tail (#128).
import {
  DEFAULT_AUDIO_SETTINGS,
  MAX_VOICES,
  MUSIC_FADE_SEC,
  MUSIC_GAIN,
  SOUND_RULES,
  type AudioAssetId,
  type AudioSettings,
  type MusicId,
  type SfxId,
} from '@vs/shared';
import type { AudioEntries } from './entries';

/** The rate `samples` counts at (ADR 0021: mono 44.1 kHz). */
export const AUDIO_SAMPLE_RATE = 44100;
/** A file larger than this is refused (ADR 0021's largest loop is about 0.64 MB). */
export const MAX_AUDIO_BYTES = 1024 * 1024;
/** Seconds of every bus gain ramp. */
const GAIN_RAMP_SEC = 0.05;
/** A one-shot asked for while its buffer was still decoding still plays if it decodes within this many ms. */
const PENDING_PLAY_MS = 300;

export interface AudioSnapshot {
  unlocked: boolean;
  contextState: 'none' | AudioContextState;
  /** Buffers decoded and ready. */
  decoded: number;
  /** IDs whose fetch or decode failed; they stay silent. */
  failed: AudioAssetId[];
  /** The music loop playing now, `null` while locked, before it decoded, or on the splash. */
  music: MusicId | null;
  duck: number;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  hidden: boolean;
  /** Live sound-effect voices, in total and by ID. */
  voices: number;
  voicesById: Partial<Record<SfxId, number>>;
  /** Sound effects started since boot, by ID. */
  played: Partial<Record<SfxId, number>>;
}

export interface AudioEngine {
  /** Creates and resumes the context; idempotent. Call synchronously inside a trusted gesture. */
  unlock(): void;
  /** Fetches every audio file once. */
  load(): Promise<void>;
  /** Starts a sound effect; `false` when it was dropped (locked, muted, hidden, undecoded, or over a limit). */
  play(id: SfxId): boolean;
  /** Crossfades to `id`'s loop, or fades out for `null`; remembered while locked or still decoding. */
  setMusic(id: MusicId | null): void;
  /** The music's duck factor, 1 for none. */
  setDuck(level: number): void;
  setSettings(s: AudioSettings): void;
  /** A hidden tab suspends the context, a visible one resumes it. */
  setHidden(hidden: boolean): void;
  snapshot(): AudioSnapshot;
}

export interface AudioEngineOptions {
  /** The manifest's audio entries, or the promise of them (`loadAudioEntries`). */
  entries: AudioEntries | Promise<AudioEntries>;
  baseUrl: string;
  createContext?: () => AudioContext;
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  /** Milliseconds, for `minIntervalMs`. */
  now?: () => number;
}

/** Same-origin fetch that never follows a redirect and cancels a body over `MAX_AUDIO_BYTES`. */
export async function fetchAudioBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES) {
    await response.body?.cancel();
    throw new Error(`HTTP ${String(response.status)} or over ${String(MAX_AUDIO_BYTES)} bytes`);
  }
  if (!response.body) throw new Error('no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        completed = true;
        break;
      }
      size += result.value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error(`over ${String(MAX_AUDIO_BYTES)} bytes`);
      chunks.push(result.value);
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
}

interface MusicVoice {
  id: MusicId;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const squared = (step: number): number => (step / 10) ** 2;

export function createAudioEngine(opts: AudioEngineOptions): AudioEngine {
  const createContext =
    opts.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
  const fetchBytes = opts.fetchBytes ?? fetchAudioBytes;
  const now = opts.now ?? (() => performance.now());
  let entries: AudioEntries = {};
  const entriesReady = Promise.resolve(opts.entries).then((e) => {
    entries = e;
  });

  let graph: Graph | null = null;
  let unlocked = false;
  let hidden = false;
  let settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  let duck = 1;
  const bytes = new Map<AudioAssetId, ArrayBuffer>();
  const buffers = new Map<AudioAssetId, AudioBuffer>();
  const decoding = new Set<AudioAssetId>();
  const failed = new Set<AudioAssetId>();
  /** Failures since the last grouped warning. */
  let unreported: string[] = [];
  const lastStart = new Map<SfxId, number>();
  const voicesById = new Map<SfxId, number>();
  let voices = 0;
  const played = new Map<SfxId, number>();
  const pendingPlays = new Map<SfxId, number>();
  let wantMusic: MusicId | null = null;
  let music: MusicVoice | null = null;

  const ramp = (param: AudioParam, value: number, ctx: AudioContext, sec = GAIN_RAMP_SEC): void => {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + sec);
  };

  const applyGains = (): void => {
    if (!graph) return;
    const { ctx } = graph;
    ramp(graph.master.gain, settings.muted ? 0 : 1, ctx);
    ramp(graph.musicBus.gain, MUSIC_GAIN * squared(settings.music) * duck, ctx);
    ramp(graph.sfxBus.gain, squared(settings.sfx), ctx);
  };

  const fail = (id: AudioAssetId, error: unknown): void => {
    failed.add(id);
    unreported.push(`${id} (${error instanceof Error ? error.message : String(error)})`);
  };

  const reportFailures = (): void => {
    if (decoding.size > 0 || unreported.length === 0) return;
    console.warn(
      `[audio] ${String(unreported.length)} sounds stay silent: ${unreported.join(', ')}`,
    );
    unreported = [];
  };

  /** The manifest's length of `id` in seconds, or the buffer's when the entry is missing. */
  const lengthSec = (id: AudioAssetId, buffer: AudioBuffer): number => {
    const samples = entries[id]?.samples;
    return samples === undefined
      ? buffer.duration
      : Math.min(buffer.duration, samples / AUDIO_SAMPLE_RATE);
  };

  const syncMusic = (): void => {
    if (!graph || music?.id === wantMusic) return;
    const { ctx } = graph;
    const next = wantMusic === null ? undefined : buffers.get(wantMusic);
    // Keep the current loop until the wished one decoded; fade out only for silence or a ready replacement.
    if (wantMusic !== null && !next) return;
    if (music) {
      const old = music;
      ramp(old.gain.gain, 0, ctx, MUSIC_FADE_SEC);
      old.source.stop(ctx.currentTime + MUSIC_FADE_SEC);
      music = null;
    }
    if (wantMusic === null || !next) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(graph.musicBus);
    const source = ctx.createBufferSource();
    source.buffer = next;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = lengthSec(wantMusic, next);
    source.connect(gain);
    source.start();
    ramp(gain.gain, 1, ctx, MUSIC_FADE_SEC);
    music = { id: wantMusic, source, gain };
  };

  const decodeAll = (): void => {
    if (!graph) return;
    const { ctx } = graph;
    for (const [id, data] of bytes) {
      bytes.delete(id);
      decoding.add(id);
      ctx
        .decodeAudioData(data)
        .then(
          (buffer) => {
            buffers.set(id, buffer);
            if (id.startsWith('music.')) syncMusic();
            else {
              const asked = pendingPlays.get(id as SfxId);
              pendingPlays.delete(id as SfxId);
              if (asked !== undefined && now() - asked <= PENDING_PLAY_MS) engine.play(id as SfxId);
            }
          },
          (error: unknown) => {
            fail(id, error);
          },
        )
        .finally(() => {
          decoding.delete(id);
          reportFailures();
        });
    }
  };

  const engine: AudioEngine = {
    unlock() {
      if (graph) {
        // A browser may suspend a running context (WebKit interruptions); a later gesture resumes it.
        if (!hidden && graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => undefined);
        return;
      }
      let ctx: AudioContext;
      try {
        ctx = createContext();
      } catch (error) {
        console.warn(
          `[audio] no AudioContext: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      unlocked = true;
      if (!hidden) ctx.resume().catch(() => undefined);
      const master = ctx.createGain();
      const musicBus = ctx.createGain();
      const sfxBus = ctx.createGain();
      master.connect(ctx.destination);
      musicBus.connect(master);
      sfxBus.connect(master);
      graph = { ctx, master, musicBus, sfxBus };
      applyGains();
      if (hidden) ctx.suspend().catch(() => undefined);
      decodeAll();
    },
    async load() {
      await entriesReady;
      await Promise.all(
        (Object.keys(entries) as AudioAssetId[]).map(async (id) => {
          const entry = entries[id];
          if (!entry || bytes.has(id) || buffers.has(id) || decoding.has(id)) return;
          try {
            bytes.set(id, await fetchBytes(new URL(entry.file, opts.baseUrl).href));
          } catch (error) {
            fail(id, error);
          }
        }),
      );
      reportFailures();
      decodeAll();
    },
    play(id) {
      if (!graph || settings.muted || hidden) return false;
      const buffer = buffers.get(id);
      if (!buffer) {
        if (decoding.has(id) || bytes.has(id)) pendingPlays.set(id, now());
        return false;
      }
      const rule = SOUND_RULES[id];
      const t = now();
      const last = lastStart.get(id);
      if (last !== undefined && t - last < rule.minIntervalMs) return false;
      const live = voicesById.get(id) ?? 0;
      if (live >= rule.maxVoices || voices >= MAX_VOICES) return false;
      const { ctx } = graph;
      const gain = ctx.createGain();
      gain.gain.value = rule.gain;
      gain.connect(graph.sfxBus);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => {
        voices--;
        voicesById.set(id, (voicesById.get(id) ?? 1) - 1);
        source.disconnect();
        gain.disconnect();
      };
      source.start(0, 0, lengthSec(id, buffer));
      lastStart.set(id, t);
      voices++;
      voicesById.set(id, live + 1);
      played.set(id, (played.get(id) ?? 0) + 1);
      return true;
    },
    setMusic(id) {
      wantMusic = id;
      syncMusic();
    },
    setDuck(level) {
      if (level === duck) return;
      duck = level;
      applyGains();
    },
    setSettings(s) {
      settings = { muted: s.muted, music: s.music, sfx: s.sfx };
      applyGains();
    },
    setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      if (!graph) return;
      if (hidden) graph.ctx.suspend().catch(() => undefined);
      else graph.ctx.resume().catch(() => undefined);
    },
    snapshot() {
      return {
        unlocked,
        contextState: graph ? graph.ctx.state : 'none',
        decoded: buffers.size,
        failed: [...failed],
        music: music?.id ?? null,
        duck,
        muted: settings.muted,
        musicVolume: settings.music,
        sfxVolume: settings.sfx,
        hidden,
        voices,
        voicesById: Object.fromEntries(voicesById),
        played: Object.fromEntries(played),
      };
    },
  };
  return engine;
}
