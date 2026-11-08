import { Buffer } from 'node:buffer';
import { expect, it } from 'vitest';
import { inspectPng, pngCrc } from './png';

const png = (): Uint8Array =>
  Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGGjACGNo3Pn/H5uC6yULsWvckADWy0SpC5hGDWAYDQOGQRAGAw8A6PoGGEpWSQkAAAAASUVORK5CYII=',
      'base64',
    ),
  );

it('checks an actual RGBA PNG framing, CRC, dimensions and decoded budget', () => {
  expect(inspectPng(png(), [16, 16])).toEqual({ width: 16, height: 16, decodedBytes: 1024 });
  expect(() => inspectPng(png(), [32, 32])).toThrow(/dimensions/);
});

it('rejects HTML, truncation, appended data and corrupt chunks before decoding', () => {
  expect(() => inspectPng(new Uint8Array(100))).toThrow();
  const corrupt = png();
  corrupt[50] = (corrupt[50] ?? 0) ^ 1;
  expect(() => inspectPng(corrupt)).toThrow(/checksum/);
  expect(() => inspectPng(png().subarray(0, 80))).toThrow();
  const appended = new Uint8Array(png().length + 1);
  appended.set(png());
  expect(() => inspectPng(appended)).toThrow(/ending/);
});

it.each([
  ['oversized', 4096, 8, 6],
  ['no alpha', 16, 8, 2],
  ['16-bit', 16, 16, 6],
])('rejects %s PNG headers with a valid checksum', (_name, width, depth, color) => {
  const bytes = png();
  new DataView(bytes.buffer).setUint32(16, width);
  bytes[24] = depth;
  bytes[25] = color;
  new DataView(bytes.buffer).setUint32(29, pngCrc(bytes, 12, 29));
  expect(() => inspectPng(bytes)).toThrow();
});
