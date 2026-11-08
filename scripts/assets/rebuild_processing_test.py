"""Adversarial receipt checks: hashes alone must not authorize missing or false evidence."""
from copy import deepcopy
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

import rebuild_common as common
from rebuild_contract import PAINTED_INPUT, PAINTED_OPERATIONS, evidence_paths
import rebuild_processing as processing


def fixture_png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = [b'\0' + b''.join(bytes([255, 0, 0, 255]) if 32 <= x < 96 and 32 <= y < 96 else bytes(4)
                             for x in range(128)) for y in range(128)]
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 128, 128, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))


class ProcessingIntegrity(unittest.TestCase):
    def setUp(self):
        self.recipe = common.read_json(common.DEFAULT_RECIPE)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        for module in (common,):
            replacement = patch.object(module, 'ROOT', self.root)
            replacement.start()
            self.addCleanup(replacement.stop)
        self.final = self.root / 'verification/items/icons-passives/pixel/icon-passive-bracer/painted/frame-0.png'
        self.source = self.root / 'verification/items/icons-passives/normalized/icon-passive-bracer/icon-passive-bracer.png'
        self.script = self.root / 'scripts/assets/refine_painted.py'
        for path in (self.final, self.source, self.script):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(fixture_png() if path.suffix == '.png' else b'reviewed fixture exporter')
        self.entry = {'id': 'icon.passive.bracer', 'job': 'icons-passives', 'logicalSize': [32, 32],
                      'file': common.portable(self.final), 'sha256': common.digest(self.final)}
        self.proof = {'size': [128, 128], 'mode': 'RGBA', 'alphaValues': [0, 255], 'visibleColors': 1,
                      'grid': {'physicalPitch': 2, 'phase': [0, 0], 'uniformFraction': 1.0},
                      'sourceCanvasBox': [32, 32, 96, 96], 'box': [32, 32, 96, 96],
                      'visiblePalette': [[255, 0, 0]], 'sourceFile': common.portable(self.source),
                      'sourceSha256': common.digest(self.source), 'outputFile': common.portable(self.final),
                      'outputSha256': common.digest(self.final)}
        self.paths = evidence_paths(self.final, self.source, self.script)
        self.write_evidence()
        tool = patch.object(processing, 'checked_tool', return_value=Path('/fixture/pinned/sprite-gen'))
        tool.start()
        self.addCleanup(tool.stop)
        measurement = patch.object(processing, 'measure', return_value=self.proof)
        measurement.start()
        self.addCleanup(measurement.stop)

    def write_evidence(self):
        settings = self.recipe['export']['pixel']
        common.write_json(self.paths['request'], {'source': common.portable(self.source),
            'sourceSha256': common.digest(self.source), 'route': settings['route'], 'physicalBlock': 2,
            'paletteSize': 64, 'script': common.portable(self.script), 'scriptSha256': common.digest(self.script)})
        common.write_json(self.paths['operations'], {'route': settings['route'], 'inputLattice': None,
            'inputKind': PAINTED_INPUT, 'operations': PAINTED_OPERATIONS, 'physicalBlock': 2, 'paletteSize': 64,
            'sourceBox': self.proof['sourceCanvasBox'], 'paintedFootprintLogicalCap': [32, 32], 'finalBox': self.proof['box']})
        common.write_json(self.paths['palette'], {'kind': 'sprite-gen-palette-lock',
            'source': 'explicit-painted-source-kcentroid', 'colors': [[255, 0, 0]]})
        common.write_json(self.paths['finalProof'], self.proof)
        self.report = {'version': 2, 'route': settings['route'], 'inputLattice': None,
            'engineCommit': self.recipe['source']['commit'], 'source': common.portable(self.source),
            'sourceSha256': common.digest(self.source), 'output': common.portable(self.final),
            'outputSha256': common.digest(self.final), 'physicalBlock': 2, 'paletteSize': 64}
        self.refresh_report()

    def refresh_report(self):
        self.report['files'] = [{'role': role, 'file': common.portable(path), 'sha256': common.digest(path)}
                                for role, path in self.paths.items()]
        self.save_report()

    def save_report(self):
        path = self.final.parents[1] / 'processing.json'
        common.write_json(path, self.report)
        self.entry['processing'] = {'file': common.portable(path), 'sha256': common.digest(path)}

    def test_complete_control_is_accepted(self):
        processing.validate_processing(self.entry, self.recipe)

    def test_hashed_empty_evidence_and_missing_final_proof_are_rejected(self):
        for files in ([], [item for item in self.report['files'] if item['role'] != 'finalProof']):
            self.report['files'] = files
            self.save_report()
            with self.assertRaisesRegex(ValueError, 'every mandatory evidence role'):
                processing.validate_processing(self.entry, self.recipe)

    def test_hashed_wrong_route_and_tampered_settings_are_rejected(self):
        original = deepcopy(self.report)
        for change in ({'route': 'custom-resize-not-sprite-gen'}, {'physicalBlock': 17},
                       {'paletteSize': 999}, {'inputLattice': [37, 38]}):
            self.report = original | change
            self.save_report()
            with self.assertRaisesRegex(ValueError, 'route/settings'):
                processing.validate_processing(self.entry, self.recipe)

    def test_forged_proof_with_refreshed_hash_still_fails_actual_measurement(self):
        common.write_json(self.paths['finalProof'], self.proof | {'visibleColors': 999})
        self.refresh_report()
        with self.assertRaisesRegex(ValueError, 'actual PNG measurements'):
            processing.validate_processing(self.entry, self.recipe)

    def test_wrong_operations_or_request_script_cannot_be_blessed_by_hash(self):
        for role, change in [('operations', {'operations': ['custom-resize']}),
                             ('request', {'scriptSha256': '0' * 64})]:
            original = common.read_json(self.paths[role])
            common.write_json(self.paths[role], original | change)
            self.refresh_report()
            with self.assertRaises(ValueError):
                processing.validate_processing(self.entry, self.recipe)
            common.write_json(self.paths[role], original)

    def test_wrong_output_binding_and_substitute_evidence_paths_are_rejected(self):
        self.report['outputSha256'] = '0' * 64
        self.save_report()
        with self.assertRaisesRegex(ValueError, 'actual candidate'):
            processing.validate_processing(self.entry, self.recipe)
        self.report['outputSha256'] = common.digest(self.final)
        self.report['files'][0]['file'] = common.portable(self.final)
        self.save_report()
        with self.assertRaisesRegex(ValueError, 'evidence path or hash'):
            processing.validate_processing(self.entry, self.recipe)


if __name__ == '__main__':
    unittest.main()
