// Pure helpers for the audio authoring workflow (ADR 0021, issue #128): no downloads, no file system.
import { createHash } from 'node:crypto';

/** The seeded PRNG of `packages/shared/src/random.ts` (mulberry32), as a `Math.random` replacement. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOLDERS = { sfx: 'audio/sfx', music: 'audio/music' };

/** The naming rule of `assets/README.md`: `sfx.hitMagicWand` is `audio/sfx/hit-magic-wand.mp3`. */
export function kebab(id) {
  const match = /^(sfx|music)\.([a-z][A-Za-z0-9]*)$/.exec(id);
  if (!match) throw new Error(`Not an audio ID: ${id}`);
  const name = match[2].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return `${FOLDERS[match[1]]}/${name}.mp3`;
}

/** 16-bit PCM of `samples × gain`; throws, naming the ID, if any sample would clip. */
export function toPcm16(samples, gain, id = 'sound') {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const value = (samples[i] ?? 0) * gain;
    if (!Number.isFinite(value) || Math.abs(value) > 1)
      throw new Error(`${id}: sample ${String(i)} clips (${String(value)}); lower its gain`);
    pcm[i] = Math.round(value * 32767);
  }
  return pcm;
}

/** Drops the trailing samples whose magnitude is below one 16-bit step. */
export function trimTail(samples) {
  let end = samples.length;
  while (end > 0 && Math.abs(samples[end - 1] ?? 0) < 1 / 32768) end--;
  return samples.slice(0, end);
}

/** Samples `[n, 2n)` of a stereo render, mixed to mono as `(l + r) / 2`. */
export function loopWindow(left, right, n) {
  if (left.length < 2 * n || right.length < 2 * n)
    throw new Error(
      `loopWindow: render has ${String(left.length)} samples, needs ${String(2 * n)}`,
    );
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = ((left[n + i] ?? 0) + (right[n + i] ?? 0)) / 2;
  return out;
}

/** A mono 16-bit RIFF WAVE file. */
export function wavBytes(pcm, sampleRate) {
  const data = pcm.length * 2;
  const view = new DataView(new ArrayBuffer(44 + data));
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i] ?? 0, true);
  return new Uint8Array(view.buffer);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
