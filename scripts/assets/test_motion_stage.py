"""Five-source stage contract, static hardware timing, and genuine replay attacks."""
import copy
import os
from pathlib import Path
import tempfile
import unittest

from motion_publish_factory import native_document as stage_document
from motion_stage import validate_stage
from motion_inventory import DEFAULT_MOTION_RECIPE
from rebuild_common import ROOT, read_json, write_json

RECIPE = read_json(DEFAULT_MOTION_RECIPE)
ASSET = next(a for a in RECIPE['assets'] if a['id'] == 'stage.brazier')


class StageNativeTests(unittest.TestCase):
    def test_one_static_stand_and_four_genuine_pose_resources(self):
        doc = stage_document(ASSET)
        self.assertEqual(len(doc['assets']), 5); self.assertEqual(len(doc['layers']), 5)
        self.assertEqual((doc['fr'], doc['ip'], doc['op']), (6, 0, 4))
        self.assertEqual(doc['op'] / doc['fr'], 2 / 3)
        stand = next(layer for layer in doc['layers'] if layer['refId'] == 'stand')
        self.assertEqual((stand['ip'], stand['op']), (0, 4))
        self.assertTrue(all(channel['a'] == 0 for channel in stand['ks'].values()))
        for time in [0, .5, 1, 1.5, 2, 2.5, 3, 3.999999]:
            active = [layer['refId'] for layer in doc['layers'] if layer['ip'] <= time < layer['op']]
            self.assertEqual(len(active), 2); self.assertIn('stand', active)
            self.assertIn(f'flame{int(time)}', active)
        for image in doc['assets']:
            self.assertEqual([image['w'], image['h']], [48, 80]); self.assertEqual(image['u'], '')
            self.assertTrue(image['p'].startswith('brazier/'))


@unittest.skipUnless(os.environ.get('MOTION_TEST_STAGE'), 'Set MOTION_TEST_STAGE for genuine source5 controls')
class ActualStageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = (ROOT / os.environ['MOTION_TEST_STAGE']).resolve(); cls.bank = read_json(cls.path)
        cls.tool = Path(os.environ['MOTION_TOOL_ROOT']).resolve() / '.venv/bin/sprite-gen'

    def reject(self, mutate):
        bank = copy.deepcopy(self.bank); mutate(bank)
        with tempfile.NamedTemporaryFile(prefix='stage-adversarial-', suffix='.json', dir=self.path.parent) as temporary:
            path = Path(temporary.name); write_json(path, bank)
            with self.assertRaises((ValueError, KeyError)):
                validate_stage(path, RECIPE, ASSET, self.tool, False)

    def test_real_source5_full_replay_control(self):
        validate_stage(self.path, RECIPE, ASSET, self.tool, False)

    def test_missing_flame_pose_rejected(self): self.reject(lambda b: b['records'].pop())
    def test_no_baked_second_hardware_instance(self): self.reject(lambda b: b.update(hardwareInstances=2))
    def test_unreported_chroma_override_rejected(self): self.reject(lambda b: b.update(processingChroma={'decontam': 'off'}))
    def test_missing_palette_evidence_rejected(self): self.reject(lambda b: b.update(sharedPalette={}))
    def test_changed_resource_hash_rejected(self): self.reject(lambda b: b['records'][1].update(sha256='0' * 64))
    def test_changed_cup_geometry_rejected(self): self.reject(lambda b: b['geometry'].update(cup=[24, 20]))


if __name__ == '__main__': unittest.main()
