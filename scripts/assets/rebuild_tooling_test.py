"""Guard the rebuild boundary against omissions, altered evidence and invalid images."""
from copy import deepcopy
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

import rebuild_common as common
import rebuild_receipt as receipt


def chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))


def image_bytes(extra=b''):
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)) +
            extra + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\xff')) + chunk(b'IEND', b''))


class RebuildGuards(unittest.TestCase):
    def setUp(self):
        self.recipe = common.read_json(common.DEFAULT_RECIPE)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.image = self.root / 'image.png'
        self.image.write_bytes(image_bytes())

    def test_complete_plan_has_each_target_once(self):
        common.validate_recipe(self.recipe)
        broken = deepcopy(self.recipe)
        broken['jobs'][0]['targets'][0] = broken['jobs'][0]['targets'][1]
        with self.assertRaisesRegex(ValueError, 'every one'):
            common.validate_recipe(broken)

    def test_font_cannot_be_regenerated_or_other_art_preserved(self):
        broken = deepcopy(self.recipe)
        next(asset for asset in broken['assets'] if asset['id'] == 'font.hud')['action'] = 'regenerate'
        with self.assertRaisesRegex(ValueError, 'Only the licensed'):
            common.validate_recipe(broken)

    def test_new_targets_have_no_fabricated_original(self):
        self.assertEqual(len(self.recipe['baselineIds']), 82)
        self.assertEqual(set(self.recipe['additions']), {'player.aurelia', 'portrait.aurelia'})
        broken = deepcopy(self.recipe)
        new = next(asset for asset in broken['assets'] if asset['id'] == 'player.aurelia')
        new['originalSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'must not invent original'):
            common.validate_recipe(broken)

    def test_an_addition_cannot_replace_a_baseline_target(self):
        broken = deepcopy(self.recipe)
        next(asset for asset in broken['assets'] if asset['id'] == 'player.warden')['id'] = 'player.other'
        with self.assertRaisesRegex(ValueError, 'Baseline asset identities changed'):
            common.validate_recipe(broken)

    def test_png_metadata_corruption_and_trailing_data_are_rejected(self):
        self.assertEqual(common.validate_png(self.image), (1, 1))
        for malformed in [image_bytes(chunk(b'tEXt', b'private=data')),
                          image_bytes() + b'trailing', image_bytes()[:-5]]:
            self.image.write_bytes(malformed)
            with self.assertRaises(ValueError):
                common.validate_png(self.image)
        data = bytearray(image_bytes())
        data[29] ^= 1
        self.image.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'CRC'):
            common.validate_png(self.image)

    def test_provider_and_image_identity_are_verified(self):
        report = self.root / 'report.json'
        value = {'provider': 'codex', 'provider_resolved_from': 'explicit',
                 'extra': {'auth_source': 'codex-login', 'inline_results': 1},
                 'out': str(self.image), 'prompt': 'test', 'session_id': 'test', 'refs': []}
        common.write_json(report, value)
        with patch.object(common, 'ROOT', self.root):
            self.assertEqual(common.generation_source(self.image, report)['provider'], 'codex')
            for change in [{'provider': 'api'}, {'out': str(self.root / 'different.png')},
                           {'extra': {'auth_source': 'api-key', 'inline_results': 1}}]:
                common.write_json(report, value | change)
                with self.assertRaises(ValueError):
                    common.generation_source(self.image, report)

    def test_receipt_refuses_omissions_before_publishing(self):
        with self.assertRaisesRegex(ValueError, 'Missing generated candidates'):
            receipt.assemble(self.recipe, [self.root], True, False)

    def test_complete_receipt_still_protects_font_bytes(self):
        entries = [{'id': asset['id']} for asset in self.recipe['assets']
                   if asset['action'] != 'preserve']
        common.write_json(self.root / 'candidates.json', {'entries': entries})
        font = next(asset for asset in self.recipe['assets'] if asset['id'] == 'font.hud')
        target = self.root / 'assets' / font['originalFile']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b'changed font')
        with patch.object(receipt, 'ROOT', self.root), patch.object(receipt, 'validate_entry'):
            with self.assertRaisesRegex(ValueError, 'Protected HUD font changed'):
                receipt.assemble(self.recipe, [self.root], False, False)

    def test_receipt_rejects_duplicated_target_from_parallel_producers(self):
        identifier = self.recipe['jobs'][0]['targets'][0]
        common.write_json(self.root / 'candidates.json', {'entries': [{'id': identifier}, {'id': identifier}]})
        with patch.object(receipt, 'validate_entry'):
            with self.assertRaisesRegex(ValueError, 'duplicate candidate ID'):
                receipt.assemble(self.recipe, [self.root], False, False)

    def test_unavailable_subscription_cannot_start_generation(self):
        class Status:
            returncode = 1
            stdout = ''
            stderr = 'unavailable'
        with patch.object(common.subprocess, 'run', return_value=Status()):
            with self.assertRaisesRegex(ValueError, 'no API/provider fallback'):
                common.require_subscription()


if __name__ == '__main__':
    unittest.main()
