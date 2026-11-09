import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { collectAssetGraph, receiptGraph, stripSplash } from '../../../scripts/assets/motion_graph';
import { validateManifest } from './assets';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const assets = join(root, 'assets');
const temporary: string[] = [];
function copyPack(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'vs-motion-graph-')));
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
    value.logicalIds.length +
      4 +
      value.files.filter((file) => file.role === 'owned-image').length +
      value.files.filter((file) => file.role === 'splash').length -
      value.splashIds.length,
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
  expect(verify(assets, value)).toContain('mandatory portable source evidence verified');
});

const script = fileURLToPath(
  new URL('../../../scripts/assets/motion_verify_installed.py', import.meta.url),
);
/** Runs #117's receipt verifier on the graph as the receipt sees it (ADR 0020: without `ui.splash`). */
function verify(directory: string, value = graph(directory)): string {
  return execFileSync('python3', [script, '--assets', directory], {
    input: JSON.stringify(receiptGraph(value, directory)),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

it('keeps ui.splash and its PNG in their own role, outside the sealed receipt (ADR 0020)', () => {
  const value = graph(assets);
  expect(value.splashIds).toEqual(['ui.splash']);
  expect(value.files.filter((file) => file.role === 'splash').map((file) => file.file)).toEqual([
    'ui/splash.json',
    'ui/splash/logo.png',
  ]);
  expect(value.motionIds).not.toContain('ui.splash');
  const sealed = receiptGraph(value, assets);
  expect(sealed.logicalIds).not.toContain('ui.splash');
  expect(sealed.files.some((file) => file.owners.includes('ui.splash'))).toBe(false);
  expect(stripSplash('a\n| `ui.splash` | row |\nb')).toBe('a\nb');
  expect(stripSplash('A\n\n`ui.splash` paragraph\n\nB\n')).toBe('A\n\nB\n');
  expect(
    stripSplash('{\n  "x": {\n    "a": 1\n  },\n  "ui.splash": {\n    "f": 1\n  },\n  "y": 2\n}'),
  ).toBe('{\n  "x": {\n    "a": 1\n  },\n  "y": 2\n}');
});

function publishGraph(directory: string, ...flags: string[]): string {
  return execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/assets/motion_publish_graph.ts',
      directory,
      'docs/assets/motion-84.json',
      ...flags,
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

it('prints the exact sealed receipt graph from the installed splash pack', () => {
  const receipt: unknown = JSON.parse(
    readFileSync(join(root, 'docs/assets/motion-84.receipt.json'), 'utf8'),
  );
  if (typeof receipt !== 'object' || receipt === null || !('graph' in receipt))
    throw new Error('Expected the sealed graph');
  expect(publishGraph(assets)).toBe(JSON.stringify(receipt.graph, null, 2) + '\n');
});

it('preserves compact splash bytes while formatting a staged copy', () => {
  const directory = copyPack();
  const splash = join(directory, 'ui/splash.json');
  const before = readFileSync(splash);
  const manifestPath = join(directory, 'manifest.json');
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const compactManifest = JSON.stringify(manifest);
  writeFileSync(manifestPath, compactManifest);
  publishGraph(directory, '--format');
  const formattedManifest = readFileSync(manifestPath, 'utf8');
  expect(formattedManifest).not.toBe(compactManifest);
  expect(JSON.parse(formattedManifest)).toEqual(manifest);
  expect(readFileSync(splash)).toEqual(before);
});

it('rejects a valid alternate splash resource path before omitting it from the receipt', () => {
  const directory = copyPack();
  const splash = join(directory, 'ui/splash.json');
  const logo = join(directory, 'ui/splash/logo.png');
  cpSync(logo, join(directory, 'ui/splash/alternate.png'));
  rmSync(logo);
  writeFileSync(
    splash,
    readFileSync(splash, 'utf8').replace('splash/logo.png', 'splash/alternate.png'),
  );
  expect(
    graph(directory)
      .files.filter((file) => file.role === 'splash')
      .map((file) => file.file),
  ).toEqual(['ui/splash.json', 'ui/splash/alternate.png']);
  expect(() => publishGraph(directory)).toThrow(
    /Publication requires the pinned splash file paths/,
  );
});

it.each<[string, (directory: string) => void]>([
  [
    'another changed README line',
    (directory) => {
      writeFileSync(
        join(directory, 'README.md'),
        readFileSync(join(directory, 'README.md'), 'utf8') + 'x\n',
      );
    },
  ],
  [
    'another changed catalog line',
    (directory) => {
      const file = join(directory, 'CATALOG.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('Kill counter icon', 'Kill counter'));
    },
  ],
  [
    'another new ID beside ui.splash',
    (directory) => {
      const file = join(directory, 'manifest.json');
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
        assets: Record<string, unknown>;
      };
      // An existing catalog ID moved to a new file stands in for a new, unsealed asset.
      manifest.assets['ui.skull'] = {
        ...(manifest.assets['ui.skull'] as object),
        file: 'ui/skull-2.png',
      };
      cpSync(join(directory, 'ui/skull.png'), join(directory, 'ui/skull-2.png'));
      rmSync(join(directory, 'ui/skull.png'));
      writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    },
  ],
])('still rejects %s in the sealed graph', (_name, mutate) => {
  const directory = copyPack();
  expect(verify(directory)).toContain('verified');
  mutate(directory);
  expect(() => verify(directory)).toThrow();
});

it('rejects a new logical ID other than ui.splash in the sealed graph', () => {
  const value = graph(assets);
  const extra = {
    ...value,
    logicalIds: [...value.logicalIds, 'ui.extra'].sort(),
    files: [
      ...value.files,
      {
        file: 'ui/extra.png',
        sha256: '0'.repeat(64),
        bytes: 1,
        role: 'primary' as const,
        owners: ['ui.extra'],
      },
    ],
  };
  expect(() => verify(assets, extra)).toThrow();
  // Naming a second ID as a splash would need it in EXTENDED_LOTTIE_IDS, which ADR 0020 limits to ui.splash.
  expect(() => verify(assets, { ...extra, splashIds: [...value.splashIds] })).toThrow();
});
