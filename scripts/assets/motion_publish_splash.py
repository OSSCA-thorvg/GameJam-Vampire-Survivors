"""Carry the pinned ADR 0020 splash outside the sealed motion receipt."""
from pathlib import Path

from motion_inventory import reject_symlink_chain
from motion_publish_sources import copy_resource
from rebuild_common import ROOT, read_json

SPLASH_ID = 'ui.splash'
SPLASH_FILES = {
    'ui/splash.json': '15c4dda63fff855e6497b89dac10c3d29e85b8ae84ce23ff5ca783f956846f89',
    'ui/splash/logo.png': '0233d9febd4a64384b2c4b8703dd137798236ef85bbcd3777597638a1f757904',
}
SPLASH_ROW = f'| `{SPLASH_ID}` |'


def install_splash(assets: Path, manifest: dict, current_root: Path = ROOT / 'assets') -> None:
    source_manifest = current_root / 'manifest.json'
    reject_symlink_chain(source_manifest)
    entry = read_json(source_manifest)['assets'].get(SPLASH_ID)
    entries = list(manifest['assets'].items())
    if not isinstance(entry, dict) or SPLASH_ID in manifest['assets']:
        raise ValueError('Publication requires one installed splash and none in the baseline')
    position = next((i for i, (asset_id, _) in enumerate(entries) if asset_id > SPLASH_ID), None)
    if position is None:
        raise ValueError('Splash must precede another manifest entry for receipt projection')

    for file, expected in SPLASH_FILES.items():
        copy_resource(current_root / file, assets / file, expected)
    entries.insert(position, (SPLASH_ID, entry))
    manifest['assets'] = dict(entries)


def _single_row_index(lines: list[str], prefix: str) -> int:
    indexes = [i for i, line in enumerate(lines) if line.startswith(prefix)]
    if len(indexes) != 1:
        raise ValueError(f'Expected exactly one catalog row for {prefix}')
    return indexes[0]


def insert_splash_catalog_row(target: Path, source: Path) -> None:
    reject_symlink_chain(target)
    reject_symlink_chain(source)
    source_lines = source.read_text().splitlines()
    index = _single_row_index(source_lines, SPLASH_ROW)
    if index == 0 or not source_lines[index - 1].startswith('| `'):
        raise ValueError('Splash catalog row must follow another asset row')
    previous = source_lines[index - 1].split('|', 2)
    if len(previous) != 3:
        raise ValueError('Malformed preceding splash catalog row')
    prefix = f'|{previous[1]}|'
    _single_row_index(source_lines, prefix)

    lines = target.read_text().splitlines()
    if any(line.startswith(SPLASH_ROW) for line in lines):
        raise ValueError('Staged catalog already contains a splash row')
    position = _single_row_index(lines, prefix)
    lines.insert(position + 1, source_lines[index])
    target.write_text('\n'.join(lines) + '\n')
