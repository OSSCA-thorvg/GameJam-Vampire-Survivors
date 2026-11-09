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

/**
 * #22's safety fact: the normal production bundle ships the perf overlay behind `?perf` but no debug keys, cheats or
 * stress scenarios. Only string literals are checked: minification renames functions such as `registerDebugKey`, so
 * their absence would prove nothing.
 */
it('ships the ?perf overlay but no debug tool or stress scenario strings', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const sources = readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(dist, file), 'utf8'));
  const all = sources.join('\n');
  // The main thread reads `?perf`; the worker's overlay draws these labels.
  expect(all).toMatch(/\.has\(["'`]perf["'`]\)/);
  expect(all).toContain('ms/step');
  expect(all).toContain(' p95 ');
  for (const forbidden of [
    '__vsTest',
    '__vsDebug',
    'testSnapshot',
    'togglePerfOverlay',
    // Debug command kinds (`fastForward` is also the loop's own method name, so it is not listed).
    'grantWeapon',
    'spawnBoss',
    'forceEvolution',
    'toggleInvulnerable',
    'enemies-400',
    'enemies-800',
    'enemies-1200',
    'projectiles-max',
    'projectiles-1800',
    'projectiles-frozen',
    'gems-flood',
    'lottie-enemy',
    '[stress]',
    'stressProgress',
  ])
    expect(all, forbidden).not.toContain(forbidden);
});
