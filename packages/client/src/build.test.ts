import { readdirSync, statSync } from 'node:fs';
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
