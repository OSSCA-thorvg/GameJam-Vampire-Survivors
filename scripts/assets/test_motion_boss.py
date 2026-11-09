"""Whole-bank boss camera footprint/bounds and actual approved-bank replay attacks."""
import copy
import os
from pathlib import Path
import tempfile
import unittest

from motion_boss_contract import camera_plan
from motion_bank_proof import validate_bank
from motion_inventory import DEFAULT_MOTION_RECIPE
from rebuild_common import ROOT, read_json, write_json


class BossCameraTests(unittest.TestCase):
    def test_one_uniform_camera_matches_neutral_master_footprint(self):
        boxes = [[80, 90, 120, 150]] * 16
        camera = camera_plan(boxes, [20, 5, 80, 95], [200, 200], [100, 100])
        self.assertEqual(camera['transform']['scale'], 3)
        self.assertTrue(camera['oneCameraAcrossAll16']); self.assertFalse(camera['perPoseFit'])
        self.assertEqual(camera['all16SourceBoxes'], boxes)

    def test_unsampled_idle_extreme_limits_whole_bank_camera(self):
        ordinary = [[80, 90, 120, 150]] * 16
        baseline = camera_plan(ordinary, [20, 5, 80, 95], [200, 200], [100, 100])
        poses = copy.deepcopy(ordinary); poses[1] = [20, 10, 180, 180]
        camera = camera_plan(poses, [20, 5, 80, 95], [200, 200], [100, 100])
        self.assertLess(camera['transform']['scale'], baseline['transform']['scale'])
        scale = camera['transform']['scale']; dx, dy = camera['transform']['dx'], camera['transform']['dy']
        for x0, y0, x1, y1 in poses:
            self.assertGreaterEqual(100 + scale * (x0 - 100) + dx, 2 - 1e-9)
            self.assertGreaterEqual(100 + scale * (y0 - 100) + dy, 2 - 1e-9)
            self.assertLessEqual(100 + scale * (x1 - 100) + dx, 198 + 1e-9)
            self.assertLessEqual(100 + scale * (y1 - 100) + dy, 198 + 1e-9)


@unittest.skipUnless(os.environ.get('MOTION_TEST_BOSS_BANK'), 'Set MOTION_TEST_BOSS_BANK for genuine replay controls')
class GenuineBossTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = ROOT / os.environ['MOTION_TEST_BOSS_BANK']; cls.bank = read_json(cls.path)
        cls.recipe = read_json(DEFAULT_MOTION_RECIPE)
        cls.asset = next(a for a in cls.recipe['assets'] if a['id'] == cls.bank['id'])
        cls.tool = Path(os.environ['MOTION_TOOL_ROOT']).resolve() / '.venv/bin/sprite-gen'

    def reject(self, mutate):
        bank = copy.deepcopy(self.bank); mutate(bank)
        with tempfile.NamedTemporaryFile(prefix='boss-negative-', suffix='.json', dir=self.path.parent) as temporary:
            path = Path(temporary.name); write_json(path, bank)
            with self.assertRaises((ValueError, KeyError)):
                validate_bank(path, self.recipe, self.asset, self.tool)

    def test_genuine_approved_master_camera_replays(self):
        validate_bank(self.path, self.recipe, self.asset, self.tool, True)

    def test_forged_neutral_camera_factor_rejects(self):
        self.reject(lambda b: b['camera']['transform'].update(scale=1))

    def test_forged_master_footprint_hash_rejects(self):
        self.reject(lambda b: b.update(masterFootprintSha256='0' * 64))

    def test_forged_pre_palette_camera_pixels_rejects(self):
        self.reject(lambda b: b['sourceFrames'][0].update(cameraCellSha256='0' * 64))


if __name__ == '__main__': unittest.main()
