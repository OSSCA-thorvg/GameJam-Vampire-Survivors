"""Publication fail-closed paths; no synthetic source fixture can be published as art."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from motion_publish import asset_diff, build_pack, no_symlinks
from motion_publish_sources import source_plan, copy_resource, verify_preserved
from motion_publish_receipt import archive_source
from motion_publish_verify import original, verify_receipt, verify_source_proof
from motion_publish_factory import native_document
from motion_inventory import ACTORS, DEFAULT_MOTION_RECIPE, validate_inventory
from rebuild_common import ROOT, read_json, write_json, digest

RECIPE = read_json(DEFAULT_MOTION_RECIPE)


class PublicationPlanTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='publication-test-', dir=ROOT / 'verification')
        self.addCleanup(self.temporary.cleanup); self.directory = Path(self.temporary.name)

    def test_missing_sources_remain_pending(self):
        plan = source_plan({})
        self.assertEqual(plan['status'], 'pending'); self.assertEqual(set(plan['missingActors']), ACTORS)
        self.assertTrue(plan['missingStage'])

    def test_missing_all14_source_proofs_rejects_even_complete85_36_graph(self):
        graph = {'logicalIds': RECIPE['logicalIds'], 'motionIds': RECIPE['motionIds'], 'files': []}
        receipt = {'graph': graph, 'assets': {id: {'installedFiles': []} for id in RECIPE['logicalIds']}}
        with self.assertRaisesRegex(ValueError, 'Exactly13 actor and1 stage'):
            verify_receipt(receipt, graph, self.directory, RECIPE)

    def test_unexpected_source_proof_role_is_rejected(self):
        graph = {'logicalIds': RECIPE['logicalIds'], 'motionIds': RECIPE['motionIds'], 'files': []}
        assets = {id: {'installedFiles': []} for id in RECIPE['logicalIds']}
        for id in ACTORS | {'stage.brazier', 'font.hud'}: assets[id]['sourceProofFile'] = 'unused.json'
        with self.assertRaisesRegex(ValueError, 'unexpected proof roles'):
            verify_receipt({'graph': graph, 'assets': assets}, graph, self.directory, RECIPE)

    def test_required_proof_fields_cannot_be_dropped(self):
        graph = {'logicalIds': RECIPE['logicalIds'], 'motionIds': RECIPE['motionIds'], 'files': []}
        assets = {id: {'installedFiles': []} for id in RECIPE['logicalIds']}
        for id in ACTORS | {'stage.brazier'}: assets[id]['sourceProofFile'] = 'unused.json'
        with self.assertRaisesRegex(ValueError, 'Required source-proof receipt fields'):
            verify_receipt({'graph': graph, 'assets': assets}, graph, self.directory, RECIPE)

    def test_superseded_approval_cannot_release_held_bank(self):
        bank = self.directory / 'bank.json'; write_json(bank, {'kind': 'SYNTHETIC-NOT-ART'})
        write_json(self.directory / 'bank-approval-superseded-initial-pass.json', {'kind': 'SYNTHETIC-NOT-ART'})
        plan = source_plan({'actors': {'enemy.ghoul': bank.relative_to(ROOT).as_posix()}})
        self.assertEqual(plan['status'], 'pending'); self.assertEqual(plan['heldActors'], ['enemy.ghoul'])

    def test_duplicate_source_ownership_is_rejected(self):
        with self.assertRaises(ValueError): source_plan({'actors': {'player.swift': 'same.json', 'enemy.bat': 'same.json'}})

    def test_explicit_recheck_hold_overrides_any_current_approval_filename(self):
        bank = self.directory / 'bank.json'; write_json(bank, {'kind': 'SYNTHETIC-NOT-ART'})
        write_json(self.directory / 'bank-approval.json', {'kind': 'SYNTHETIC-SCHEMA-ONLY'})
        write_json(self.directory / 'root-review-recheck-hold.json', {'kind': 'SYNTHETIC-HOLD'})
        plan = source_plan({'actors': {'enemy.ghoul': bank.relative_to(ROOT).as_posix()}})
        self.assertEqual(plan['heldActors'], ['enemy.ghoul']); self.assertEqual(plan['status'], 'pending')

    def test_unknown_actor_is_rejected(self):
        with self.assertRaises(ValueError): source_plan({'actors': {'enemy.fictional': 'never.json'}})

    def test_symlinked_source_is_rejected(self):
        file = self.directory / 'source.json'; write_json(file, {'kind': 'SYNTHETIC'})
        link = self.directory / 'link.json'; link.symlink_to(file)
        with self.assertRaises(ValueError): source_plan({'actors': {'player.swift': link.relative_to(ROOT).as_posix()}})

    def test_resource_copy_rejects_changed_source(self):
        file = self.directory / 'source.png'; file.write_bytes(b'SYNTHETIC-NOT-ART')
        with self.assertRaises(ValueError): copy_resource(file, self.directory / 'target.png', '0' * 64)
        self.assertFalse((self.directory / 'target.png').exists())

    def test_pack_symlink_is_rejected(self):
        (self.directory / 'link').symlink_to(ROOT / 'assets', target_is_directory=True)
        with self.assertRaises(ValueError): no_symlinks(self.directory)

    def test_wraith_cannot_reset_to_flying(self):
        recipe = copy.deepcopy(RECIPE)
        asset = next(a for a in recipe['assets'] if a['id'] == 'enemy.wraith')
        asset.update(grounded=False, bodyPlan='legless')
        with self.assertRaises(ValueError): validate_inventory(recipe)

    def test_unknown_file_diff_is_rejected(self):
        before, after = self.directory / 'before', self.directory / 'after'
        # An explicit synthetic pre-motion pack remains valid after public PNG primaries migrate.
        before.mkdir()
        for asset in RECIPE['assets']:
            if asset['id'] in {'fx.levelUp', 'fx.chestOpen'}: continue
            original = before / Path(asset['master']['file']).relative_to('assets')
            original.parent.mkdir(parents=True, exist_ok=True)
            original.write_bytes(b'SYNTHETIC-ALLOWLIST-FIXTURE-NOT-ART')
        shutil.copytree(before, after)
        for asset in RECIPE['assets']:
            if asset['id'] in {'fx.levelUp', 'fx.chestOpen'}: continue
            (after / Path(asset['master']['file']).relative_to('assets')).unlink()
            target = after / asset['outputFile']; target.parent.mkdir(parents=True, exist_ok=True); target.write_text('{}')
        control = asset_diff(before, after, RECIPE)
        self.assertEqual(len(control['removed']), 34)
        self.assertEqual(len(control['added']), 34)
        (after / 'rogue.png').write_bytes(b'SYNTHETIC')
        with self.assertRaisesRegex(ValueError, 'unexpected resource path'):
            asset_diff(before, after, RECIPE)


@unittest.skipUnless(os.environ.get('MOTION_TOOL_ROOT') and os.environ.get('MOTION_TEST_BANK'), 'Actual source/tool paths required')
class ActualPublicationControls(unittest.TestCase):
    def installed(self, bank, directory):
        asset = next(a for a in RECIPE['assets'] if a['id'] == bank['id'])
        stem = Path(asset['outputFile']).with_suffix('')
        primary = directory / asset['outputFile']; write_json(primary, native_document(asset))
        files = [{'file': asset['outputFile'], 'role': 'primary', 'sha256': digest(primary)}] + [
            {'file': (stem / f'pose-{i}.png').as_posix(), 'role': 'owned-image', 'sha256': f['sha256']} for i, f in enumerate(bank['frames'])]
        return files, asset

    def test_partial_build_fails_before_creating_output(self):
        tool = Path(os.environ['MOTION_TOOL_ROOT']).resolve() / '.venv/bin/sprite-gen'
        with tempfile.TemporaryDirectory(prefix='publication-partial-', dir=ROOT / 'verification') as temporary:
            output = Path(temporary) / 'never-created'
            with self.assertRaises(ValueError):
                build_pack(RECIPE, {'actors': {'player.swift': os.environ['MOTION_TEST_BANK']}}, output, tool)
            self.assertFalse(output.exists())

    def test_archive_retains_all16_and_exact_reviewed_metadata_bytes(self):
        file = (ROOT / os.environ['MOTION_TEST_BANK']).resolve(); bank = read_json(file)
        with tempfile.TemporaryDirectory(prefix='source-archive-test-', dir=ROOT / 'verification') as temporary:
            evidence = archive_source(bank['id'], {'file': file.relative_to(ROOT).as_posix(), 'sha256': digest(file), 'bank': bank}, Path(temporary))
            proof = read_json(ROOT / evidence['stagedSourceProofFile'])
            self.assertEqual(len(proof['retainedSourcePoses']), 16)
            self.assertEqual(original(proof['bank']), bank)
            for review in proof['reviews']: self.assertEqual(original(review), review['document'])
            self.assertTrue(any(p['state'] == 'idle' and p['index'] == 1 for p in proof['retainedSourcePoses']))
            path = ROOT / evidence['stagedSourceProofFile']; installed, asset = self.installed(bank, Path(temporary) / 'assets')
            expected = evidence | {'sourceProofSha256': digest(path), 'installedFiles': installed}
            verify_source_proof(path, Path(temporary) / 'source-archive', expected, Path(temporary) / 'assets', asset)
            primary = Path(temporary) / 'assets' / asset['outputFile']; document = read_json(primary)
            document['assets'][0]['p'], document['assets'][1]['p'] = document['assets'][1]['p'], document['assets'][0]['p']
            write_json(primary, document); changed = copy.deepcopy(expected); changed['installedFiles'][0]['sha256'] = digest(primary)
            with self.assertRaisesRegex(ValueError, 'Native wrapper resource IDs'):
                verify_source_proof(path, Path(temporary) / 'source-archive', changed, Path(temporary) / 'assets', asset)
            write_json(primary, native_document(asset))
            changed = copy.deepcopy(expected); changed['retainedSourcePoses'].pop(1)
            with self.assertRaisesRegex(ValueError, 'retained source poses differ'):
                verify_source_proof(path, Path(temporary) / 'source-archive', changed, Path(temporary) / 'assets', asset)
            changed = copy.deepcopy(expected); changed['installedFiles'][1]['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'Runtime image bytes/order differ'):
                verify_source_proof(path, Path(temporary) / 'source-archive', changed, Path(temporary) / 'assets', asset)

    def test_rehashed_original_review_still_requires_real_actor_state_coverage(self):
        file = (ROOT / os.environ['MOTION_TEST_BANK']).resolve(); bank = read_json(file)
        with tempfile.TemporaryDirectory(prefix='ADVERSARIAL-archive-review-only-', dir=ROOT / 'verification') as temporary:
            expected = archive_source(bank['id'], {'file': file.relative_to(ROOT).as_posix(), 'sha256': digest(file), 'bank': bank}, Path(temporary))
            path = ROOT / expected['stagedSourceProofFile']; proof = read_json(path)
            # Only this owned negative fixture changes; no genuine bank or approval is written.
            review = proof['reviews'][0]; value = json.loads(review['originalUtf8']); value['states']['move'] = 'fail'
            review['originalUtf8'] = json.dumps(value); review['document'] = value
            review['sha256'] = hashlib.sha256(review['originalUtf8'].encode()).hexdigest()
            approval = json.loads(proof['approval']['originalUtf8']); approval['reviews'][0]['sha256'] = review['sha256']
            proof['approval']['originalUtf8'] = json.dumps(approval)
            proof['approval']['sha256'] = hashlib.sha256(proof['approval']['originalUtf8'].encode()).hexdigest()
            expected['reviews'][0]['sha256'] = review['sha256']; write_json(path, proof)
            expected['sourceProofSha256'] = digest(path)
            expected['installedFiles'], asset = self.installed(bank, Path(temporary) / 'assets')
            with self.assertRaisesRegex(ValueError, 'Actor original reviews must accept'):
                verify_source_proof(path, Path(temporary) / 'source-archive', expected, Path(temporary) / 'assets', asset)


if __name__ == '__main__': unittest.main()
