"""Publication-only native factories; approved image processing fingerprints remain frozen."""
from motion_inventory import ACTORS
from motion_lottie import actor_document, flat_document, transform
from motion_stage_contract import stage_document


def native_document(asset):
    if asset['id'] in ACTORS:
        document = actor_document(asset)
        return feedback_parent(document) if asset['profile'] != 'player' else document
    if asset['kind'] == 'stage':
        document = stage_document(asset)
        document['nm'] = 'Brazier - static flameless stand and genuine flame poses'
        return document
    return flat_document(asset)


def feedback_parent(document):
    width, height = document['w'], document['h']
    document['assets'].append({'id': 'poses', 'w': width, 'h': height, 'fr': 12, 'layers': document['layers']})
    document['layers'] = [{'ddd': 0, 'ind': 1, 'ty': 0, 'nm': 'native feedback parent', 'refId': 'poses',
        'sr': 1, 'ks': transform(100, True), 'w': width, 'h': height, 'ip': 0, 'op': 32, 'st': 0, 'bm': 0}]
    return document
