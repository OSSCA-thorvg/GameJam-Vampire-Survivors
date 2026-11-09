// Renders scripts/audio/sounds.json to mono 16-bit WAV files with pinned ZzFX and ZzFXM (ADR 0021, issue #128).
// Run by scripts/make-audio.sh, which downloads and checks both libraries:
//   node scripts/audio/render-audio.mjs --zzfx <ZzFX.mjs> --zzfxm <zzfxm.mjs> --sounds <sounds.json> --out <dir>
// Writes <out>/<id>.wav for every sound and <out>/render.json ({ <id>: { samples, pcmSha256 } }).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loopWindow, mulberry32, sha256, toPcm16, trimTail, wavBytes } from './audio-lib.mjs';

const SAMPLE_RATE = 44100;
/** ADR 0021 limits, checked before encoding (the MP3 byte budgets are checked by make-audio.sh and the tests). */
const MAX_SFX_SAMPLES = 2 * SAMPLE_RATE;
const MAX_MUSIC_SAMPLES = 70 * SAMPLE_RATE;
const ID = /^(sfx|music)\.[a-z][A-Za-z0-9]*$/;

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined)
      throw new Error(`Bad argument ${String(key)}`);
    out[key.slice(2)] = value;
  }
  for (const key of ['zzfx', 'zzfxm', 'sounds', 'out'])
    if (!out[key]) throw new Error(`Missing --${key}`);
  return out;
}

/** JSON has no `undefined`; a `null` slot means ZzFX's default for that parameter. */
const defaults = (params) => params.map((value) => (value === null ? undefined : value));

function numbers(value, what) {
  if (!Array.isArray(value) || value.some((n) => n !== null && !Number.isFinite(n)))
    throw new Error(`${what} must be an array of numbers or null`);
  return value;
}

function checkEntry(id, entry, kind) {
  if (!ID.test(id) || !id.startsWith(kind + '.')) throw new Error(`${id}: invalid ${kind} ID`);
  if (!Number.isInteger(entry?.seed) || !Number.isFinite(entry.gain) || entry.gain <= 0)
    throw new Error(`${id}: needs an integer seed and a positive gain`);
}

/** The song rendered three times; the middle pass is the loop, checked against the third. */
function renderSong(id, entry, zzfxM) {
  const [instruments, patterns, sequence] = entry.song;
  if (!Number.isFinite(entry.bpm) || entry.bpm <= 0) throw new Error(`${id}: invalid bpm`);
  if (!Array.isArray(instruments) || !Array.isArray(patterns) || !Array.isArray(sequence))
    throw new Error(`${id}: song is [instruments, patterns, sequence]`);
  const voices = instruments.map((params, i) => defaults(numbers(params, `${id} instrument ${i}`)));
  let rows = 0;
  for (const index of sequence) {
    const pattern = patterns[index];
    if (!Array.isArray(pattern) || !pattern.length) throw new Error(`${id}: no pattern ${index}`);
    const length = pattern[0].length;
    for (const [c, channel] of pattern.entries()) {
      numbers(channel, `${id} pattern ${index} channel ${c}`);
      if (channel.length !== length)
        throw new Error(`${id}: pattern ${index} channel ${c} has a different row count`);
      if (!voices[channel[0]]) throw new Error(`${id}: pattern ${index} channel ${c} instrument`);
    }
    rows += length - 2;
  }
  const beat = ((SAMPLE_RATE / entry.bpm) * 60) >> 2;
  const n = rows * beat;
  const [left, right] = zzfxM(voices, patterns, [...sequence, ...sequence, ...sequence], entry.bpm);
  // The middle pass loops seamlessly only if the third pass continues it exactly (ZzFXM fades the last beat).
  for (let i = 0; i < n - beat; i++)
    if (left[n + i] !== left[2 * n + i] || right[n + i] !== right[2 * n + i])
      throw new Error(`${id}: pass 3 differs from pass 2 at sample ${i}; a note is held too long`);
  return { samples: loopWindow(left, right, n), rows, beat };
}

async function main() {
  const options = args(process.argv.slice(2));
  // ZzFX creates an AudioContext when imported; rendering never uses it, so any constructible stub will do.
  globalThis.AudioContext = Object;
  globalThis.zzfxR = SAMPLE_RATE;
  globalThis.zzfxM = undefined; // zzfxm.js assigns this global; a module is strict, so it must exist first
  const { ZZFX } = await import(pathToFileURL(resolve(options.zzfx)).href);
  globalThis.zzfxG = (...params) => ZZFX.buildSamples(...params);
  await import(pathToFileURL(resolve(options.zzfxm)).href);
  const zzfxM = globalThis.zzfxM;
  if (typeof ZZFX?.buildSamples !== 'function' || typeof zzfxM !== 'function')
    throw new Error('ZzFX or ZzFXM did not load');
  if (ZZFX.sampleRate !== SAMPLE_RATE) throw new Error('ZzFX sample rate is not 44100');

  const sounds = JSON.parse(readFileSync(options.sounds, 'utf8'));
  if (sounds.version !== 1) throw new Error('sounds.json: expected version 1');
  mkdirSync(options.out, { recursive: true });
  const report = {};
  const random = Math.random;
  try {
    for (const kind of ['sfx', 'music'])
      for (const [id, entry] of Object.entries(sounds[kind] ?? {})) {
        checkEntry(id, entry, kind);
        Math.random = mulberry32(entry.seed);
        let samples;
        let detail = '';
        if (kind === 'sfx') {
          samples = trimTail(ZZFX.buildSamples(...defaults(numbers(entry.params, `${id} params`))));
          if (!samples.length || samples.length > MAX_SFX_SAMPLES)
            throw new Error(`${id}: ${samples.length} samples, outside 1..${MAX_SFX_SAMPLES}`);
        } else {
          const song = renderSong(id, entry, zzfxM);
          samples = song.samples;
          detail = ` ${song.rows} rows × ${song.beat}`;
          if (samples.length > MAX_MUSIC_SAMPLES)
            throw new Error(`${id}: ${samples.length} samples, over ${MAX_MUSIC_SAMPLES}`);
        }
        let peak = 0;
        for (const value of samples) peak = Math.max(peak, Math.abs(value));
        const pcm = toPcm16(samples, entry.gain, id);
        writeFileSync(join(options.out, `${id}.wav`), wavBytes(pcm, SAMPLE_RATE));
        const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        report[id] = { samples: pcm.length, pcmSha256: sha256(pcmBytes) };
        console.error(
          `${id}: ${pcm.length} samples (${(pcm.length / SAMPLE_RATE).toFixed(3)} s)${detail}, peak ${(peak * entry.gain).toFixed(4)}`,
        );
      }
  } finally {
    Math.random = random;
  }
  writeFileSync(join(options.out, 'render.json'), JSON.stringify(report, null, 2) + '\n');
}

await main();
