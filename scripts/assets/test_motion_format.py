"""Formatting preserves original effects, the upstream diagnostic and the pinned splash."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from motion_publish_sources import verify_preserved
from motion_publish_splash import SPLASH_FILES
from rebuild_common import ROOT, read_json


def receipt_support_text(node, assets):
    script = """
        import { readFileSync } from 'node:fs';
        import { join } from 'node:path';
        import { stripSplash } from './scripts/assets/motion_graph.ts';
        const [directory, ...files] = process.argv.slice(1);
        const text = files.map(file => [file, stripSplash(readFileSync(join(directory, file), 'utf8'))]);
        process.stdout.write(JSON.stringify(Object.fromEntries(text)));
    """
    return json.loads(subprocess.check_output([node, '--import', 'tsx', '--input-type=module',
        '-e', script, '--', str(assets), 'CATALOG.md', 'README.md', 'manifest.json'], cwd=ROOT, text=True))


@unittest.skipUnless(os.environ.get('MOTION_TEST_STAGED'), 'Actual full approved staging cache required')
class ActualPackFormattingTests(unittest.TestCase):
    def test_original2_json_and_png_bytes_survive_while_new_json_formats_before_graph_hash(self):
        source = ROOT / os.environ['MOTION_TEST_STAGED']; recipe = read_json(source / 'publication-recipe.json')
        node = os.environ.get('MOTION_NODE', 'node')
        command = [node, '--import', 'tsx',
            str(ROOT / 'scripts/assets/motion_publish_graph.ts')]
        recipe_path = str(source / 'publication-recipe.json')
        with tempfile.TemporaryDirectory(prefix='actual-pack-format-', dir=ROOT / 'verification') as temporary:
            base = Path(temporary); assets = base / 'assets'; archive = base / 'source-archive'
            shutil.copytree(source / 'assets', assets); shutil.copytree(source / 'source-archive', archive)
            preserved = {}
            for asset in recipe['assets']:
                if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}: continue
                for master in [asset['master'], *asset['master'].get('resources', [])]:
                    data = subprocess.check_output(['git', 'show', master['gitCommit'] + ':' + master['gitPath']], cwd=ROOT)
                    self.assertEqual(hashlib.sha256(data).hexdigest(), master['sha256'])
                    target = assets / Path(master['file']).relative_to('assets'); target.write_bytes(data)
                    preserved[target] = data
            diagnostic = recipe['diagnosticMaster']
            diagnostic_path = assets / Path(diagnostic['file']).relative_to('assets')
            preserved[diagnostic_path] = subprocess.check_output(
                ['git', 'show', diagnostic['gitCommit'] + ':' + diagnostic['file']], cwd=ROOT)
            for file, expected in SPLASH_FILES.items():
                path = assets / file
                data = path.read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected)
                preserved[path] = data
            newer = [assets / asset['outputFile'] for asset in recipe['assets'] if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}]
            newer += [assets / 'manifest.json', next(archive.rglob('source-proof.json'))]
            before = {}
            for file in newer:
                file.write_text(json.dumps(read_json(file), separators=(',', ':')))
                before[file] = file.read_bytes()
            result = subprocess.check_output([*command, str(assets), recipe_path, '--format',
                '--evidence-root', str(archive)], cwd=ROOT, text=True)
            graph = json.loads(result)
            self.assertEqual((len(graph['logicalIds']), len(graph['motionIds'])), (85, 36))
            self.assertEqual(graph['diagnosticIds'], ['enemy.lottieTest'])
            self.assertEqual(len(preserved), 5 + len(SPLASH_FILES))
            for file, data in preserved.items(): self.assertEqual(file.read_bytes(), data, file)
            for file, data in before.items(): self.assertNotEqual(file.read_bytes(), data, file)
            support = receipt_support_text(node, assets)
            for entry in graph['files']:
                file = entry['file']
                data = support[file].encode() if file in support else (assets / file).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'], file)
            verify_preserved(recipe, assets)
            diagnostic_path.write_bytes(preserved[diagnostic_path] + b'\n')
            with self.assertRaisesRegex(ValueError, 'diagnostic bytes changed'):
                verify_preserved(recipe, assets)


if __name__ == '__main__': unittest.main()
