"""Integration outputs retain owning generated art, native timelines and exact physical coverage."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import rebuild_common as common
import rebuild_integration as integration


class NativeIntegrationIntegrity(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        change = patch.object(common, 'ROOT', self.root)
        change.start()
        self.addCleanup(change.stop)
        self.manifest = {f'id{i}': {'file': f'primary/{i}.png'} for i in range(82)}
        self.entries = {}
        fixtures = common.read_json(Path(__file__).parent / 'fixtures/native-fx-wrappers.json')['effects']
        for identifier, fixture in fixtures.items():
            file = 'fx/level-up.json' if identifier == 'fx.levelUp' else 'fx/chest-open.json'
            art = fixture['candidateFile']
            self.manifest[identifier] = {'file': file, 'format': 'lottie', 'loop': True}
            target = self.root / 'assets' / art
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'accepted generated resource fixture')
            self.entries[identifier] = {'candidateFile': art, 'sha256': common.digest(target),
                'logicalSize': fixture['logicalSize'], 'physicalSize': fixture['physicalSize'], 'integration': 'lottie-art'}
            common.write_json(self.root / 'assets' / file, fixture['document'])
        for item in self.manifest.values():
            path = self.root / 'assets' / item['file']
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'primary fixture')
        for name in integration.SUPPORT_FILES:
            path = self.root / 'assets' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'support fixture')

    def test_exact90_files_and_two_native_wrapper_hashes_are_recorded(self):
        receipt = integration.integration_receipt({}, self.entries, self.manifest)
        self.assertEqual(receipt['physicalFiles'], 90)
        self.assertEqual(len(receipt['files']), 90)
        self.assertEqual(len(receipt['nativeEffects']), 2)
        self.assertEqual({item['id'] for item in receipt['nativeEffects']}, set(self.entries))

    def test_orphan_physical_file_is_rejected(self):
        (self.root / 'assets/orphan.svg').write_text('<svg/>')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            integration.integration_receipt({}, self.entries, self.manifest)

    def test_wrong_owning_resource_and_timeline_are_rejected(self):
        identifier = 'fx.levelUp'
        path = self.root / 'assets' / self.manifest[identifier]['file']
        original = common.read_json(path)
        wrong = deepcopy(original)
        wrong['assets'][0]['p'] = self.entries['fx.chestOpen']['candidateFile']
        common.write_json(path, wrong)
        with self.assertRaisesRegex(ValueError, 'accepted generated PNG'):
            integration.effect_receipt(identifier, self.entries[identifier], self.manifest[identifier])
        wrong = deepcopy(original)
        wrong['op'] = 31
        common.write_json(path, wrong)
        with self.assertRaisesRegex(ValueError, 'timeline'):
            integration.effect_receipt(identifier, self.entries[identifier], self.manifest[identifier])
        wrong = deepcopy(original)
        wrong['layers'][0]['ks']['s']['k'][-1]['t'] = 29
        common.write_json(path, wrong)
        with self.assertRaisesRegex(ValueError, 'preserved envelopes'):
            integration.effect_receipt(identifier, self.entries[identifier], self.manifest[identifier])

    def test_actual_two_layer_chest_fixture_preserves_rotation_and_rejects_flattening(self):
        identifier = 'fx.chestOpen'
        path = self.root / 'assets' / self.manifest[identifier]['file']
        original = common.read_json(path)
        accepted = integration.effect_receipt(identifier, self.entries[identifier], self.manifest[identifier])
        self.assertEqual(accepted['nativeLayerCount'], 2)
        self.assertEqual(accepted['nativeLayers'][1]['transforms']['r'], original['layers'][1]['ks']['r'])
        for mutation in ['flatten', 'rotation']:
            wrong = deepcopy(original)
            if mutation == 'flatten':
                wrong['layers'] = wrong['layers'][:1]
            else:
                wrong['layers'][1]['ks']['r'] = {'a': 0, 'k': 0}
            common.write_json(path, wrong)
            with self.assertRaisesRegex(ValueError, 'preserved envelopes'):
                integration.effect_receipt(identifier, self.entries[identifier], self.manifest[identifier])


if __name__ == '__main__':
    unittest.main()
