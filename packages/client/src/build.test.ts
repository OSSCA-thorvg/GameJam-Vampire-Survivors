import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('ships only the nonempty ThorVG WASM file loaded by the worker', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const wasmFiles = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.wasm'),
  );

  expect(wasmFiles).toEqual([join('thorvg', 'thorvg.wasm')]);
  expect(statSync(join(dist, 'thorvg', 'thorvg.wasm')).size).toBeGreaterThan(0);
});

it('excludes the development asset gallery from production JavaScript', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.js'),
  )) {
    const source = readFileSync(join(dist, file), 'utf8');
    expect(source).not.toContain('lottieFrame');
    expect(source).not.toContain('gallery');
  }
});

it('excludes the stress scene and its counters from normal production JavaScript', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.js'),
  )) {
    const source = readFileSync(join(dist, file), 'utf8');
    expect(source).not.toContain('paintsCreated');
    expect(source).not.toContain('churnCycles');
    expect(source).not.toContain('unsupported scenario');
  }
});
