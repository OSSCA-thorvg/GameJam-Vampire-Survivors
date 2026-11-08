"""Closed source intake and preserved-master boundaries before any pack is copied."""
from pathlib import Path
import shutil

from motion_bank_proof import validate_bank
from motion_stage import validate_stage
from motion_inventory import ACTORS, validate_inventory, reject_symlink_chain
from rebuild_common import ROOT, read_json, digest, portable


def source_plan(mapping):
    actors = mapping.get('actors', {})
    if set(actors) - ACTORS: raise ValueError('Unexpected actor source ID')
    paths = list(actors.values()) + ([mapping['stage']] if mapping.get('stage') else [])
    if len(paths) != len(set(paths)): raise ValueError('A source bank cannot own multiple IDs')
    missing = sorted(id for id in ACTORS if id not in actors or not source_path(actors[id]).is_file())
    held = sorted(id for id in actors if source_path(actors[id]).is_file() and
        (not (source_path(actors[id]).parent / 'bank-approval.json').is_file() or
         (source_path(actors[id]).parent / 'root-review-recheck-hold.json').is_file()))
    missing_stage = not mapping.get('stage') or not source_path(mapping['stage']).is_file()
    held_stage = not missing_stage and not (source_path(mapping['stage']).parent / 'stage-approval.json').is_file()
    return {'status': 'pending' if missing or held or missing_stage or held_stage else 'mapped-needs-strict-validation',
            'missingActors': missing, 'heldActors': held, 'missingStage': missing_stage, 'heldStage': held_stage}


def source_path(value):
    path = ROOT / value
    reject_symlink_chain(path); path.resolve().relative_to(ROOT / 'verification')
    return path.resolve()


def approved_sources(mapping, recipe, tool):
    validate_inventory(recipe)
    plan = source_plan(mapping)
    if plan['status'] == 'pending': raise ValueError('Missing or held genuine approved sources: ' + str(plan))
    result = {}
    for asset in recipe['assets']:
        id = asset['id']
        if id not in ACTORS and id != 'stage.brazier': continue
        path = (ROOT / (mapping['actors'][id] if id in ACTORS else mapping['stage'])).resolve()
        path.relative_to(ROOT / 'verification'); reject_symlink_chain(path)
        bank = validate_bank(path, recipe, asset, tool, True) if id in ACTORS else validate_stage(path, recipe, asset, tool, True)
        result[id] = {'file': portable(path), 'sha256': digest(path), 'bank': bank}
    return result


def verify_preserved(recipe, directory):
    for master in recipe['staticMasters']:
        file = directory / Path(master['file']).relative_to('assets')
        if digest(file) != master['sha256']: raise ValueError('Preserved static/font bytes changed: ' + master['id'])
    for asset in recipe['assets']:
        if asset['id'] not in {'fx.levelUp', 'fx.chestOpen'}: continue
        for master in [asset['master'], *asset['master'].get('resources', [])]:
            file = directory / Path(master['file']).relative_to('assets')
            if digest(file) != master['sha256']: raise ValueError('Original native effect bytes changed')
    verify_diagnostic(recipe, directory)
    historical = ROOT / recipe['historicalReceipt']['file']
    if digest(historical) != recipe['historicalReceipt']['sha256']: raise ValueError('Historical76 receipt changed')


def copy_resource(source, target, expected):
    reject_symlink_chain(source); reject_symlink_chain(target)
    if digest(source) != expected: raise ValueError('Approved source bytes changed during publication')
    target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source, target)
    if digest(target) != expected: raise ValueError('Copied resource differs from approved source')


def verify_diagnostic(recipe, directory):
    master = recipe['diagnosticMaster']
    file = directory / Path(master['file']).relative_to('assets')
    reject_symlink_chain(file)
    if digest(file) != master['sha256']:
        raise ValueError('Upstream shape-only diagnostic bytes changed')
    if read_json(directory / 'manifest.json')['assets'][master['id']] != master['manifestEntry']:
        raise ValueError('Upstream diagnostic manifest metadata changed')
