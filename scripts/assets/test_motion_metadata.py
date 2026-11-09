"""Actual main role/usage semantics survive baseline builds; every other catalog field is closed."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from motion_publish import update_catalog
from motion_publish_baseline import restore_diagnostic
from motion_publish_metadata import catalog_rows, overlay_catalog_metadata
from motion_inventory import DEFAULT_MOTION_RECIPE, MOTION_IDS
from rebuild_common import ROOT, read_json

RECIPE = read_json(DEFAULT_MOTION_RECIPE)


class CatalogSemanticOverlayTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='catalog-overlay-', dir=ROOT / 'verification')
        self.addCleanup(self.temporary.cleanup); self.base = Path(self.temporary.name)
        self.original = subprocess.check_output(['git', 'show', RECIPE['baseMain'] + ':assets/CATALOG.md'], cwd=ROOT, text=True)
        self.current = (ROOT / 'assets/CATALOG.md').read_text()
        self.target = self.base / 'CATALOG.md'; self.target.write_text(self.original)
        original_manifest = subprocess.check_output(
            ['git', 'show', RECIPE['baseMain'] + ':assets/manifest.json'], cwd=ROOT)
        restore_diagnostic(RECIPE, self.base, json.loads(original_manifest))
        self.original = self.target.read_text()
        update_catalog(self.target, MOTION_IDS)
        self.formatted = self.target.read_text()

    def source(self, value):
        path = self.base / 'current.md'; path.write_text(value); return path

    def test_actual_current_roles_and_usage_survive_without_geometry_mass_or_order_changes(self):
        overlay_catalog_metadata(self.target, self.source(self.current), RECIPE)
        output, _ = catalog_rows(self.target.read_text()); current, _ = catalog_rows(self.current)
        baseline, _ = catalog_rows(self.formatted)
        self.assertEqual(len(output), 85); self.assertEqual(list(output), list(baseline))
        self.assertEqual(sum('**mass**' in row['Format'] for row in output.values()), 18)
        for id, row in output.items():
            for field in ['Original role', 'Used by']: self.assertEqual(row[field], current[id][field])
            for field in row.keys() - {'Original role', 'Used by'}: self.assertEqual(row[field], baseline[id][field])
        self.assertIn('Cross starter (#14)', output['player.aurelia']['Original role'])
        self.assertEqual(output['player.aurelia']['Used by'], 'G3')
        for id in ['portrait.swift', 'portrait.aurelia']: self.assertIn('character-select portrait (#14)', output[id]['Original role'])

    def test_preinstallation_original_png_catalog_also_remains_supported(self):
        overlay_catalog_metadata(self.target, self.source(self.original), RECIPE)
        output, _ = catalog_rows(self.target.read_text())
        self.assertTrue(all(output[id]['Format'].startswith('lottie') for id in MOTION_IDS))
        self.assertEqual(sum('**mass**' in row['Format'] for row in output.values()), 18)

    def test_unexpected_catalog_metadata_or_prose_rejects_without_writing_target(self):
        attacks = [
            self.current.replace('| `enemy.bat` | 32×32 |', '| `enemy.bat` | 999×999 |'),
            self.current.replace('lottie, **mass**', 'lottie', 1),
            self.current.replace('| png | Weapon icons |', '| lottie | Weapon icons |', 1),
            self.current.replace('| C2, G3 | final |', '| C2, G3 | needed |', 1),
            self.current.replace('`font.hud`', '`font.unknown`', 1),
            self.current.replace('`fonts/hud.ttf`', '`fonts/other.ttf`', 1),
            self.current + '\nUnexpected publisher metadata or policy.\n',
            self.current.replace('`enemy.bat`', '`enemy.bat` ignored-metadata', 1),
            self.current.replace('| Original role | Used by |', '| Used by | Original role |', 1),
        ]
        for index, changed in enumerate(attacks):
            self.assertNotEqual(changed, self.current)
            with self.subTest(attack=index), self.assertRaises(ValueError):
                overlay_catalog_metadata(self.target, self.source(changed), RECIPE)
            self.assertEqual(self.target.read_text(), self.formatted)


if __name__ == '__main__': unittest.main()
