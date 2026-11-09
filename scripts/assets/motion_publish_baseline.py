"""Restore the immutable pre-motion Git tree; never use the installed pack as build input."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import subprocess

from motion_inventory import reject_symlink_chain
from rebuild_common import ROOT, digest, read_json

BASELINE = '65f92ab58da2c42340784840cb6b3b11e9ed7487'
SUPPORT = {'CATALOG.md', 'README.md', 'manifest.json', 'fonts/LICENSE-NotoSansMono.txt'}


def tree_entries(data):
    entries = {}
    for record in data.split(b'\0'):
        if not record: continue
        metadata, raw = record.split(b'\t', 1); mode, kind, oid = metadata.decode('ascii').split()
        name = raw.decode('utf-8'); path = PurePosixPath(name)
        if (mode not in {'100644', '100755'} or kind != 'blob' or not name.startswith('assets/') or
                path.is_absolute() or any(p in {'.', '..'} for p in path.parts) or '\\' in name or
                any(ord(char) < 32 for char in name) or name != path.as_posix()):
            raise ValueError('Baseline forbids symlink/nonblob entries and noncanonical assets paths')
        relative = path.relative_to('assets').as_posix()
        if not relative or relative in entries: raise ValueError('Baseline asset paths must be unique files')
        entries[relative] = oid
    return entries


def verify_baseline(recipe, directory, entries):
    manifest = read_json(directory / 'manifest.json')['assets']
    masters = {master['id']: master for master in recipe['staticMasters']}
    masters.update({asset['id']: asset['master'] for asset in recipe['assets']})
    if len(entries) != 90 or len(manifest) != 84 or set(manifest) != set(recipe['logicalIds']) - {recipe['diagnosticMaster']['id']}:
        raise ValueError('Immutable pre-motion baseline requires its original90files and84 logical IDs')
    protected = list(masters.values()) + [resource for asset in recipe['assets'] for resource in asset['master'].get('resources', [])]
    expected = {Path(master['file']).relative_to('assets').as_posix() for master in protected} | SUPPORT
    if set(entries) != expected: raise ValueError('Git baseline has missing or orphan files')
    for id, master in masters.items():
        if manifest[id]['file'] != Path(master['file']).relative_to('assets').as_posix():
            raise ValueError('Baseline manifest primary differs from its exact protected master')
    for master in protected:
        relative = Path(master['file']).relative_to('assets').as_posix()
        if master['gitCommit'] != BASELINE or entries[relative] != master['gitBlob'] or digest(directory / relative) != master['sha256']:
            raise ValueError('Baseline protected master Gitblob/SHA identity changed')


def restore_baseline(recipe, output):
    if recipe['baseMain'] != BASELINE: raise ValueError('Publication requires the pinned pre-motion baseline commit')
    reject_symlink_chain(output.absolute()); output = output.resolve(); output.relative_to(ROOT / 'verification')
    if output.exists(): raise ValueError('Baseline restoration requires a fresh output directory')
    raw = subprocess.check_output(['git', 'ls-tree', '-r', '-z', '--full-tree', BASELINE, '--', 'assets/'], cwd=ROOT)
    entries = tree_entries(raw)
    for relative, oid in entries.items():
        target = output / relative; reject_symlink_chain(target); target.resolve().relative_to(output)
        target.parent.mkdir(parents=True, exist_ok=True); reject_symlink_chain(target)
        data = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=ROOT)
        target.write_bytes(data)
    verify_baseline(recipe, output, entries)
    return {'commit': BASELINE, 'assetsTree': subprocess.check_output(['git', 'rev-parse', BASELINE + ':assets'], cwd=ROOT, text=True).strip(),
            'files': 90, 'logicalIds': 84, 'protectedMasterChecks': 'exact Gitblob and SHA256',
            'manifestSha256': digest(output / 'manifest.json')}


def restore_diagnostic(recipe, directory, manifest):
    master = recipe['diagnosticMaster']
    id, commit, file = master['id'], master['gitCommit'], master['file']
    relative = Path(file).relative_to('assets')
    raw = subprocess.check_output(['git', 'ls-tree', '-z', '--full-tree', commit, '--', file], cwd=ROOT)
    if tree_entries(raw) != {relative.as_posix(): master['gitBlob']}:
        raise ValueError('Upstream diagnostic Gitblob changed')
    data = subprocess.check_output(['git', 'cat-file', 'blob', master['gitBlob']], cwd=ROOT)
    if hashlib.sha256(data).hexdigest() != master['sha256']:
        raise ValueError('Upstream diagnostic SHA changed')
    upstream = subprocess.check_output(['git', 'show', commit + ':assets/manifest.json'], cwd=ROOT)
    entry = json.loads(upstream)['assets'][id]
    if entry != master['manifestEntry'] or id in manifest['assets']:
        raise ValueError('Unexpected upstream diagnostic manifest entry')
    entries = list(manifest['assets'].items())
    position = list(manifest['assets']).index('enemy.wraith') + 1
    entries.insert(position, (id, entry))
    catalog = directory / 'CATALOG.md'
    reject_symlink_chain(catalog)
    lines = catalog.read_text().splitlines()
    upstream_catalog = subprocess.check_output(['git', 'show', commit + ':assets/CATALOG.md'], cwd=ROOT, text=True)
    row = next(line for line in upstream_catalog.splitlines() if line.startswith(f'| `{id}`'))
    index = next(i for i, line in enumerate(lines) if line.startswith('| `enemy.wraith`'))
    target = directory / relative
    reject_symlink_chain(target)
    target.resolve().relative_to(directory.resolve())
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as output:
        output.write(data)
    manifest['assets'] = dict(entries)
    lines.insert(index + 1, row)
    catalog.write_text('\n'.join(lines) + '\n')
