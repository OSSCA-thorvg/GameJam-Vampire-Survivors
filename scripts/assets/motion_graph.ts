/** Exact current asset graph; historical #76 physical counts are not runtime contracts. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest, type AssetManifest } from '../../packages/shared/src/assets.js';
import { validateLottie } from '../../packages/shared/src/lottie.js';
import { lottieProfile } from '../../packages/shared/src/lottie-motion.js';
import { inspectPng } from '../../packages/shared/src/png.js';

export interface GraphFile {
  file: string;
  sha256: string;
  bytes: number;
  role: 'primary' | 'owned-image' | 'support';
  owners: string[];
}
export interface AssetGraph {
  logicalIds: string[];
  motionIds: string[];
  diagnosticIds: string[];
  files: GraphFile[];
}
const DIAGNOSTIC_ID = 'enemy.lottieTest';
const SUPPORT = ['CATALOG.md', 'README.md', 'manifest.json', 'fonts/LICENSE-NotoSansMono.txt'];

export function collectAssetGraph(options: {
  directory: string;
  manifest: AssetManifest;
}): AssetGraph {
  const { directory, manifest } = options;
  const actual = readdirSync(directory, { recursive: true, withFileTypes: true });
  if (actual.some((entry) => entry.isSymbolicLink()))
    throw new Error('Asset graph forbids symlinked resources');
  const files = new Map<string, GraphFile>();
  const motionIds: string[] = [];
  const diagnosticIds: string[] = [];
  const add = (file: string, role: GraphFile['role'], owner?: string): void => {
    if (files.has(file)) throw new Error(`Duplicate physical resource ownership: ${file}`);
    const bytes = readFileSync(join(directory, file));
    files.set(file, {
      file,
      role,
      owners: owner ? [owner] : [],
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  };
  for (const [id, entry] of Object.entries(manifest.assets)) {
    add(entry.file, 'primary', id);
    if (entry.format === 'png')
      inspectPng(readFileSync(join(directory, entry.file)), [entry.size[0] * 4, entry.size[1] * 4]);
    if (id === DIAGNOSTIC_ID && entry.format !== 'lottie')
      throw new Error('Upstream diagnostic must use Lottie');
    if (entry.format !== 'lottie') continue;
    const animation = validateLottie(
      JSON.parse(readFileSync(join(directory, entry.file), 'utf8')),
      entry.file,
      lottieProfile(id),
    );
    if (animation.width !== entry.size[0] || animation.height !== entry.size[1])
      throw new Error(`Composition dimensions differ: ${id}`);
    if (id === DIAGNOSTIC_ID) {
      if (
        animation.images.length ||
        animation.fps !== 30 ||
        animation.firstFrame !== 0 ||
        animation.lastFrame !== 30
      )
        throw new Error('Upstream diagnostic must retain its shape-only 30fps timeline');
      diagnosticIds.push(id);
    } else {
      motionIds.push(id);
    }
    for (const image of animation.images) {
      const file = dirname(entry.file) + '/' + image.path;
      add(file, 'owned-image', id);
      inspectPng(readFileSync(join(directory, file)), [image.width, image.height]);
    }
  }
  for (const file of SUPPORT) add(file, 'support');
  const physical = actual
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
  if (JSON.stringify(physical) !== JSON.stringify([...files.keys()].sort()))
    throw new Error('Current asset graph has missing or orphan files');
  return {
    logicalIds: Object.keys(manifest.assets).sort(),
    motionIds: motionIds.sort(),
    diagnosticIds,
    files: [...files.values()].sort((a, b) => a.file.localeCompare(b.file)),
  };
}

function main(): void {
  const directory = resolve(process.argv[2] ?? 'assets');
  const parsed = validateManifest(
    JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')),
  );
  if (parsed.errors.length || parsed.missing.length) throw new Error(JSON.stringify(parsed));
  const graph = collectAssetGraph({ directory, manifest: parsed.manifest });
  process.stdout.write(JSON.stringify(graph, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
