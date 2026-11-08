"""Rehashed valid native JSON cannot reorder or retime genuinely reviewed pose images."""
import copy
from pathlib import Path
import tempfile
import unittest

from motion_publish_factory import native_document
from motion_publish_receipt import archive_source
from motion_publish_verify import verify_source_proof
from motion_inventory import DEFAULT_MOTION_RECIPE
from rebuild_common import ROOT, digest, read_json, write_json

RECIPE = read_json(DEFAULT_MOTION_RECIPE)
CONTROLS = [
    'verification/issue-84/generation/swift-004/shared-bank-canonical-row-003/bank.json',
    'verification/issue-84/generation/bat-002/shared-bank-raw-coordinate-002/bank.json',
    'verification/issue-84/generation/enemies-stage/stage-001/bank-003/stage-bank.json',
]


@unittest.skipUnless(all((ROOT / file).exists() for file in CONTROLS), 'Genuine reviewed source cache required')
class NativeSourceBindingTests(unittest.TestCase):
    def test_actual_actor_and_stage_controls_then_rehashed_mapping_timing_attacks(self):
        for relative in CONTROLS:
            with self.subTest(source=relative), tempfile.TemporaryDirectory(prefix='native-binding-', dir=ROOT / 'verification') as temporary:
                base = Path(temporary); path = ROOT / relative; bank = read_json(path)
                asset = next(a for a in RECIPE['assets'] if a['id'] == bank['id'])
                evidence = archive_source(bank['id'], {'file': relative, 'sha256': digest(path), 'bank': bank}, base)
                proof = ROOT / evidence['stagedSourceProofFile']; evidence['sourceProofSha256'] = digest(proof)
                document = native_document(asset); primary = base / 'assets' / asset['outputFile']; write_json(primary, document)
                records = bank['frames'] if 'frames' in bank else bank['records']; stem = Path(asset['outputFile']).with_suffix('')
                evidence['installedFiles'] = [{'file': asset['outputFile'], 'role': 'primary', 'sha256': digest(primary)}] + [
                    {'file': (stem / (f'pose-{i}.png' if 'frames' in bank else frame['name'] + '.png')).as_posix(),
                     'role': 'owned-image', 'sha256': frame['sha256']} for i, frame in enumerate(records)]
                check = lambda value: verify_source_proof(proof, base / 'source-archive', value, base / 'assets', asset)
                check(evidence)
                for attack in ['image-path-order', 'layer-ref-order', 'pose-timing']:
                    changed = copy.deepcopy(document)
                    if attack == 'image-path-order':
                        changed['assets'][0]['p'], changed['assets'][1]['p'] = changed['assets'][1]['p'], changed['assets'][0]['p']
                    else:
                        layers = changed['assets'][-1]['layers'] if asset['kind'] == 'actor' else changed['layers']
                        if attack == 'layer-ref-order': layers[0]['refId'], layers[1]['refId'] = layers[1]['refId'], layers[0]['refId']
                        else: layers[0]['op'] -= .25
                    write_json(primary, changed); forged = copy.deepcopy(evidence); forged['installedFiles'][0]['sha256'] = digest(primary)
                    with self.subTest(attack=attack), self.assertRaisesRegex(ValueError, 'Native wrapper resource IDs'):
                        check(forged)
                write_json(primary, document); check(evidence)
                with self.assertRaisesRegex(ValueError, 'Actual runtime assets root'):
                    verify_source_proof(proof, base / 'source-archive', evidence)


if __name__ == '__main__': unittest.main()
