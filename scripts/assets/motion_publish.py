"""Build an approved copied pack and allowlist diff; actual installation belongs to root review."""
import argparse
import json
import re
from pathlib import Path
import shutil
import subprocess

from motion_inventory import DEFAULT_MOTION_RECIPE, ACTORS, MOTION_IDS, reject_symlink_chain
from motion_lottie import actor_document, flat_document
from motion_publish_factory import native_document
from motion_publish_sources import source_plan, approved_sources, verify_preserved, copy_resource
from motion_publish_receipt import publication_receipt, archive_source
from motion_publish_rotation import fitted_document
from motion_publish_baseline import restore_baseline, restore_diagnostic
from motion_publish_metadata import overlay_catalog_metadata
from motion_publish_splash import SPLASH_FILES, install_splash, insert_splash_catalog_row
from rebuild_common import ROOT, checked_tool, read_json, write_json, digest, portable


def no_symlinks(directory):
    reject_symlink_chain(directory)
    if any(path.is_symlink() for path in directory.rglob('*')): raise ValueError('Pack/source tree contains a symlink')


def update_catalog(path, motion_ids):
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if line.startswith('- **Budget (ADRs '):
            lines[index] = '- **Budget (ADRs 0007/0016/0019):** rows marked **mass** appear in large numbers. Static PNGs use four-times logical dimensions; native motion uses two-times pose resources, nearest filtering and cached ThorVG image paints. See `README.md` for image/native budgets and ADR 0019 for the 36-motion-ID scope. Retained or future SVGs stay within4 paths, with no strokes or gradients.'
        elif 'by logical ID (ADRs 0007/0016).' in line:
            lines[index] = line.replace('by logical ID (ADRs 0007/0016).', 'by logical ID (ADRs 0007/0016/0019).')
        if not line.startswith('| `'): continue
        fields = line.split('|'); id = fields[1].strip(' `')
        if id in motion_ids:
            fields[3], changed = re.subn(r'^(\s*)(?:svg|png|webp|lottie)(?=\s*(?:,|$))', r'\1lottie', fields[3], count=1)
            if changed != 1: raise ValueError('Catalog Format cell must start with a recognized format token')
            fields[-2] = ' final '; lines[index] = '|'.join(fields)
    path.write_text('\n'.join(lines) + '\n')


def write_motion(asset, source, directory):
    id = asset['id']; target = directory / asset['outputFile']
    if id in ACTORS:
        document = native_document(asset)
        for index, frame in enumerate(source['bank']['frames']):
            image = document['assets'][index]
            copy_resource(ROOT / frame['file'], target.parent / image['p'], frame['sha256'])
    else:
        document = native_document(asset)
        for record in source['bank']['records']:
            copy_resource(ROOT / record['file'], target.with_suffix('') / (record['name'] + '.png'), record['sha256'])
    write_json(target, document)


def asset_diff(before, after, recipe):
    old = {path.relative_to(before).as_posix(): digest(path) for path in before.rglob('*') if path.is_file()}
    new = {path.relative_to(after).as_posix(): digest(path) for path in after.rglob('*') if path.is_file()}
    removed = sorted(old.keys() - new.keys()); added = sorted(new.keys() - old.keys())
    changed = sorted(file for file in old.keys() & new.keys() if old[file] != new[file])
    expected_removed = {Path(asset['master']['file']).relative_to('assets').as_posix() for asset in recipe['assets'] if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}}
    if set(removed) != expected_removed or set(changed) - {'manifest.json', 'CATALOG.md', 'README.md'}:
        raise ValueError('Publication modifies files outside its exact34-primary/support allowlist')
    allowed_prefixes = [Path(asset['outputFile']).with_suffix('').as_posix() + '/' for asset in recipe['assets'] if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}]
    primaries = {asset['outputFile'] for asset in recipe['assets'] if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}}
    allowed_files = primaries | set(SPLASH_FILES)
    allowed_files.add(Path(recipe['diagnosticMaster']['file']).relative_to('assets').as_posix())
    if any(file not in allowed_files and not any(file.startswith(prefix) for prefix in allowed_prefixes) for file in added):
        raise ValueError('Publication adds an unexpected resource path')
    return {'removed': removed, 'added': added, 'changed': changed, 'rootReviewRequiredBeforeInstall': True}


def build_pack(recipe, mapping, output, tool, node='node'):
    tool = checked_tool(tool.resolve().parents[2], {'source': recipe['tool']})
    sources = approved_sources(mapping, recipe, tool)
    output = output.absolute(); reject_symlink_chain(output)
    output.resolve().relative_to(ROOT / 'verification')
    if output.exists(): raise ValueError('Choose a fresh publication staging directory')
    baseline = output / 'baseline-assets'
    restoration = restore_baseline(recipe, baseline)
    assets = output / 'assets'; shutil.copytree(baseline, assets)
    readme = ROOT / 'assets/README.md'; reject_symlink_chain(readme)
    copy_resource(readme, assets / 'README.md', digest(readme))
    write_json(output / 'baseline-restoration.json', restoration)
    manifest = read_json(assets / 'manifest.json')
    restore_diagnostic(recipe, assets, manifest)
    install_splash(assets, manifest)
    for asset in recipe['assets']:
        id = asset['id']; entry = manifest['assets'][id]
        if entry['size'] != asset['logicalSize'] or entry['anchor'] != asset['anchor']: raise ValueError('Logical geometry changed')
        if id in sources: write_motion(asset, sources[id], assets)
        elif id not in {'fx.levelUp', 'fx.chestOpen'}: write_json(assets / asset['outputFile'], flat_document(asset))
        if id not in {'fx.levelUp', 'fx.chestOpen'}: (assets / entry['file']).unlink()
        entry.update(file=asset['outputFile'], format='lottie', loop=asset['kind'] == 'actor' or asset['runtime']['loop']); entry.pop('filter', None)
    actual_recipe = output / 'publication-recipe.json'; write_json(actual_recipe, recipe)
    write_json(output / 'source-map.json', mapping)
    archived = {id: archive_source(id, source, output) for id, source in sources.items()}
    derived_file = output / 'derived-resources.json'
    subprocess.run([str(tool.with_name('python')), str(ROOT / 'scripts/assets/motion_publish_images.py'), '--recipe',
        str(actual_recipe), '--assets', str(assets), '--report', str(derived_file)], check=True)
    derived = {item['id']: item for item in read_json(derived_file)['resources']}
    for asset in recipe['assets']:
        if asset['id'] in derived:
            write_json(assets / asset['outputFile'], fitted_document(flat_document(asset), derived[asset['id']]))
    update_catalog(assets / 'CATALOG.md', MOTION_IDS)
    overlay_catalog_metadata(assets / 'CATALOG.md', ROOT / 'assets/CATALOG.md', recipe)
    insert_splash_catalog_row(assets / 'CATALOG.md', ROOT / 'assets/CATALOG.md')
    write_json(assets / 'manifest.json', manifest)
    graph = json.loads(subprocess.check_output([node, '--import', 'tsx', str(ROOT / 'scripts/assets/motion_publish_graph.ts'),
        str(assets), str(actual_recipe), '--format', '--evidence-root', str(output / 'source-archive')], cwd=ROOT, text=True))
    verify_preserved(recipe, assets); difference = asset_diff(baseline, assets, recipe)
    receipt = finish_publication(recipe, graph, archived, derived, derived_file, output, assets, difference, node)
    return receipt


def finish_publication(recipe, graph, archived, derived, derived_file, output, assets, difference, node):
    for asset in recipe['assets']:
        if asset['id'] in {'fx.levelUp', 'fx.chestOpen'}: continue
        expected = native_document(asset)
        if asset['id'] in derived: expected = fitted_document(expected, derived[asset['id']])
        if read_json(assets / asset['outputFile']) != expected: raise ValueError('Formatted native wrapper differs from its exact factory contract')
    receipt = publication_receipt(recipe, graph, archived, read_json(derived_file), output)
    from motion_publish_verify import verify_receipt
    verify_receipt(receipt, graph, output / 'source-archive', recipe, assets)
    receipt_path = output / 'motion-84.receipt.json'; write_json(receipt_path, receipt)
    subprocess.run([node, str(ROOT / 'node_modules/prettier/bin/prettier.cjs'), '--write', '--ignore-path', '/dev/null', str(receipt_path)], check=True, cwd=ROOT)
    write_json(output / 'allowlist-diff.json', difference)
    write_json(output / 'publication-summary.json', {'phase': 'STAGED-NOT-INSTALLED', 'assetGraph': graph,
        'receiptSha256': digest(output / 'motion-84.receipt.json'), 'diff': difference})
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'build', 'verify', 'seal-installed'])
    parser.add_argument('--sources', type=Path); parser.add_argument('--out', type=Path); parser.add_argument('--staged', type=Path)
    parser.add_argument('--tool-root', type=Path); parser.add_argument('--node', default='node')
    parser.add_argument('--recipe', type=Path, default=DEFAULT_MOTION_RECIPE); args = parser.parse_args()
    if args.command in ['verify', 'seal-installed']:
        if not args.staged or not args.tool_root: parser.error('verify/seal require --staged and --tool-root')
        from motion_publish_seal import review_preflight, seal_installed
        tool = args.tool_root.resolve() / '.venv/bin/sprite-gen'
        if args.command == 'verify': review_preflight(args.staged, tool, args.node)
        else: seal_installed(args.staged, tool, args.node)
        print('Current source approvals and exact pack graph verified'); return
    mapping = read_json(args.sources) if args.sources and args.sources.exists() else {}
    if args.command == 'plan': print(json.dumps(source_plan(mapping), indent=2)); return
    if not args.out or not args.tool_root: parser.error('build requires --out and --tool-root')
    recipe = read_json(args.recipe); tool = checked_tool(args.tool_root, {'source': recipe['tool']})
    build_pack(recipe, mapping, args.out, tool, args.node)
    print('Complete approved pack staged for root diff/receipt review; no assets installed')


if __name__ == '__main__': main()
