"""Fail-closed exact-cover receipt assembly for regenerated candidates."""
from __future__ import annotations

from pathlib import Path

from rebuild_common import ROOT, digest, generation_source, recipe_digest, validate_png, read_json
from rebuild_processing import validate_processing
from rebuild_integration import integration_receipt


def assemble(recipe: dict, runs: list[Path], require_approved: bool, final_assets: bool) -> dict:
    expected = {asset['id']: asset for asset in recipe['assets'] if asset['action'] != 'preserve'}
    entries = {}
    for run in runs:
        for receipt in sorted(run.rglob('candidates.json')):
            for entry in read_json(receipt)['entries']:
                identifier = entry['id']
                if identifier not in expected or identifier in entries:
                    raise ValueError(f'Unexpected or duplicate candidate ID: {identifier}')
                validate_entry(entry, expected[identifier], recipe, require_approved)
                entries[identifier] = entry
    missing = sorted(set(expected) - entries.keys())
    if missing:
        raise ValueError('Missing generated candidates: ' + ', '.join(missing))
    font = next(asset for asset in recipe['assets'] if asset['action'] == 'preserve')
    if digest(ROOT / 'assets' / font['originalFile']) != font['originalSha256']:
        raise ValueError('Protected HUD font changed')
    integration = validate_installed(recipe, entries) if final_assets else None
    result = {'version': 1, 'issue': 76, 'tool': recipe['source'], 'generationIsDeterministic': False,
            'baselineIds': recipe['baselineIds'], 'declaredAdditions': recipe['additions'],
            'coverage': {'catalogIds': 84, 'baselineIds': 82, 'regenerated': 81, 'generated': 2, 'preserved': 1},
            'assets': [entries[identifier] for identifier in sorted(entries)] + [
                {'id': 'font.hud', 'action': 'preserved', 'file': 'assets/' + font['originalFile'],
                 'sha256': font['originalSha256'], 'license': 'SIL OFL 1.1'}]}
    if integration is not None:
        result['integration'] = integration
    return result


def validate_entry(entry: dict, expected: dict, recipe: dict, require_approved: bool) -> None:
    if entry.get('recipeSha256') != recipe_digest(recipe):
        raise ValueError('Candidate was exported for a different recipe or style revision')
    if entry['tool'] != recipe['source'] or entry['candidateFile'] != expected['candidateFile']:
        raise ValueError('Candidate tool/path differs from the pinned recipe')
    if entry['logicalSize'] != expected['logicalSize'] or entry['anchor'] != expected['anchor']:
        raise ValueError('Candidate changed a logical size or anchor')
    validate_processing(entry, recipe)
    candidate = (ROOT / entry['file']).resolve()
    candidate.relative_to(ROOT / 'verification')
    if digest(candidate) != entry['sha256'] or entry['sha256'] == expected.get('originalSha256'):
        raise ValueError('Candidate hash is stale or unchanged placeholder art')
    action = 'generated' if expected['action'] == 'generate' else 'regenerated'
    if entry.get('action') != action:
        raise ValueError('Candidate action does not distinguish new and regenerated artwork')
    dimensions = tuple(value * recipe['export']['scale'] for value in expected['logicalSize'])
    if validate_png(candidate) != dimensions or entry['physicalSize'] != list(dimensions):
        raise ValueError('Candidate PNG dimensions do not match recipe')
    source = entry['source']
    if source['provider'] != 'codex' or source['auth'] != 'ChatGPT subscription':
        raise ValueError('Unapproved generation provider/authentication')
    for path, expected_hash in [('sourceFile', 'sourceSha256'), ('reportFile', 'reportSha256')]:
        target = (ROOT / source[path]).resolve()
        target.relative_to(ROOT / 'verification')
        if digest(target) != source[expected_hash]:
            raise ValueError('Generation source/report changed after export')
    for reference in source.get('references', []):
        target = (ROOT / reference['file']).resolve()
        target.relative_to(ROOT / 'verification')
        if digest(target) != reference['sha256']:
            raise ValueError('A style or identity reference changed after generation')
    verified = generation_source(ROOT / source['sourceFile'], ROOT / source['reportFile'])
    if verified != source:
        raise ValueError('Candidate provenance differs from the actual generation report')
    if require_approved and (not entry['qa'].get('approved') or
                             entry['qa'].get('reviewedSha256') != entry['sha256']):
        raise ValueError(f"Visual QA is incomplete: {entry['id']}")


def validate_installed(recipe: dict, entries: dict) -> dict:
    manifest = read_json(ROOT / 'assets/manifest.json')['assets']
    if set(manifest) != {asset['id'] for asset in recipe['assets']}:
        raise ValueError('Current manifest IDs drifted from the complete baseline')
    for identifier, entry in entries.items():
        installed = ROOT / 'assets' / entry['candidateFile']
        if digest(installed) != entry['sha256']:
            raise ValueError(f'Final art does not match its generated candidate: {identifier}')
        if entry['integration'] == 'static' and manifest[identifier]['file'] != entry['candidateFile']:
            raise ValueError(f'Manifest does not reference final static art: {identifier}')
    return integration_receipt(recipe, entries, manifest)
