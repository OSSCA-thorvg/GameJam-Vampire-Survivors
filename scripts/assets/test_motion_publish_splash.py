"""Splash publication preserves its pinned files and admits no other additions."""
from pathlib import Path
import shutil
import tempfile
import unittest

from motion_inventory import DEFAULT_MOTION_RECIPE
from motion_publish import asset_diff
from motion_publish_metadata import catalog_rows, check_catalog_rows
from motion_publish_splash import SPLASH_FILES, SPLASH_ID, insert_splash_catalog_row, install_splash
from rebuild_common import ROOT, digest, read_json


class SplashPublicationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='motion-splash-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.current = self.base / 'current'
        for file in ('manifest.json', *SPLASH_FILES):
            target = self.current / file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'assets' / file, target)
        self.manifest = read_json(self.current / 'manifest.json')
        self.entry = self.manifest['assets'].pop(SPLASH_ID)

    def test_installs_pinned_files_and_preserves_manifest_order(self):
        staged = self.base / 'staged'
        install_splash(staged, self.manifest, self.current)

        self.assertEqual(self.manifest['assets'][SPLASH_ID], self.entry)
        keys = list(self.manifest['assets'])
        self.assertEqual(keys[keys.index(SPLASH_ID) + 1], 'ui.xpBar')
        self.assertEqual(self.manifest, read_json(self.current / 'manifest.json'))
        for file, expected in SPLASH_FILES.items():
            self.assertEqual(digest(staged / file), expected)
            self.assertEqual((staged / file).read_bytes(), (self.current / file).read_bytes())

    def test_modified_source_bytes_rejected_for_both_files(self):
        for file in SPLASH_FILES:
            with self.subTest(file=file):
                source = self.current / file
                original = source.read_bytes()
                source.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
                try:
                    with self.assertRaisesRegex(ValueError, 'source bytes changed'):
                        install_splash(self.base / 'bad-stage', self.manifest, self.current)
                    self.assertNotIn(SPLASH_ID, self.manifest['assets'])
                finally:
                    source.write_bytes(original)

    def test_symlinked_source_rejected_even_when_bytes_match(self):
        file = 'ui/splash.json'
        source = self.current / file
        source.unlink()
        source.symlink_to(ROOT / 'assets' / file)
        with self.assertRaisesRegex(ValueError, 'symlinked ancestors and targets'):
            install_splash(self.base / 'staged', self.manifest, self.current)
        self.assertNotIn(SPLASH_ID, self.manifest['assets'])

    def test_catalog_restores_exact_row_after_predecessor(self):
        current = ROOT / 'assets/CATALOG.md'
        text = current.read_text()
        splash = next(line for line in text.splitlines() if line.startswith('| `ui.splash` |'))
        staged = self.base / 'CATALOG.md'
        staged.write_text(text.replace(splash + '\n', ''))

        insert_splash_catalog_row(staged, current)
        lines = staged.read_text().splitlines()
        self.assertTrue(lines[lines.index(splash) - 1].startswith('| `ui.skull` |'))
        self.assertEqual(staged.read_text(), text)

    def test_catalog_rejects_missing_and_duplicate_source_or_preceding_rows(self):
        predecessor = '| `ui.skull` | 16×16 |\n'
        splash = '| `ui.splash` | 1920×1080 |\n'
        current = self.base / 'current.md'
        staged = self.base / 'staged.md'
        for source_rows, target_rows in (
            (predecessor, predecessor),
            (predecessor + splash + splash, predecessor),
            (splash, predecessor),
            (predecessor + predecessor + splash, predecessor),
            (predecessor + splash, ''),
            (predecessor + splash, predecessor + predecessor),
            (predecessor + splash, predecessor + splash),
        ):
            with self.subTest(source=source_rows, target=target_rows):
                current.write_text(source_rows)
                staged.write_text(target_rows)
                with self.assertRaises(ValueError):
                    insert_splash_catalog_row(staged, current)
                self.assertEqual(staged.read_text(), target_rows)

    def test_catalog_overlay_accepts_only_the_splash_as_extra_id(self):
        recipe = read_json(DEFAULT_MOTION_RECIPE)
        current, _ = catalog_rows((ROOT / 'assets/CATALOG.md').read_text())
        baseline = {asset_id: row for asset_id, row in current.items() if asset_id != SPLASH_ID}

        check_catalog_rows(recipe, baseline, current)
        extra = current | {'ui.extra': current[SPLASH_ID]}
        missing = {asset_id: row for asset_id, row in current.items() if asset_id != 'ui.skull'}
        for rows in (extra, missing):
            with self.subTest(ids=rows.keys()), self.assertRaisesRegex(ValueError, 'exact closed85'):
                check_catalog_rows(recipe, baseline, rows)

    def test_diff_accepts_only_the_two_splash_paths(self):
        before, after = self.base / 'before', self.base / 'after'
        before.mkdir()
        install_splash(after, self.manifest, self.current)
        recipe = {'assets': [], 'diagnosticMaster': {'file': 'assets/enemies/lottie-test.json'}}

        self.assertEqual(asset_diff(before, after, recipe)['added'], sorted(SPLASH_FILES))
        for file in ('ui/extra.png', 'ui/splash/extra.png'):
            extra = after / file
            extra.write_bytes(b'not a splash resource')
            with self.subTest(file=file), self.assertRaisesRegex(ValueError, 'unexpected resource path'):
                asset_diff(before, after, recipe)
            extra.unlink()


if __name__ == '__main__': unittest.main()
