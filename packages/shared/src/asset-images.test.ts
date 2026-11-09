import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { inspectPng } from './png';
import { validateLottie } from './lottie';
import { lottieProfile } from './lottie-motion';
import { collectAssetGraph } from '../../../scripts/assets/motion_graph';
import { parseCatalog } from './catalog';
import { validateManifest } from './assets';

const assets = new URL('../../../assets/', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, assets), 'utf8');
const rows = parseCatalog(read('CATALOG.md'));
const byId = new Map(rows.map((row) => [row.id, row]));
interface Entry {
  file: string;
  format: string;
  size?: [number, number];
  filter?: string;
}
const manifest = JSON.parse(read('manifest.json')) as { assets: Record<string, Entry> };
const entries = Object.entries(manifest.assets);

/** Decode bounded RGBA scanlines with Node's built-in zlib, independently of the browser/native decoder. */
function decodePng(bytes: Buffer, expected?: readonly [number, number]): Uint8Array {
  const { width, height } = inspectPng(bytes, expected);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const stride = width * 4;
  const data = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  if (data.length !== (stride + 1) * height) throw new Error('PNG scanline length mismatch');
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)] ?? -1;
    if (filter < 0 || filter > 4) throw new Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? (pixels[index - 4] ?? 0) : 0;
      const above = y > 0 ? (pixels[index - stride] ?? 0) : 0;
      const diagonal = x >= 4 && y > 0 ? (pixels[index - stride - 4] ?? 0) : 0;
      const p = left + above - diagonal;
      const pa = Math.abs(p - left),
        pb = Math.abs(p - above),
        pc = Math.abs(p - diagonal);
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? above : diagonal;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth;
      pixels[index] = ((data[y * (stride + 1) + x + 1] ?? 0) + predictor) & 255;
    }
  }
  return pixels;
}

it('independently decodes PNG scanline filters and alpha with bounded zlib', () => {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGGjACGNo3Pn/H5uC6yULsWvckADWy0SpC5hGDWAYDQOGQRAGAw8A6PoGGEpWSQkAAAAASUVORK5CYII=',
    'base64',
  );
  const pixels = decodePng(bytes, [16, 16]);
  expect([...pixels.subarray((2 * 16 + 2) * 4, (2 * 16 + 2) * 4 + 4)]).toEqual([40, 220, 255, 255]);
  expect([...pixels.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
});

it('preserves the licensed font and its provenance byte-for-byte', () => {
  const font = readFileSync(new URL('fonts/hud.ttf', assets));
  expect(font.byteLength).toBe(9400);
  expect(createHash('sha256').update(font).digest('hex')).toBe(
    'dc8bbbd58c5b5404ec1eb392b6aedeb81904869b1009ec9b1ba056e4cb310dd0',
  );
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('fonts/LICENSE-NotoSansMono.txt', assets)))
      .digest('hex'),
  ).toBe('c8ecec88c61d46a864394a1780568aa6aaf6ad161ddb8d625bfda6a7d053357f');
});

it('generated static PNGs decode at four-times logical size with appropriate alpha', () => {
  const pngs = entries.filter(([, entry]) => entry.format === 'png');
  expect(pngs.length).toBeGreaterThan(0);
  for (const [id, entry] of pngs) {
    const size = byId.get(id)?.size;
    if (!size) throw new Error(`${id}: missing logical size`);
    const pixels = decodePng(readFileSync(new URL(entry.file, assets)), [size[0] * 4, size[1] * 4]);
    expect(entry.filter, id).toBe('nearest');
    let transparent = false;
    for (let i = 3; i < pixels.length; i += 4) if ((pixels[i] ?? 255) < 255) transparent = true;
    expect(transparent, id).toBe(!['stage.ground', 'ui.hpBar'].includes(id));
  }
});

it('Lottie resources decode within their owner and preserve the original effect and diagnostic timelines', () => {
  for (const [id, entry] of entries.filter(([, value]) => value.format === 'lottie')) {
    const value: unknown = JSON.parse(read(entry.file));
    const animation = validateLottie(value, entry.file, lottieProfile(id));
    expect([animation.width, animation.height], id).toEqual(entry.size);
    if (id === 'fx.levelUp' || id === 'fx.chestOpen' || id === 'enemy.lottieTest') {
      expect(animation.fps, id).toBe(30);
      expect(animation.firstFrame, id).toBe(0);
      expect(animation.lastFrame, id).toBe(id === 'fx.chestOpen' ? 24 : 30);
    }
    if (id === 'enemy.lottieTest') expect(animation.images).toHaveLength(0);
    if (id === 'ui.splash') {
      expect([animation.fps, animation.firstFrame, animation.lastFrame], id).toEqual([30, 0, 210]);
      expect(animation.images, id).toHaveLength(1);
      expect(entry).toMatchObject({ loop: false, filter: 'bilinear' });
    }
    for (const image of animation.images) {
      const path = entry.file.slice(0, entry.file.lastIndexOf('/') + 1) + image.path;
      decodePng(readFileSync(new URL(path, assets)), [image.width, image.height]);
    }
  }
});

it('installs an exact format-aware primary/resource graph with no missing or orphan files', () => {
  expect(entries).toHaveLength(86);
  expect(entries.filter(([, entry]) => entry.format === 'lottie')).toHaveLength(38);
  expect(entries.filter(([, entry]) => entry.format === 'ttf')).toHaveLength(1);
  const parsed = validateManifest(JSON.parse(read('manifest.json')));
  expect(parsed.errors).toEqual([]);
  expect(parsed.missing).toEqual([]);
  const graph = collectAssetGraph({ directory: fileURLToPath(assets), manifest: parsed.manifest });
  expect(graph.logicalIds).toEqual(entries.map(([id]) => id).sort());
  expect(graph.motionIds).toHaveLength(36);
  expect(graph.diagnosticIds).toEqual(['enemy.lottieTest']);
  expect(graph.splashIds).toEqual(['ui.splash']);
  expect(graph.files.filter((file) => file.role === 'primary')).toHaveLength(entries.length - 1);
  expect(graph.files.filter((file) => file.role === 'splash')).toHaveLength(2);
  expect(graph.files.filter((file) => file.role === 'owned-image').length).toBeGreaterThan(0);
});

it('keeps the native HP fill rectangle dark and empty rather than baking in health', () => {
  const entry = manifest.assets['ui.hpBar'];
  if (!entry) throw new Error('Missing HP track');
  const pixels = decodePng(readFileSync(new URL(entry.file, assets)), [160, 24]);
  let brightInnerPixels = 0;
  for (let y = 4; y < 20; y++)
    for (let x = 4; x < 156; x++) {
      const index = (y * 160 + x) * 4;
      if (Math.max(pixels[index] ?? 255, pixels[index + 1] ?? 255, pixels[index + 2] ?? 255) > 80)
        brightInnerPixels++;
    }
  expect(brightInnerPixels).toBe(0);
});
