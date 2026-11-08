"""Formatting preserves original effects and the upstream diagnostic bytes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from motion_publish_sources import verify_preserved
from rebuild_common import ROOT, read_json


@unittest.skipUnless(os.environ.get('MOTION_TEST_STAGED'), 'Actual full approved staging cache required')
class ActualPackFormattingTests(unittest.TestCase):
    def test_original2_json_and_png_bytes_survive_while_new_json_formats_before_graph_hash(self):
        source = ROOT / os.environ['MOTION_TEST_STAGED']; recipe = read_json(source / 'publication-recipe.json')
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
            newer = [assets / asset['outputFile'] for asset in recipe['assets'] if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}]
            newer += [assets / 'manifest.json', next(archive.rglob('source-proof.json'))]
            before = {}
            for file in newer:
                file.write_text(json.dumps(read_json(file), separators=(',', ':')))
                before[file] = file.read_bytes()
            result = subprocess.check_output([os.environ.get('MOTION_NODE', 'node'), '--import', 'tsx',
                str(ROOT / 'scripts/assets/motion_publish_graph.ts'), str(assets), str(source / 'publication-recipe.json'),
                '--format', '--evidence-root', str(archive)], cwd=ROOT, text=True)
            graph = json.loads(result)
            self.assertEqual((len(graph['logicalIds']), len(graph['motionIds'])), (85, 36))
            self.assertEqual(graph['diagnosticIds'], ['enemy.lottieTest'])
            self.assertEqual(len(preserved), 5)
            for file, data in preserved.items(): self.assertEqual(file.read_bytes(), data, file)
            for file, data in before.items(): self.assertNotEqual(file.read_bytes(), data, file)
            for entry in graph['files']:
                self.assertEqual(hashlib.sha256((assets / entry['file']).read_bytes()).hexdigest(), entry['sha256'])
            verify_preserved(recipe, assets)
            diagnostic_path.write_bytes(preserved[diagnostic_path] + b'\n')
            with self.assertRaisesRegex(ValueError, 'diagnostic bytes changed'):
                verify_preserved(recipe, assets)


if __name__ == '__main__': unittest.main()
