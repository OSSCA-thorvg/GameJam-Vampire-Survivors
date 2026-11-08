"""Fresh-clone graph/archive integrity; full AI-source replay still requires raw input cache."""
import hashlib
import json
from pathlib import Path
import re

from motion_publish_sources import source_path, verify_diagnostic
from motion_inventory import ACTORS, reject_symlink_chain
from rebuild_common import ROOT, digest, read_json

ARCHIVE_PREFIX = Path('docs/assets/motion-source-archive84')


def original(document):
    if not isinstance(document, dict) or not {'originalUtf8', 'sha256', 'sourceFile'} <= document.keys():
        raise ValueError('Required original source metadata fields are missing')
    text = document['originalUtf8']
    if hashlib.sha256(text.encode('utf-8')).hexdigest() != document['sha256']:
        raise ValueError('Archived original UTF8 metadata differs from its reviewed byte hash')
    return json.loads(text)


def verify_review_documents(proof, approval, bank, expected):
    if len(proof['reviews']) != 2 or len(approval['reviews']) != 2: raise ValueError('Exactly two original reviews are required')
    names, summaries = [], []
    for review, ref in zip(proof['reviews'], approval['reviews']):
        data = original(review); name = data.get('reviewer', '')
        from motion_direction_proof import validate_review_direction
        validate_review_direction(proof['id'], data)
        if (review['sha256'] != ref['sha256'] or review['sourceFile'] != ref['file'] or data != review.get('document') or
                data.get('bankSha256') != expected['bankSha256'] or re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', name) is None):
            raise ValueError('Archived independent review binding changed')
        if proof['id'] in ACTORS:
            if data.get('states') != {'idle': 'pass', 'move': 'pass'} or data.get('coverage') != {'source': {'idle': 8, 'move': 8}, 'native': {'idle': 4, 'move': 8}}:
                raise ValueError('Actor original reviews must accept all16 source and12 native poses')
            if bank.get('motionPresenceGate') != {'threshold': .01, 'status': 'pass'}:
                raise ValueError('Actor source/native motion gates must remain passed')
            warnings = any(row['sourceWarnings'] for row in bank['sourceRows'])
        else:
            if (data.get('status') != 'pass' or data.get('coverage') != {'stand': 1, 'flame': 4, 'nativeLoop': 'pass'} or
                    any(data.get(field) is not True for field in ['standFlameless', 'flameOnly', 'hardwareStatic']) or bank['flameMotionPresence'] < .01):
                raise ValueError('Stage original reviews must accept source5 and static-hardware native flame loop')
            warnings = bool(bank['canonicalFlameReplay']['sourceWarnings'])
        if warnings and data.get('sourceWarningsAcknowledged') is not True: raise ValueError('Original source warnings need explicit acknowledgment')
        names.append(name); summaries.append({'reviewer': name, 'sha256': review['sha256']})
    if names[0] == names[1] or summaries != expected['reviews']:
        raise ValueError('Two distinct exact original review summaries are required')


def verify_runtime_source_images(id, bank, installed):
    primaries = [file for file in installed if file['role'] == 'primary']
    if len(primaries) != 1: raise ValueError('Each generated source needs one native JSON owner')
    stem = Path(primaries[0]['file']).with_suffix('')
    expected = {(stem / f'pose-{index}.png').as_posix(): frame['sha256'] for index, frame in enumerate(bank['frames'])} if id in ACTORS else {
        (stem / (record['name'] + '.png')).as_posix(): record['sha256'] for record in bank['records']}
    actual = {file['file']: file['sha256'] for file in installed if file['role'] == 'owned-image'}
    if actual != expected: raise ValueError('Runtime image bytes/order differ from the exact reviewed native source bank')


def verify_native_wrapper(expected, runtime_root, asset):
    from motion_publish_factory import native_document
    if runtime_root is None or asset is None:
        raise ValueError('Actual runtime assets root and recipe asset are required for native wrapper verification')
    from motion_direction_proof import validate_asset_direction
    validate_asset_direction(asset)
    primaries = [file for file in expected['installedFiles'] if file['role'] == 'primary']
    if len(primaries) != 1 or primaries[0]['file'] != asset['outputFile']:
        raise ValueError('Native primary must match its declared recipe owner')
    path = runtime_root / primaries[0]['file']; reject_symlink_chain(path)
    path.resolve().relative_to(runtime_root.resolve())
    if digest(path) != primaries[0]['sha256']:
        raise ValueError('Native primary bytes differ from the actual installed graph')
    if read_json(path) != native_document(asset):
        raise ValueError('Native wrapper resource IDs, ordered paths and timeline differ from the exact factory')


def verify_source_proof(path, archive_root, expected, runtime_root=None, asset=None):
    reject_symlink_chain(path)
    if digest(path) != expected['sourceProofSha256']: raise ValueError('Portable source proof changed')
    proof = read_json(path); bank = original(proof['bank']); approval = original(proof['approval'])
    if proof['id'] != expected['id'] or bank['id'] != expected['id'] or proof['bank']['sha256'] != expected['bankSha256'] or approval['bankSha256'] != expected['bankSha256']:
        raise ValueError('Archived reviews must bind the exact reviewed source bank')
    verify_review_documents(proof, approval, bank, expected)
    if proof['id'] == 'enemy.wraith':
        from motion_direction_proof import validate_direction_original
        validate_direction_original(proof.get('artDirection'))
    verify_runtime_source_images(proof['id'], bank, expected['installedFiles'])
    verify_native_wrapper(expected, runtime_root, asset)
    poses = proof['retainedSourcePoses']
    if poses != expected['retainedSourcePoses']: raise ValueError('Receipt retained source poses differ from the exact portable proof list')
    expected_count = 16 if proof['id'] in ACTORS else 5
    if len(poses) != expected_count or len({pose['file'] for pose in poses}) != expected_count:
        raise ValueError('Every generated source pose, including odd idle frames, must survive publication')
    ancestors = bank['sourceFrames'] if proof['id'] in ACTORS else bank['records']
    if {pose['sourceFile'] for pose in poses} != {item['file'] for item in ancestors}:
        raise ValueError('Every original source pose must be retained exactly once')
    for pose in poses:
        ancestor = next((item for item in ancestors if item['file'] == pose['sourceFile']), None)
        if ancestor is None or ancestor['sha256'] != pose['sha256']:
            raise ValueError('Archived pose must match its exact original source-bank ancestry')
        relative = Path(pose['file']).relative_to(ARCHIVE_PREFIX)
        file = archive_root / relative; reject_symlink_chain(file)
        file.resolve().relative_to(archive_root.resolve())
        if digest(file) != pose['sha256']: raise ValueError('Archived source pose bytes changed')
    return bank


def verify_receipt(receipt, graph, archive_root, recipe, runtime_root=None):
    reject_symlink_chain(archive_root)
    paths = list(archive_root.rglob('*'))
    if any(path.is_symlink() for path in paths): raise ValueError('Source archive forbids symlinks')
    if receipt['graph'] != graph or set(receipt['assets']) != set(recipe['logicalIds']):
        raise ValueError('Receipt must match the exact current graph and all85 logical IDs')
    if set(graph['motionIds']) != set(recipe['motionIds']): raise ValueError('All36 motion IDs are required')
    required_roles = ACTORS | {'stage.brazier'}
    proof_roles = {id for id, asset in receipt['assets'].items() if 'sourceProofFile' in asset}
    if proof_roles != required_roles: raise ValueError('Exactly13 actor and1 stage source proofs are mandatory; unexpected proof roles reject')
    required_fields = {'id', 'sourceProofFile', 'sourceProofSha256', 'bankSha256', 'retainedSourcePoses', 'reviews', 'installedFiles'}
    if any(not required_fields <= receipt['assets'][id].keys() for id in required_roles):
        raise ValueError('Required source-proof receipt fields are missing')
    diagnostic = recipe['diagnosticMaster']
    id = diagnostic['id']
    if graph.get('diagnosticIds') != [id] or receipt.get('diagnosticIds') != [id]:
        raise ValueError('The upstream diagnostic requires its own graph role')
    entry = receipt['assets'][id]
    files = entry['installedFiles']
    if (entry.get('master') != diagnostic or entry.get('action') != 'preserve-upstream-shape-only-diagnostic' or
            len(files) != 1 or files[0]['file'] != Path(diagnostic['file']).relative_to('assets').as_posix() or
            files[0]['role'] != 'primary' or files[0]['sha256'] != diagnostic['sha256']):
        raise ValueError('The upstream diagnostic requires its exact pinned primary')
    if runtime_root is None:
        raise ValueError('The upstream diagnostic requires the actual runtime root')
    verify_diagnostic(recipe, runtime_root)
    expected_files = set()
    for id, asset in receipt['assets'].items():
        if asset['installedFiles'] != [file for file in graph['files'] if id in file['owners']]:
            raise ValueError('Per-ID native/resource ownership differs from the actual current graph')
        if 'sourceProofFile' in asset:
            relative = Path(asset['sourceProofFile']).relative_to(ARCHIVE_PREFIX)
            verify_source_proof(archive_root / relative, archive_root, asset, runtime_root,
                next(item for item in recipe['assets'] if item['id'] == id))
            expected_files.add(relative.as_posix())
            expected_files.update(Path(pose['file']).relative_to(ARCHIVE_PREFIX).as_posix() for pose in asset['retainedSourcePoses'])
    actual_files = {path.relative_to(archive_root).as_posix() for path in paths if path.is_file()}
    if actual_files != expected_files: raise ValueError('Source archive has orphan or missing evidence files')
