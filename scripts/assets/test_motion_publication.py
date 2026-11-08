"""Synthetic reviewer-schema tests and optional actual-tool publication controls."""
import copy
import os
from pathlib import Path
import tempfile
import shutil
import unittest

from motion_bank_proof import validate_approval, validate_bank
from motion_inventory import DEFAULT_MOTION_RECIPE
from rebuild_common import ROOT, digest, read_json, write_json


class ReviewerIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='SYNTHETIC-review-schema-NOT-ART-', dir=ROOT / 'verification')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.path = self.directory / 'SYNTHETIC-NOT-ART.json'
        self.bank = {'id': 'player.swift', 'kind': 'SYNTHETIC REVIEW SCHEMA ONLY; NO ART',
                     'motionPresenceGate': {'threshold': .01, 'status': 'pass'}, 'sourceRows': [{'sourceWarnings': []}]}
        write_json(self.path, self.bank)

    def reviews(self, names, wrong_bank=False):
        rows = []
        for index, name in enumerate(names):
            path = self.directory / f'synthetic-review-{index}.json'
            write_json(path, {'kind': 'SYNTHETIC SCHEMA ONLY', 'reviewer': name,
                'bankSha256': '0' * 64 if wrong_bank else digest(self.path),
                'states': {'idle': 'pass', 'move': 'pass'},
                'coverage': {'source': {'idle': 8, 'move': 8}, 'native': {'idle': 4, 'move': 8}}})
            rows.append({'file': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)})
        write_json(self.directory / 'bank-approval.json', {'bankSha256': digest(self.path), 'reviews': rows})

    def test_distinct_canonical_fixture_ids_pass(self):
        self.reviews(['fixture-producer', 'fixture-independent'])
        validate_approval(self.path, self.bank)

    def test_same_identity_is_rejected(self):
        self.reviews(['fixture-reviewer', 'fixture-reviewer'])
        with self.assertRaises(ValueError): validate_approval(self.path, self.bank)

    def test_padded_same_identity_is_rejected(self):
        self.reviews(['fixture-reviewer', ' fixture-reviewer '])
        with self.assertRaises(ValueError): validate_approval(self.path, self.bank)

    def test_case_variant_identity_is_rejected(self):
        self.reviews(['fixture-reviewer', 'FIXTURE-REVIEWER'])
        with self.assertRaises(ValueError): validate_approval(self.path, self.bank)

    def test_blank_identities_are_rejected(self):
        self.reviews([' ', '\t'])
        with self.assertRaises(ValueError): validate_approval(self.path, self.bank)

    def test_different_bank_reviews_are_rejected(self):
        self.reviews(['fixture-producer', 'fixture-independent'], wrong_bank=True)
        with self.assertRaises(ValueError): validate_approval(self.path, self.bank)


@unittest.skipUnless(os.environ.get('MOTION_TEST_BANK'), 'Set MOTION_TEST_BANK for actual-tool controls')
class ActualToolTests(unittest.TestCase):
    def setUp(self):
        self.path = (ROOT / os.environ['MOTION_TEST_BANK']).resolve()
        self.recipe = read_json(DEFAULT_MOTION_RECIPE)
        self.asset = next(a for a in self.recipe['assets'] if a['id'] == read_json(self.path)['id'])
        self.tool = Path(os.environ.get('MOTION_TOOL_ROOT', str(ROOT / 'verification/issue-84/tool/sprite-gen'))).resolve() / '.venv/bin/sprite-gen'

    def test_actual_pinned_tool_and_bound_art_reviews_pass_unchanged(self):
        before = digest(self.path)
        validate_bank(self.path, self.recipe, self.asset, self.tool, require_approval=True)
        self.assertEqual(digest(self.path), before)

    def test_forged_declared_pin_cannot_relabel_actual_checkout(self):
        forged = copy.deepcopy(self.recipe)
        forged['tool']['commit'] = '0' * 40
        with tempfile.TemporaryDirectory(prefix='SYNTHETIC-forged-tool-claim-', dir=ROOT / 'verification') as temporary:
            directory = Path(temporary)
            old_prefix = self.path.parent.relative_to(ROOT).as_posix()
            new_prefix = directory.relative_to(ROOT).as_posix()
            # This is an unapproved byte-identical candidate copy, never a new art approval.
            def relocate(value):
                if isinstance(value, dict): return {key: relocate(item) for key, item in value.items()}
                if isinstance(value, list): return [relocate(item) for item in value]
                if isinstance(value, str) and value.startswith(old_prefix + '/'):
                    return new_prefix + value[len(old_prefix):]
                return value
            bank = relocate(read_json(self.path))
            for name in ['source-components', 'source-poses', 'idle', 'move']:
                shutil.copytree(self.path.parent / name, directory / name)
            for name in ['palette.lock.json', 'bank-request.json']:
                shutil.copy2(self.path.parent / name, directory / name)
            path = directory / 'bank.json'; write_json(path, bank)
            validate_bank(path, self.recipe, self.asset, self.tool)
            bank['upstream'] = copy.deepcopy(forged['tool']); write_json(path, bank)
            with self.assertRaisesRegex(ValueError, 'checkout does not match the pinned commit'):
                validate_bank(path, forged, self.asset, self.tool)


if __name__ == '__main__':
    unittest.main()
