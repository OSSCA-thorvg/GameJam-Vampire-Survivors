import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { collectAssetGraph } from '../../../scripts/assets/motion_graph';
import { validateManifest } from './assets';

const assets = fileURLToPath(new URL('../../../assets/', import.meta.url));
const temporary: string[] = [];
function copyPack(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vs-motion-graph-'));
  temporary.push(directory);
  cpSync(assets, directory, { recursive: true });
  return directory;
}
function graph(directory: string) {
  const parsed = validateManifest(
    JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')),
  );
  expect(parsed.errors).toEqual([]);
  return collectAssetGraph({ directory, manifest: parsed.manifest });
}
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});
it('derives current physical coverage from validated image ownership rather than90 files', () => {
  const value = graph(assets);
  expect(value.files.length).toBe(
    value.logicalIds.length + 4 + value.files.filter((file) => file.role === 'owned-image').length,
  );
  expect(new Set(value.files.map((file) => file.file)).size).toBe(value.files.length);
});
it('rejects a real orphan after exact current-graph discovery', () => {
  const directory = copyPack();
  writeFileSync(join(directory, 'orphan.png'), new Uint8Array([1]));
  expect(() => graph(directory)).toThrow(/orphan/);
});
it('rejects a missing declared PNG resource', () => {
  const directory = copyPack();
  const resource = graph(directory).files.find((file) => file.role === 'owned-image');
  if (!resource) throw new Error('Expected an owned image resource');
  rmSync(join(directory, resource.file));
  expect(() => graph(directory)).toThrow();
});
it('rejects symlinked resources before reading their contents', () => {
  const directory = copyPack();
  symlinkSync('/unreadable-and-nonexistent-motion-target', join(directory, 'orphan-link.png'));
  expect(() => graph(directory)).toThrow(/symlinked/);
});

it('binds every installed motion resource and timeline to its portable reviewed source receipt', () => {
  const value = graph(assets);
  // Before installation the original2FX pack remains valid historical baseline evidence.
  if (value.motionIds.length === 2) {
    expect(value.motionIds).toEqual(['fx.chestOpen', 'fx.levelUp']);
    return;
  }
  expect(value.motionIds).toHaveLength(36);
  expect(value.diagnosticIds).toEqual(['enemy.lottieTest']);
  const script = fileURLToPath(
    new URL('../../../scripts/assets/motion_verify_installed.py', import.meta.url),
  );
  const output = execFileSync('python3', [script], {
    input: JSON.stringify(value),
    encoding: 'utf8',
  });
  expect(output).toContain('mandatory portable source evidence verified');
});
