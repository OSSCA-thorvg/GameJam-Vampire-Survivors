"""The generated HP track must leave the separately rendered live fill meaningful."""
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import zlib

from rebuild_common import ROOT
from rebuild_pixel_proof import measure, validate_hp_track

TOOL = ROOT / 'verification/issue-76/tool/sprite-gen/.venv/bin/sprite-gen'


def source_fixture(path, red=False):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))
    rows = []
    for y in range(72):
        row = bytearray()
        for x in range(432):
            inside = 16 <= x < 416 and 16 <= y < 56
            border = inside and (x < 20 or x >= 412 or y < 20 or y >= 52)
            color = (45, 45, 55, 255) if border else (192, 57, 43, 255) if red else (20, 20, 28, 255)
            row.extend(color if inside else (0, 0, 0, 0))
        rows.append(b'\0' + row)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 432, 72, 8, 6, 0, 0, 0)) +
                     chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))


class HpTrackContract(unittest.TestCase):
    def test_partial_canvas_and_baked_red_are_rejected(self):
        valid = {'size': [160, 24], 'box': [0, 0, 160, 24], 'hpTrack': {
            'opaqueInnerPixels': 2432, 'innerPixels': 2432, 'bakedRedPixels': 0,
            'innerMeanLuma': 20, 'innerBrightFraction': 0}}
        validate_hp_track(valid)
        with self.assertRaisesRegex(ValueError, 'complete160x24'):
            validate_hp_track(valid | {'box': [6, 4, 154, 20]})
        with self.assertRaisesRegex(ValueError, 'baked red'):
            validate_hp_track(valid | {'hpTrack': valid['hpTrack'] | {'bakedRedPixels': 1}})

    @unittest.skipUnless(TOOL.is_file(), 'bootstrap the pinned sprite-gen environment for the real primitive proof')
    def test_real_upstream_rectangle_mapping_keeps_full_width_and_neutral_inner(self):
        parent = ROOT / 'verification/issue-76/generation/planning'
        parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='hp-geometry-test-', dir=parent) as temporary:
            directory = Path(temporary)
            raw, normalized, final = directory / 'raw.png', directory / 'full-rectangle.png', directory / 'pixel'
            source_fixture(raw)
            python = str(TOOL.with_name('python'))
            subprocess.run([python, str(ROOT / 'scripts/assets/normalize_full_rectangle.py'), '--source', str(raw),
                            '--output', str(normalized), '--width', '160', '--height', '24'], check=True)
            subprocess.run([python, str(ROOT / 'scripts/assets/refine_painted.py'), '--source', str(normalized),
                            '--out-dir', str(final), '--full-rectangle'], check=True, capture_output=True)
            proof = measure(normalized, final / 'frame-0.png', TOOL, False, hp_track=True)
            self.assertEqual(proof['box'], [0, 0, 160, 24])
            self.assertEqual(proof['hpTrack']['opaqueInnerPixels'], 152 * 16)
            self.assertEqual(proof['hpTrack']['bakedRedPixels'], 0)
            self.assertEqual(proof['grid']['uniformFraction'], 1)
            source_fixture(raw, red=True)
            subprocess.run([python, str(ROOT / 'scripts/assets/normalize_full_rectangle.py'), '--source', str(raw),
                            '--output', str(normalized), '--width', '160', '--height', '24'], check=True)
            subprocess.run([python, str(ROOT / 'scripts/assets/refine_painted.py'), '--source', str(normalized),
                            '--out-dir', str(final), '--full-rectangle'], check=True, capture_output=True)
            with self.assertRaisesRegex(ValueError, 'baked red'):
                measure(normalized, final / 'frame-0.png', TOOL, False, hp_track=True)


if __name__ == '__main__':
    unittest.main()
