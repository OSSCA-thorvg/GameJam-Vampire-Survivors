"""Brazier-specific five-resource contract; actor source16/native12 rules do not apply."""
import hashlib
import json

DEFAULT_GEOMETRY = {'canvas': [48, 80], 'standCap': [40, 48], 'standFootY': 72,
                    'flameCap': [26, 28], 'cup': [24, 34]}


def stage_contract(asset, geometry):
    return {'id': asset['id'], 'logicalSize': asset['logicalSize'], 'anchor': asset['anchor'],
            'masterSha256': asset['master']['sha256'], 'geometry': geometry,
            'sources': {'stand': 1, 'flame': {'frames': 4, 'fps': 6, 'loop': True}},
            'resources': 5, 'resourceScale': 2, 'palette': 64, 'binaryAlpha': True, 'grid': 1,
            'processingChroma': 'palette-still-ALL4; original request/canonical off cache unchanged'}


def contract_digest(asset, geometry):
    return hashlib.sha256(json.dumps(stage_contract(asset, geometry), sort_keys=True).encode()).hexdigest()


def stage_document(asset):
    from motion_lottie import channel, transform
    width, height = asset['logicalSize']
    stem = asset['outputFile'].split('/')[-1][:-5]
    assets = [{'id': 'stand', 'w': width * 2, 'h': height * 2, 'u': '', 'p': f'{stem}/stand.png', 'e': 0}]
    assets += [{'id': f'flame{i}', 'w': width * 2, 'h': height * 2, 'u': '', 'p': f'{stem}/flame-{i}.png', 'e': 0} for i in range(4)]
    def layer(id, index, start, end):
        return {'ddd': 0, 'ind': index, 'ty': 2, 'nm': id, 'refId': id, 'sr': 1,
                'ks': transform(), 'ip': start, 'op': end, 'st': 0, 'bm': 0, 'ao': 0}
    # Front-to-back order keeps flames above the single, unchanging hardware layer.
    layers = [layer(f'flame{i}', i + 1, i, i + 1) for i in range(4)] + [layer('stand', 5, 0, 4)]
    return {'v': '5.7.4', 'fr': 6, 'ip': 0, 'op': 4, 'w': width, 'h': height,
            'nm': 'Brazier: static flameless stand and genuine flame poses', 'ddd': 0, 'assets': assets, 'layers': layers}
