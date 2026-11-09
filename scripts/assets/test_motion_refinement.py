"""Synthetic API tests only; these colored rectangles are never source-art approvals.

Run with the pinned sprite-gen Python to exercise actual unmodified upstream refinement.
"""
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from PIL import Image
from motion_refine_bank import refine_bank
from motion_sampling import native_ancestry
from rebuild_common import ROOT, digest, read_json


class WholeSourceRefinementTests(unittest.TestCase):
    def test_unsampled_source_poses_control_common_geometry_palette_and_ancestry(self):
        components, sources, rows = [], [], []
        for state in ['idle', 'move']:
            sizes = [[10, 40 if state == 'idle' and i == 1 else 20] for i in range(8)]
            row = {'state': state, 'componentSizes': sizes, 'rawSolidComponentSizes': sizes,
                   'officialRowCommonFitScale': 1}
            rows.append(row)
            for index, size in enumerate(sizes):
                color = (251, 17, 243, 255) if state == 'idle' and index == 1 else (31, 61, 91, 255)
                components.append(Image.new('RGBA', tuple(size), color))
                sources.append({'state': state, 'index': index, 'sourceRow': row})
        with tempfile.TemporaryDirectory(prefix='motion-synthetic-test-', dir=ROOT / 'verification') as temporary:
            output = Path(temporary)
            config = {'id': 'synthetic-test-only', 'logicalSize': [8, 8], 'grounded': True}
            with patch('motion_refine_bank.bank_inputs', return_value=(components, sources, rows)):
                bank = refine_bank(config, output)
            self.assertEqual(len(bank['sourceFrames']), 16)
            self.assertEqual(len(bank['frames']), 12)
            self.assertEqual(bank['commonScale'], 14 / 40)
            palette = read_json(output / 'palette.lock.json')['colors']
            self.assertIn([251, 17, 243], palette)
            self.assertEqual(bank['sampling']['frameSelection']['idle'], [0, 2, 4, 6])
            for frame, (state, target, source) in zip(bank['frames'], native_ancestry()):
                ancestor = output / 'source-poses' / state / f'frame-{source}.png'
                native = output / state / f'frame-{target}.png'
                self.assertEqual(digest(native), digest(ancestor))
                self.assertEqual(frame['sourcePoseSha256'], digest(ancestor))
                self.assertEqual(frame['sourceIndex'], source)
            self.assertTrue((output / 'source-poses/idle/frame-1.png').is_file())
            self.assertFalse((output / 'idle/frame-4.png').exists())


if __name__ == '__main__':
    unittest.main()
