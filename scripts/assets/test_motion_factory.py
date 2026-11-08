"""Every real publication factory must pass the actual shared runtime parser."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from motion_inventory import DEFAULT_MOTION_RECIPE
from motion_publish_factory import native_document
from motion_lottie import actor_document
from rebuild_common import ROOT, read_json, write_json


class NativeFactoryTests(unittest.TestCase):
    def test_only9_nonplayer_json_gets_feedback_parent_with_identical_child_bank(self):
        recipe = read_json(DEFAULT_MOTION_RECIPE); count = 0
        for asset in recipe['assets']:
            if asset['kind'] != 'actor': continue
            frozen, actual = actor_document(asset), native_document(asset)
            if asset['profile'] == 'player':
                self.assertEqual(actual, frozen)
                continue
            count += 1
            self.assertEqual(actual['assets'][:12], frozen['assets'])
            self.assertEqual(actual['assets'][12], {'id': 'poses', 'w': frozen['w'], 'h': frozen['h'],
                'fr': 12, 'layers': frozen['layers']})
            self.assertEqual(actual['markers'], frozen['markers'])
            self.assertEqual((actual['fr'], actual['ip'], actual['op']), (12, 0, 32))
            self.assertEqual(len(actual['layers']), 1)
            parent = actual['layers'][0]
            self.assertEqual(parent['ks']['o'], {'a': 0, 'k': 100, 'sid': 'damage'})
            self.assertEqual(parent['ks']['s'], {'a': 0, 'k': [100, 100, 100]})
            self.assertNotIn('tm', parent)
        self.assertEqual(count, 9)

    def test_actual_parser_rejects_unbounded_or_time_remapped_normal_feedback_parent(self):
        asset = next(a for a in read_json(DEFAULT_MOTION_RECIPE)['assets'] if a['id'] == 'enemy.bat')
        document = native_document(asset)
        for attack in ['time-remap', 'parent50', 'no-slot', 'child-slot', 'second-parent']:
            changed = copy.deepcopy(document); parent = changed['layers'][0]
            if attack == 'time-remap': parent['tm'] = {'a': 0, 'k': 0}
            elif attack == 'parent50': parent['ks']['s']['k'] = [50, 50, 100]
            elif attack == 'no-slot': parent['ks']['o'].pop('sid')
            elif attack == 'child-slot': changed['assets'][-1]['layers'][0]['ks']['o']['sid'] = 'damage'
            else: changed['layers'].append(copy.deepcopy(parent))
            with self.subTest(attack=attack), tempfile.TemporaryDirectory(prefix='factory-negative-', dir=ROOT / 'verification') as temporary:
                path = Path(temporary) / 'negative.json'
                write_json(path, [{'id': asset['id'], 'file': asset['outputFile'], 'document': changed, 'resources': 12}])
                result = subprocess.run([os.environ.get('MOTION_NODE', 'node'), '--import', 'tsx',
                    str(ROOT / 'scripts/assets/motion_factory_check.ts'), str(path)], cwd=ROOT, capture_output=True)
                self.assertNotEqual(result.returncode, 0)

    def test_all36_actual_native_factories_pass_shared_parser(self):
        recipe = read_json(DEFAULT_MOTION_RECIPE); fixtures = []
        for asset in recipe['assets']:
            preserved = asset['id'] in {'fx.levelUp', 'fx.chestOpen'}
            document = read_json(ROOT / asset['master']['file']) if preserved else native_document(asset)
            resources = 12 if asset['kind'] == 'actor' else 5 if asset['kind'] == 'stage' else 1
            fixtures.append({'id': asset['id'], 'file': asset['outputFile'], 'document': document, 'resources': resources})
        with tempfile.TemporaryDirectory(prefix='factory-parser-', dir=ROOT / 'verification') as temporary:
            path = Path(temporary) / 'factories.json'; write_json(path, fixtures)
            result = subprocess.check_output([os.environ.get('MOTION_NODE', 'node'), '--import', 'tsx',
                str(ROOT / 'scripts/assets/motion_factory_check.ts'), str(path)], cwd=ROOT, text=True)
            self.assertEqual(json.loads(result), {'parsed': 36})


if __name__ == '__main__': unittest.main()
