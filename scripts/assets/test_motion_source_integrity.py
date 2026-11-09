"""Containment tests and optional genuine-source ancestry controls; no source QA claim."""
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from motion_inventory import DEFAULT_MOTION_RECIPE, restore_masters
from motion_source import intake
from rebuild_common import ROOT, digest, read_json, write_json

RECIPE = read_json(DEFAULT_MOTION_RECIPE)
SWIFT = next(a for a in RECIPE['assets'] if a['id'] == 'player.swift')


class RestorationTests(unittest.TestCase):
    def test_real_git_master_restores_and_is_idempotent(self):
        with tempfile.TemporaryDirectory(prefix='motion-restore-test-', dir=ROOT / 'verification') as temporary:
            output = Path(temporary) / 'output'
            restore_masters({'assets': [SWIFT]}, output)
            target = output / Path(SWIFT['master']['file']).relative_to('assets')
            self.assertEqual(digest(target), SWIFT['master']['sha256'])
            restore_masters({'assets': [SWIFT]}, output)
            self.assertEqual(digest(target), SWIFT['master']['sha256'])

    def test_child_symlink_cannot_redirect_write(self):
        with tempfile.TemporaryDirectory(prefix='motion-restore-test-', dir=ROOT / 'verification') as temporary:
            output, outside = Path(temporary) / 'output', Path(temporary) / 'outside'
            output.mkdir(); outside.mkdir()
            (output / 'characters').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                restore_masters({'assets': [SWIFT]}, output)
            self.assertEqual(list(outside.iterdir()), [])

    def test_output_root_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix='motion-restore-test-', dir=ROOT / 'verification') as temporary:
            outside = Path(temporary) / 'outside'; outside.mkdir()
            output = Path(temporary) / 'output'; output.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                restore_masters({'assets': [SWIFT]}, output)
            self.assertEqual(list(outside.iterdir()), [])

    def test_target_symlink_is_rejected_without_modifying_destination(self):
        with tempfile.TemporaryDirectory(prefix='motion-restore-test-', dir=ROOT / 'verification') as temporary:
            output = Path(temporary) / 'output'
            target = output / Path(SWIFT['master']['file']).relative_to('assets')
            target.parent.mkdir(parents=True)
            outside = Path(temporary) / 'outside.png'; outside.write_bytes(b'owned-test-sentinel')
            target.symlink_to(outside)
            with self.assertRaises(ValueError):
                restore_masters({'assets': [SWIFT]}, output)
            self.assertEqual(outside.read_bytes(), b'owned-test-sentinel')


@unittest.skipUnless(os.environ.get('MOTION_TEST_SOURCE'), 'Set MOTION_TEST_SOURCE for genuine-source ancestry controls')
class GenuineSourceTests(unittest.TestCase):
    def setUp(self):
        self.origin = (ROOT / os.environ['MOTION_TEST_SOURCE']).resolve()
        self.temporary = tempfile.TemporaryDirectory(prefix='motion-ancestry-test-', dir=ROOT / 'verification')
        self.addCleanup(self.temporary.cleanup)
        self.copy = Path(self.temporary.name) / 'adopted'
        for relative in ['base-source.png', 'sprite-request.json', 'frames/frames-manifest.json',
                         'raw/down45/idle.png', 'raw/down45/walk.png',
                         'reports/gen-set/down45_idle.json', 'reports/gen-set/down45_walk.json']:
            target = self.copy / relative; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.origin / relative, target)

    def test_original_and_byteidentical_adopted_controls_pass(self):
        original, adopted = intake(self.origin, SWIFT), intake(self.copy, SWIFT)
        self.assertFalse(original['rows'][1]['adoptedCopy'])
        self.assertTrue(adopted['rows'][1]['adoptedCopy'])
        self.assertEqual(original['rows'][1]['referenceDerivation'], adopted['rows'][1]['referenceDerivation'])

    def reject_references(self, refs):
        path = self.copy / 'reports/gen-set/down45_walk.json'
        report = read_json(path); report['refs'] = refs; write_json(path, report)
        with self.assertRaises(ValueError):
            intake(self.copy, SWIFT)

    def test_missing_walk_anchor_is_rejected(self):
        self.reject_references([])

    def test_base_substitution_is_rejected(self):
        self.reject_references([str(self.origin / 'base-source.png')])

    def test_guide_substitution_is_rejected(self):
        self.reject_references([str(self.origin / 'references/anchors/down45-anchor-x8.png'),
                                str(self.origin / 'references/layout-guides/down45/idle.png')])

    def test_nonlooping_walk_is_rejected(self):
        path = self.copy / 'sprite-request.json'
        request = read_json(path); request['states']['down45_walk']['loop'] = False; write_json(path, request)
        with self.assertRaises(ValueError):
            intake(self.copy, SWIFT)

    def test_actual_canonical_replay_rejects_injected_frame(self):
        from motion_refine_bank import canonical_row_components
        request = read_json(self.origin / 'sprite-request.json')
        manifest = read_json(self.origin / 'frames/frames-manifest.json')
        row = next(row for row in manifest['rows'] if row['state'] == 'down45_idle')
        for relative in ['references/layout-guides/down45/idle.png', *row['files']]:
            target = self.copy / relative; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.origin / relative, target)
        _, proof = canonical_row_components(self.copy, 'down45_idle', request, manifest, row)
        self.assertEqual(proof['canonicalDecodedPixelReplay'], [True] * 8)
        shutil.copy2(self.copy / row['files'][1], self.copy / row['files'][0])
        with self.assertRaises(ValueError):
            canonical_row_components(self.copy, 'down45_idle', request, manifest, row)


if __name__ == '__main__':
    unittest.main()
