"""Portable publication evidence and all source poses outside the public resource graph."""
from pathlib import Path
import shutil

from motion_inventory import ACTORS
from motion_publish_sources import copy_resource
from rebuild_common import ROOT, digest, portable, read_json, write_json

ARCHIVE_TARGET = Path('docs/assets/motion-source-archive84')


def archive_source(id, source, directory):
    bank = source['bank']; base = directory / 'source-archive' / id.replace('.', '/')
    target = ARCHIVE_TARGET / id.replace('.', '/')
    base.mkdir(parents=True)
    bank_path = ROOT / source['file']
    poses = bank['sourceFrames'] if id in ACTORS else bank['records']
    retained = []
    for pose in poses:
        relative = Path('source-poses') / pose['state'] / f"frame-{pose['index']}.png" if id in ACTORS else Path(pose['name'] + '.png')
        copy_resource(ROOT / pose['file'], base / relative, pose['sha256'])
        retained.append({'file': (target / relative).as_posix(), 'sha256': pose['sha256'],
                         'sourceFile': pose['file'], 'state': pose.get('state'), 'index': pose.get('index')})
    approval_file = bank_path.parent / ('bank-approval.json' if id in ACTORS else 'stage-approval.json')
    approval_utf8 = approval_file.read_bytes().decode('utf-8')
    reviews = []
    for index, ref in enumerate(read_json(approval_file)['reviews']):
        review_file = ROOT / ref['file']
        reviews.append({'sourceFile': ref['file'], 'sha256': ref['sha256'],
                        'reviewer': read_json(review_file)['reviewer'], 'document': read_json(review_file),
                        'originalUtf8': review_file.read_bytes().decode('utf-8')})
    evidence = {'id': id, 'bank': {'sourceFile': source['file'], 'sha256': source['sha256'], 'originalUtf8': bank_path.read_bytes().decode('utf-8')},
        'approval': {'sourceFile': portable(approval_file), 'sha256': digest(approval_file), 'originalUtf8': approval_utf8},
        'reviews': reviews, 'retainedSourcePoses': retained, 'inputProof': bank['inputProof'],
        'rawReplay': 'Requires exact ignored raw rows, provider reports and referenced inputs named in inputProof. These are not included in a fresh clone; archived final source poses and reviewed hashes remain independently inspectable.'}
    if id == 'enemy.wraith':
        from motion_direction_proof import direction_original
        evidence['artDirection'] = direction_original()
    write_json(base / 'source-proof.json', evidence)
    return {'id': id, 'sourceProofFile': (target / 'source-proof.json').as_posix(),
            'stagedSourceProofFile': portable(base / 'source-proof.json'),
            'bankSha256': source['sha256'], 'retainedSourcePoses': retained,
            'reviews': [{'reviewer': r['reviewer'], 'sha256': r['sha256']} for r in reviews]}


def publication_receipt(recipe, graph, archived, derived, directory):
    by_id = {}
    for id, evidence in archived.items():
        value = dict(evidence); value['sourceProofSha256'] = digest(ROOT / value.pop('stagedSourceProofFile'))
        by_id[id] = value
    for item in derived['resources']:
        by_id[item['id']] = {'id': item['id'], 'action': 'deterministic-approved-master-native-motion',
            'master': item['master'], 'operation': item['operation'], 'resourceSha256': item['sha256'],
            'rotationEnvelope': item.get('rotationEnvelope')}
    for asset in recipe['assets']:
        if asset['id'] in {'fx.levelUp', 'fx.chestOpen'}:
            by_id[asset['id']] = {'id': asset['id'], 'action': 'preserve-original-native-json-and-resource-bytes', 'master': asset['master']}
    for master in recipe['staticMasters']:
        by_id[master['id']] = {'id': master['id'], 'action': 'preserve-static-or-font', 'master': master}
    diagnostic = recipe['diagnosticMaster']
    by_id[diagnostic['id']] = {'id': diagnostic['id'], 'action': 'preserve-upstream-shape-only-diagnostic', 'master': diagnostic}
    if set(by_id) != set(recipe['logicalIds']): raise ValueError('Receipt must cover all85 logical IDs exactly')
    for id, entry in by_id.items(): entry['installedFiles'] = [file for file in graph['files'] if id in file['owners']]
    return {'version': 1, 'issue': 84, 'kind': 'CURRENT-PACK-PUBLICATION-RECEIPT',
        'phase': 'staged-not-installed', 'logicalIds': graph['logicalIds'], 'motionIds': graph['motionIds'], 'diagnosticIds': graph['diagnosticIds'],
        'graph': graph, 'assets': by_id, 'upstream': recipe['tool'], 'historicalReceipt': recipe['historicalReceipt'],
        'masterRestoration': recipe['masterRestorationCommand'],
        'rawSourceAvailability': 'Ignored raw inputs are required for full upstream replay. Git masters reproduce deterministic resources; all generated source poses and exact source/review evidence are retained outside public assets.'}
