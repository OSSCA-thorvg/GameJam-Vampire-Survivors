/** Exact current asset graph; historical #76 physical counts are not runtime contracts. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest, type AssetManifest } from '../../packages/shared/src/assets.js';
import { validateLottie } from '../../packages/shared/src/lottie.js';
import { EXTENDED_LOTTIE_IDS, lottieProfile } from '../../packages/shared/src/lottie-motion.js';
import { inspectPng } from '../../packages/shared/src/png.js';

export interface GraphFile {
  file: string;
  sha256: string;
  bytes: number;
  role: 'primary' | 'owned-image' | 'support' | 'splash' | 'audio';
  owners: string[];
}
export interface AssetGraph {
  logicalIds: string[];
  motionIds: string[];
  diagnosticIds: string[];
  /** ADR 0020: `ui.splash` and its PNG, outside #117's sealed receipt; provenance is `scripts/make-splash.sh`. */
  splashIds: string[];
  /** ADR 0021: the `sfx.*` and `music.*` MP3s, outside #117's sealed receipt; provenance is `scripts/make-audio.sh`. */
  audioIds: string[];
  files: GraphFile[];
}
/** The graph as #117's receipt sealed it: what `motion_verify_installed.py` compares. */
export type ReceiptGraph = Omit<AssetGraph, 'splashIds' | 'audioIds'>;
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
  const splashIds: string[] = [];
  const audioIds: string[] = [];
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
    const splash = EXTENDED_LOTTIE_IDS.includes(id);
    if (entry.format === 'mp3') {
      add(entry.file, 'audio', id);
      audioIds.push(id);
      continue;
    }
    add(entry.file, splash ? 'splash' : 'primary', id);
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
    if (splash) {
      splashIds.push(id);
    } else if (id === DIAGNOSTIC_ID) {
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
      add(file, splash ? 'splash' : 'owned-image', id);
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
    splashIds: splashIds.sort(),
    audioIds: audioIds.sort(),
    files: [...files.values()].sort((a, b) => a.file.localeCompare(b.file)),
  };
}

/** ADR 0021: the marker lines around the audio rows and paragraphs of the support files. */
export const AUDIO_BEGIN = '<!-- audio:begin -->';
export const AUDIO_END = '<!-- audio:end -->';

/**
 * Removes the unsealed assets from a support file's text exactly as they were added. ADR 0020: every line naming one
 * of `ids` (a catalog row, a README paragraph of its own together with its blank separator line), and in
 * `manifest.json` the ID's whole entry block. ADR 0021: every marker block from a line `<!-- audio:begin -->` through
 * the next line `<!-- audio:end -->`, plus the one empty line right after it. Nothing else is removed, so any other
 * change still differs from the sealed hash.
 */
export function stripUnsealed(text: string, ids: readonly string[] = EXTENDED_LOTTIE_IDS): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line === AUDIO_BEGIN) {
      const end = lines.indexOf(AUDIO_END, i + 1);
      if (end < 0) throw new Error('Unterminated audio marker block');
      i = lines[end + 1] === '' ? end + 1 : end;
      continue;
    }
    const named = ids.some((id) => line.includes('`' + id + '`') || line.includes('"' + id + '"'));
    if (!named) {
      kept.push(line);
      continue;
    }
    const block = /^(\s*)"[^"]+": \{$/.exec(line);
    if (block) {
      const close = (block[1] ?? '') + '}';
      while (i + 1 < lines.length && !(lines[i] ?? '').startsWith(close + ',')) i++;
    } else if (kept.at(-1) === '' && lines[i + 1] === '') i++; // a paragraph of its own, with its blank line
  }
  return kept.join('\n');
}

/**
 * The graph #117's receipt sealed: no splash or audio ID or file, and support files hashed with their lines and
 * marker blocks removed (ADRs 0020 and 0021).
 */
export function receiptGraph(graph: AssetGraph, directory: string): ReceiptGraph {
  const unsealed = [...graph.splashIds, ...graph.audioIds];
  const files = graph.files
    .filter((file) => file.role !== 'splash' && file.role !== 'audio')
    .map((file) => {
      if (file.role !== 'support') return file;
      const bytes = Buffer.from(
        stripUnsealed(readFileSync(join(directory, file.file), 'utf8'), unsealed),
        'utf8',
      );
      return {
        ...file,
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
  return {
    logicalIds: graph.logicalIds.filter((id) => !unsealed.includes(id)),
    motionIds: graph.motionIds,
    diagnosticIds: graph.diagnosticIds,
    files,
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
