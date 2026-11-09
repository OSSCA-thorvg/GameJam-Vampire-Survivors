"""Closed Wraith art-direction change; never relabel the original alternation request."""
import hashlib
import json

from rebuild_common import ROOT

WRAITH_STYLE = 'grounded-undead-drag'
DIRECTION = {'file': 'docs/assets/motion-84-wraith-art-direction.json',
             'sha256': '5ec9a09b1b86bc74022802935859f87b49be6146dd1c3680c32229832d52b7c4'}


def validate_asset_direction(asset):
    if asset['id'] == 'enemy.wraith' and (asset.get('locomotionStyle') != WRAITH_STYLE or asset.get('artDirection') != DIRECTION):
        raise ValueError('Wraith requires its explicitly user-selected grounded undead drag direction')


def validate_review_direction(id, review):
    if id == 'enemy.wraith' and (review.get('locomotionStyle') != WRAITH_STYLE or review.get('artDirection') != DIRECTION):
        raise ValueError('Both new Wraith reviews must bind the later explicit user art direction')


def validate_direction_original(record):
    if not isinstance(record, dict) or record.get('sourceFile') != DIRECTION['file'] or record.get('sha256') != DIRECTION['sha256']:
        raise ValueError('Portable Wraith user art-direction original is required')
    text = record.get('originalUtf8', '')
    if hashlib.sha256(text.encode('utf-8')).hexdigest() != DIRECTION['sha256']:
        raise ValueError('Wraith user art-direction bytes changed')
    document = json.loads(text)
    if (document.get('assetId') != 'enemy.wraith' or document.get('style') != WRAITH_STYLE or
            document.get('answer') != '한쪽 발을 끄는 미라 특성 동작으로 확정'):
        raise ValueError('Wraith direction must preserve the exact later user decision')


def direction_original():
    record = {'sourceFile': DIRECTION['file'], 'sha256': DIRECTION['sha256'],
              'originalUtf8': (ROOT / DIRECTION['file']).read_bytes().decode('utf-8')}
    validate_direction_original(record)
    return record
