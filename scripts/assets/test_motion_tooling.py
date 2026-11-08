"""Portable motion contracts plus opt-in adversarial tests against a genuine source bank.

MOTION_TEST_BANK=verification/.../shared-bank-001/bank.json python3 -m unittest discover -s scripts/assets -p test_motion_tooling.py
"""
import copy
import os
from pathlib import Path
import tempfile
import unittest

from motion_bank_proof import contract_digest, validate_bank
from motion_inventory import DEFAULT_MOTION_RECIPE, validate_inventory
from motion_sampling import SOURCE_STATES, NATIVE_STATES, FRAME_SELECTION, native_ancestry
from motion_lottie import flat_document
from rebuild_common import ROOT, read_json, write_json


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.recipe = read_json(DEFAULT_MOTION_RECIPE)

    def test_closed_inventory_and_immutable_history(self):
        validate_inventory(self.recipe)

    def test_missing_brazier_is_rejected(self):
        self.recipe['assets'] = [a for a in self.recipe['assets'] if a['id'] != 'stage.brazier']
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_duplicate_actor_is_rejected(self):
        self.recipe['assets'][0] = self.recipe['assets'][1]
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_missing_move_pose_is_rejected(self):
        actor = next(a for a in self.recipe['assets'] if a['id'] == 'player.swift')
        actor['sourceStates']['move']['frames'] = 7
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_two_times_resources_are_required(self):
        self.recipe['assets'][0]['resourceScale'] = 4
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_full_cycle_uniform_sampling_preserves_state_durations(self):
        for state in ['idle', 'move']:
            source, target = SOURCE_STATES[state], NATIVE_STATES[state]
            self.assertEqual(source['frames'] / source['fps'], target['frames'] / target['fps'])
            self.assertEqual([index / source['fps'] for index in FRAME_SELECTION[state]],
                             [index / target['fps'] for index in range(target['frames'])])
        self.assertEqual(len(native_ancestry()), 12)

    def test_selecting_convenient_idle_poses_is_rejected(self):
        actor = next(a for a in self.recipe['assets'] if a['id'] == 'player.swift')
        actor['frameSelection']['idle'] = [0, 1, 2, 3]
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_old_four_source_idle_contract_is_rejected(self):
        actor = next(a for a in self.recipe['assets'] if a['id'] == 'player.swift')
        actor['sourceStates']['idle'] = {'frames': 4, 'fps': 2, 'durationSeconds': 2}
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_discarding_unsampled_source_proofs_is_rejected(self):
        self.recipe['bankExport']['sourcePoseCount'] = 12
        with self.assertRaises(ValueError):
            validate_inventory(self.recipe)

    def test_one_shot_fade_reaches_zero_before_exclusive_out_point(self):
        for id in ['fx.hit', 'fx.enemyDeath']:
            asset = next(a for a in self.recipe['assets'] if a['id'] == id)
            document = flat_document(asset)
            final = document['layers'][0]['ks']['o']['k'][-1]
            self.assertEqual(final['t'], document['op'] - 1)
            self.assertEqual(final['s'], [0])
            self.assertEqual(document['op'] / document['fr'], asset['runtime']['durationSeconds'])

    def test_master_changes_change_export_contract(self):
        actor = next(a for a in self.recipe['assets'] if a['id'] == 'player.swift')
        original = contract_digest(self.recipe, actor)
        actor['master']['sha256'] = '0' * 64
        self.assertNotEqual(original, contract_digest(self.recipe, actor))


@unittest.skipUnless(os.environ.get('MOTION_TEST_BANK'), 'Set MOTION_TEST_BANK for genuine-source adversarial controls')
class GenuineBankTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = (ROOT / os.environ['MOTION_TEST_BANK']).resolve()
        cls.bank = read_json(cls.path)
        cls.recipe = read_json(DEFAULT_MOTION_RECIPE)
        cls.asset = next(a for a in cls.recipe['assets'] if a['id'] == cls.bank['id'])
        tool_root = Path(os.environ.get('MOTION_TOOL_ROOT', str(ROOT / 'verification/issue-84/tool/sprite-gen')))
        cls.tool = tool_root.resolve() / '.venv/bin/sprite-gen'

    def validate_mutation(self, mutate):
        value = copy.deepcopy(self.bank)
        mutate(value)
        with tempfile.NamedTemporaryFile(prefix='adversarial-', suffix='.json', dir=self.path.parent) as temporary:
            path = Path(temporary.name)
            write_json(path, value)
            with self.assertRaises((ValueError, KeyError, FileNotFoundError)):
                validate_bank(path, self.recipe, self.asset, self.tool)

    def test_genuine_control_replays_unchanged(self):
        validate_bank(self.path, self.recipe, self.asset, self.tool)

    def test_empty_frames(self):
        self.validate_mutation(lambda b: b.update(frames=[]))

    def test_individual_fitting(self):
        self.validate_mutation(lambda b: b.update(perPoseBboxFit=True))

    def test_custom_operations(self):
        self.validate_mutation(lambda b: b.update(operations=['custom-resize']))

    def test_missing_input_proof(self):
        self.validate_mutation(lambda b: b.update(inputProof={}))

    def test_missing_palette(self):
        self.validate_mutation(lambda b: b.update(sharedPalette={}))

    def test_forged_frame_hash(self):
        self.validate_mutation(lambda b: b['frames'][0].update(sha256='0' * 64))

    def test_other_row_source_cannot_be_substituted(self):
        self.validate_mutation(lambda b: b['frames'][0]['sourceRow'].update(rawSha256='0' * 64))

    def test_authored_scale_cannot_replace_actual_common_scale(self):
        self.validate_mutation(lambda b: b.update(commonScale=99))

    def test_self_reported_continuity_cannot_override_actual_evidence(self):
        self.validate_mutation(lambda b: b.update(sourceScaleContinuity={'status': 'approved'}))

    def test_missing_pose_cannot_be_duplicated(self):
        self.validate_mutation(lambda b: b['frames'].__setitem__(1, copy.deepcopy(b['frames'][0])))

    def test_unsampled_idle_pose_cannot_be_omitted(self):
        self.validate_mutation(lambda b: b['sourceFrames'].pop(1))

    def test_fixed_ancestry_cannot_select_convenient_pose(self):
        self.validate_mutation(lambda b: b['frames'][1].update(sourceIndex=1))

    def test_full_cycle_source_duration_cannot_change(self):
        self.validate_mutation(lambda b: b['sampling']['sourceStates']['idle'].update(fps=2))

    def test_arbitrary_state_factor_cannot_override_official_replay(self):
        self.validate_mutation(lambda b: b['stateCalibration'].update(idle=99))

    def test_canonical_hash_cannot_be_substituted(self):
        self.validate_mutation(lambda b: b['sourceFrames'][0].update(canonicalComparisonSha256='0' * 64))


if __name__ == '__main__':
    unittest.main()
