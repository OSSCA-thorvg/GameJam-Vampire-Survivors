"""Installed-output receipts distinguish generated PNGs from native runtime wrappers."""
import copy
import hashlib
import json
from pathlib import Path

import rebuild_common as common
from rebuild_common import digest, read_json

SUPPORT_FILES = {'CATALOG.md', 'README.md', 'manifest.json', 'fonts/LICENSE-NotoSansMono.txt'}
FX_FRAMES = {'fx.levelUp': 30, 'fx.chestOpen': 24}
CONTRACT_RELATIVE = 'docs/assets/native-fx-contracts.json'
CONTRACT_PATH = Path(__file__).resolve().parents[2] / CONTRACT_RELATIVE


def installed_path(relative: str) -> Path:
    path = (common.ROOT / 'assets' / relative).resolve()
    path.relative_to(common.ROOT / 'assets')
    if relative != path.relative_to(common.ROOT / 'assets').as_posix():
        raise ValueError('Installed asset paths must remain canonical and relative')
    return path


def integration_receipt(recipe: dict, entries: dict, manifest: dict) -> dict:
    primaries = {item['file'] for item in manifest.values()}
    resources = {entry['candidateFile'] for entry in entries.values() if entry['integration'] == 'lottie-art'}
    expected = primaries | resources | SUPPORT_FILES
    actual = {path.relative_to(common.ROOT / 'assets').as_posix()
              for path in (common.ROOT / 'assets').rglob('*') if path.is_file()}
    if len(primaries) != 84 or len(resources) != 2 or len(expected) != 90 or actual != expected:
        raise ValueError('Installed pack must contain exactly84 primaries,2 FX resources,4 support files; '
                         f'missing={sorted(expected - actual)}, unexpected={sorted(actual - expected)}')
    effects = [effect_receipt(identifier, entries[identifier], manifest[identifier]) for identifier in FX_FRAMES]
    files = [{'file': 'assets/' + name, 'sha256': digest(installed_path(name)),
              'role': 'primary' if name in primaries else 'effect-resource' if name in resources else 'support',
              'ownerIds': sorted(identifier for identifier, item in manifest.items() if item['file'] == name) or
                          sorted(identifier for identifier, entry in entries.items() if entry['candidateFile'] == name)}
             for name in sorted(expected)]
    return {'kind': 'installed-runtime-integration', 'physicalFiles': 90, 'files': files,
            'nativeEffects': effects, 'note': 'Native JSON wrappers are repository integration outputs, not GPT PNG outputs.'}


def effect_receipt(identifier: str, entry: dict, manifest_entry: dict) -> dict:
    path = installed_path(manifest_entry['file'])
    document = read_json(path)
    contract = read_json(CONTRACT_PATH)['effects'][identifier]
    expected = contract['header']
    if (manifest_entry.get('format') != 'lottie' or manifest_entry.get('loop') is not True or
            any(document.get(key) != value for key, value in expected.items()) or
            entry['logicalSize'] != [expected['w'], expected['h']]):
        raise ValueError(f'Native FX timeline, loop or composition changed: {identifier}')
    image = validate_resource(document, entry, manifest_entry)
    layers = document.get('layers', [])
    wanted = [image_envelope(layer, image['id'], entry['physicalSize']) for layer in contract['layers']]
    if layers != wanted:
        raise ValueError('Native FX layers lost original bindings or preserved envelopes (including rotation)')
    resource = installed_path(entry['candidateFile'])
    if digest(resource) != entry['sha256']:
        raise ValueError('Native FX resource differs from its accepted generated candidate')
    envelopes = [{'ind': layer['ind'], 'name': layer['nm'], 'transforms': layer['ks'],
                  'ip': layer['ip'], 'op': layer['op'], 'st': layer['st']} for layer in layers]
    return {'id': identifier, 'file': 'assets/' + manifest_entry['file'], 'sha256': digest(path),
            'timeline': expected | {'durationSeconds': (expected['op'] - expected['ip']) / expected['fr']},
            'loop': True, 'nativeLayerCount': len(layers),
            'originalEnvelopeContract': {'file': CONTRACT_RELATIVE, 'sha256': digest(CONTRACT_PATH),
                                         'sourceFile': contract['sourceFile'], 'sourceSha256': contract['sourceSha256']},
            'resource': {'file': 'assets/' + entry['candidateFile'], 'sha256': entry['sha256'],
                         'ownerRelativeP': image['p'], 'assetId': image['id'], 'physicalSize': entry['physicalSize']},
            'nativeLayers': envelopes,
            'nativeEnvelopesSha256': hashlib.sha256(json.dumps(envelopes, sort_keys=True).encode()).hexdigest()}


def validate_resource(document: dict, entry: dict, manifest_entry: dict) -> dict:
    images = document.get('assets', [])
    if len(images) != 1:
        raise ValueError('Native FX wrapper must own exactly one generated image resource')
    image = images[0]
    owner = Path(manifest_entry['file'])
    relative = Path(entry['candidateFile']).relative_to(owner.parent).as_posix()
    if (not relative.startswith(owner.stem + '/') or image.get('u') != '' or image.get('p') != relative or
            image.get('e') != 0 or [image.get('w'), image.get('h')] != entry['physicalSize'] or
            not isinstance(image.get('id'), str) or not image['id']):
        raise ValueError('Native FX image reference does not own the accepted generated PNG')
    return image


def image_envelope(original: dict, image_id: str, size: list[int]) -> dict:
    layer = copy.deepcopy(original)
    layer.update(ty=2, refId=image_id)
    layer['ks']['a'] = {'a': 0, 'k': [size[0] / 2, size[1] / 2, 0]}
    scale = layer['ks']['s']
    vectors = [scale['k']] if scale['a'] == 0 else [frame[key] for frame in scale['k']
                                                   for key in ('s', 'e') if key in frame]
    for vector in vectors:
        vector[:2] = [value / 4 for value in vector[:2]]
    return layer
