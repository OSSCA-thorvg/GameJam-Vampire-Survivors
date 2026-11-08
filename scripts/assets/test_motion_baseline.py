"""Actual immutable Git baseline repeatability, catalog mass metadata, and unsafe tree rejection."""
import copy
from pathlib import Path
import subprocess
import tempfile
import unittest

from motion_publish import update_catalog
from motion_publish_baseline import BASELINE, restore_baseline, tree_entries
from motion_inventory import DEFAULT_MOTION_RECIPE, MOTION_IDS
from rebuild_common import ROOT, digest, read_json

RECIPE = read_json(DEFAULT_MOTION_RECIPE)


def rows(text):
    return {line.split('|')[1].strip(' `'): line.split('|') for line in text.splitlines() if line.startswith('| `')}


class BaselineRestorationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='immutable-baseline-', dir=ROOT / 'verification')
        self.addCleanup(self.temporary.cleanup); self.base = Path(self.temporary.name)

    def test_actual90file_git_tree_restores_identically_without_reading_installed_pack(self):
        public_before = {p.relative_to(ROOT / 'assets').as_posix(): digest(p) for p in (ROOT / 'assets').rglob('*') if p.is_file()}
        first, second = self.base / 'first', self.base / 'second'
        a, b = restore_baseline(RECIPE, first), restore_baseline(RECIPE, second)
        self.assertEqual(a, b); self.assertEqual((a['files'], a['logicalIds']), (90, 84))
        hashes = lambda directory: {p.relative_to(directory).as_posix(): digest(p) for p in directory.rglob('*') if p.is_file()}
        self.assertEqual(hashes(first), hashes(second))
        manifest = read_json(first / 'manifest.json')['assets']
        self.assertEqual(sum(e['format'] == 'lottie' for e in manifest.values()), 2)
        self.assertEqual(manifest['enemy.bat']['file'], 'enemies/bat.png')
        self.assertEqual(public_before, hashes(ROOT / 'assets'))

    def test_actual_catalog_retains_all18_mass_flags_and_nonformat_metadata(self):
        text = subprocess.check_output(['git', 'show', BASELINE + ':assets/CATALOG.md'], cwd=ROOT, text=True)
        path = self.base / 'CATALOG.md'; path.write_text(text); before = rows(text)
        update_catalog(path, MOTION_IDS); after = rows(path.read_text())
        mass = lambda table: {id for id, row in table.items() if '**mass**' in row[3]}
        self.assertEqual(len(mass(before)), 18); self.assertEqual(mass(before), mass(after))
        self.assertEqual(set(before), set(after)); self.assertIn('**mass**', after['enemy.bat'][3])
        for id, row in before.items():
            self.assertEqual(row[1:3] + row[4:6], after[id][1:3] + after[id][4:6])
            self.assertEqual(after[id][3].strip().split(',')[0], 'lottie' if id in MOTION_IDS else row[3].strip().split(',')[0])
        self.assertNotIn('Lottie stays reserved', path.read_text()); self.assertIn('0019', path.read_text())

    def test_symlink_parent_or_existing_target_never_writes_outside(self):
        outside = self.base / 'outside'; outside.mkdir(); (outside / 'sentinel').write_text('unchanged')
        link = self.base / 'link'; link.symlink_to(outside, target_is_directory=True)
        for target in [link, link / 'child']:
            with self.assertRaises(ValueError): restore_baseline(RECIPE, target)
        self.assertEqual(list(outside.iterdir()), [outside / 'sentinel'])

    def test_tree_rejects_symlink_gitlink_nonblob_and_path_escape(self):
        for mode, kind, path in [('120000', 'blob', 'assets/link'), ('160000', 'commit', 'assets/submodule'),
                ('040000', 'tree', 'assets/tree'), ('100644', 'blob', 'assets/../outside'),
                ('100644', 'blob', 'assets/./bad'), ('100644', 'blob', '/assets/bad')]:
            with self.subTest(path=path, mode=mode), self.assertRaises(ValueError):
                tree_entries((mode + ' ' + kind + ' ' + '0' * 40 + '\t' + path + '\0').encode())

    def test_forged_baseline_commit_or_protected_master_rejects(self):
        recipe = copy.deepcopy(RECIPE); recipe['baseMain'] = '0' * 40
        with self.assertRaises(ValueError): restore_baseline(recipe, self.base / 'bad-commit')
        self.assertFalse((self.base / 'bad-commit').exists())
        recipe = copy.deepcopy(RECIPE); recipe['staticMasters'][0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'protected master'):
            restore_baseline(recipe, self.base / 'bad-master')


if __name__ == '__main__': unittest.main()
