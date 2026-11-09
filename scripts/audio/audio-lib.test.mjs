import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  kebab,
  loopWindow,
  mulberry32,
  sha256,
  toPcm16,
  trimTail,
  wavBytes,
} from './audio-lib.mjs';

test('mulberry32 repeats for a seed and differs between seeds', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.ok(first.every((value) => value >= 0 && value < 1));
  assert.notEqual(mulberry32(8)(), first[0]);
});

test('kebab maps audio IDs to their files and rejects other namespaces', () => {
  assert.equal(kebab('sfx.hitMagicWand'), 'audio/sfx/hit-magic-wand.mp3');
  assert.equal(kebab('music.title'), 'audio/music/title.mp3');
  assert.throws(() => kebab('fx.levelUp'), /Not an audio ID/);
});

test('toPcm16 scales to 16 bits and names the ID of a clipping sound', () => {
  assert.deepEqual([...toPcm16([0, 0.5, -1], 1)], [0, 16384, -32767]);
  assert.deepEqual([...toPcm16([0.4], 2)], [26214]);
  assert.throws(() => toPcm16([0.6], 2, 'sfx.hitAxe'), /sfx\.hitAxe: sample 0 clips/);
});

test('trimTail drops only the trailing samples below one 16-bit step', () => {
  assert.deepEqual([...trimTail(new Float32Array([0, 0.5, 0, 1e-6, 0]))], [0, 0.5]);
  assert.equal(trimTail(new Float32Array([0, 0])).length, 0);
});

test('loopWindow takes the second pass and mixes it to mono', () => {
  assert.deepEqual([...loopWindow([1, 1, 0.5, 0.25, 9], [1, 1, 0.5, -0.25, 9], 2)], [0.5, 0]);
  assert.throws(() => loopWindow([1, 2, 3], [1, 2, 3], 2), /needs 4/);
});

test('wavBytes writes a mono 16-bit RIFF header and little-endian samples', () => {
  const bytes = wavBytes(new Int16Array([1, -2]), 44100);
  const view = new DataView(bytes.buffer);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.subarray(8, 16)), 'WAVEfmt ');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 4);
  assert.deepEqual([view.getInt16(44, true), view.getInt16(46, true)], [1, -2]);
  assert.equal(bytes.length, 48);
});

test('sha256 hashes bytes as lowercase hex', () => {
  assert.equal(
    sha256(new Uint8Array()),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});
