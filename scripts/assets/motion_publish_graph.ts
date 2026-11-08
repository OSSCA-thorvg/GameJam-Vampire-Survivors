/** Format first, then validate the real closed publication graph using runtime parsers. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { validateManifest } from '../../packages/shared/src/assets';
import { collectAssetGraph } from './motion_graph';

const directory = resolve(process.argv[2] ?? '');
const recipe = JSON.parse(
  readFileSync(process.argv[3] ?? 'docs/assets/motion-84.json', 'utf8'),
) as {
  logicalIds: string[];
  motionIds: string[];
  diagnosticMaster: { id: string; file: string };
  assets: { id: string; master: { file: string } }[];
};
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node24: nvm use');
const entries = readdirSync(directory, { recursive: true, withFileTypes: true });
if (entries.some((entry) => entry.isSymbolicLink()))
  throw new Error('Publication forbids symlinks');
if (process.argv.includes('--format')) {
  const preserved = [
    ...recipe.assets
      .filter((asset) => ['fx.levelUp', 'fx.chestOpen'].includes(asset.id))
      .map((asset) => asset.master.file),
    recipe.diagnosticMaster.file,
  ];
  if (
    preserved.length !== 3 ||
    preserved.some((file) => !file.startsWith('assets/') || !file.endsWith('.json'))
  )
    throw new Error('Formatting requires all three preserved Lottie primaries');
  const preservedJson = new Set(
    preserved.map((file) => resolve(directory, file.slice('assets/'.length))),
  );
  if (preservedJson.size !== 3) throw new Error('Preserved Lottie primaries must be distinct');
  const config = await resolveConfig('assets/manifest.json');
  const evidenceIndex = process.argv.indexOf('--evidence-root');
  const evidence =
    evidenceIndex >= 0
      ? readdirSync(resolve(process.argv[evidenceIndex + 1] ?? ''), {
          recursive: true,
          withFileTypes: true,
        })
      : [];
  if (evidence.some((entry) => entry.isSymbolicLink()))
    throw new Error('Evidence forbids symlinks');
  for (const entry of [...entries, ...evidence].filter(
    (entry) => entry.isFile() && entry.name.endsWith('.json'),
  )) {
    const file = join(entry.parentPath, entry.name);
    if (preservedJson.has(resolve(file))) continue;
    writeFileSync(file, await format(readFileSync(file, 'utf8'), { ...config, parser: 'json' }));
  }
}
const parsed = validateManifest(JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')));
if (parsed.errors.length || parsed.missing.length) throw new Error(JSON.stringify(parsed));
const graph = collectAssetGraph({ directory, manifest: parsed.manifest });
const same = (a: string[], b: string[]): boolean =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (
  !same(graph.logicalIds, recipe.logicalIds) ||
  !same(graph.motionIds, recipe.motionIds) ||
  !same(graph.diagnosticIds, [recipe.diagnosticMaster.id])
)
  throw new Error('Publication requires 85 IDs, 36 motion IDs and the upstream diagnostic');
const counts = Object.values(parsed.manifest.assets).reduce<Record<string, number>>(
  (result, entry) => {
    result[entry.format] = (result[entry.format] ?? 0) + 1;
    return result;
  },
  {},
);
if (counts.lottie !== 37 || counts.png !== 47 || counts.ttf !== 1)
  throw new Error('Publication format partition changed');
for (const id of graph.motionIds) {
  const entry = parsed.manifest.assets[id];
  if (!entry) throw new Error('Missing motion entry');
  const json = JSON.parse(readFileSync(join(directory, entry.file), 'utf8')) as { nm?: string };
  if (/DIAGNOSTIC|EXPERIMENT|REUSED STILL/i.test(json.nm ?? ''))
    throw new Error('Diagnostic or experimental wrappers cannot be published');
}
process.stdout.write(JSON.stringify(graph, null, 2) + '\n');
