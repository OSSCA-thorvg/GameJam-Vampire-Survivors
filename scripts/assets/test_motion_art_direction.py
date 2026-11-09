"""A later explicit Wraith design decision must survive review/archive without rewriting source."""
import copy
import unittest

from motion_direction_proof import DIRECTION, WRAITH_STYLE, direction_original, validate_asset_direction, validate_direction_original, validate_review_direction


class WraithDirectionTests(unittest.TestCase):
    def test_committed_user_decision_survives_portable_exact_bytes(self):
        validate_direction_original(direction_original())

    def test_new_review_schema_binds_exact_later_decision(self):
        review = {'locomotionStyle': WRAITH_STYLE, 'artDirection': dict(DIRECTION)}
        validate_review_direction('enemy.wraith', review)
        # Schema fixture only: no bank hash, review or art approval is created.
        for changed in [{}, review | {'locomotionStyle': 'alternating'}, review | {'artDirection': DIRECTION | {'sha256': '0' * 64}}]:
            with self.assertRaisesRegex(ValueError, 'Both new Wraith reviews'):
                validate_review_direction('enemy.wraith', changed)

    def test_other_actor_reviews_keep_their_existing_contract(self):
        validate_review_direction('enemy.ghoul', {'states': {'idle': 'pass', 'move': 'pass'}})

    def test_direction_cannot_be_forged_or_omitted_from_archive(self):
        for record in [None, {}, direction_original() | {'sha256': '0' * 64}]:
            with self.assertRaises(ValueError): validate_direction_original(record)
        record = copy.deepcopy(direction_original()); record['originalUtf8'] += ' '
        with self.assertRaisesRegex(ValueError, 'bytes changed'): validate_direction_original(record)

    def test_inventory_cannot_restore_superseded_alternation_style(self):
        asset = {'id': 'enemy.wraith', 'locomotionStyle': WRAITH_STYLE, 'artDirection': dict(DIRECTION)}
        validate_asset_direction(asset)
        with self.assertRaises(ValueError): validate_asset_direction(asset | {'locomotionStyle': 'alternating'})


if __name__ == '__main__': unittest.main()
