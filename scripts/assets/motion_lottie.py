"""Repository native wrappers; sprite-gen supplies images, not Lottie JSON."""


def channel(value):
    return {'a': 0, 'k': value}


def transform(scale=50, parent=False):
    opacity = channel(100)
    if parent:
        opacity['sid'] = 'damage'
    return {'o': opacity, 'r': channel(0), 'p': channel([0, 0, 0]),
            'a': channel([0, 0, 0]), 's': channel([scale, scale, 100])}


def image_assets(file, size, count):
    stem = file.rsplit('/', 1)[-1][:-5]
    return [{'id': f'pose{i}', 'w': size[0] * 2, 'h': size[1] * 2,
             'u': '', 'p': f'{stem}/pose-{i}.png', 'e': 0} for i in range(count)]


def pose_layers(player):
    layers = []
    for index in range(12):
        duration = (75 if index < 4 else 12.5) if player else (6 if index < 4 else 1)
        start = index * duration if index < 4 else (300 if player else 24) + (index - 4) * duration
        layers.append({'ddd': 0, 'ind': index + 1, 'ty': 2, 'nm': f'pose-{index}', 'refId': f'pose{index}',
            'sr': 1, 'ks': transform(), 'ip': start, 'op': start + duration, 'st': 0, 'bm': 0, 'ao': 0})
    return layers


def time_remap():
    keys = [{'t': index * 75, 's': [.25 + (index % 4) * .5], 'h': 1} for index in range(8)]
    keys += [{'t': 600 + index * 12.5, 's': [2 + ((index % 8) + .5) / 12], 'h': 1} for index in range(48)]
    keys.append({'t': 1200, 's': [2 + 7.5 / 12], 'h': 1})
    return {'a': 1, 'k': keys}


def actor_document(asset, diagnostic=False):
    player = asset['profile'] == 'player'
    width, height = asset['logicalSize']
    document = {'v': '5.7.4', 'fr': 150 if player else 12, 'ip': 0, 'op': 1200 if player else 32,
        'w': width, 'h': height, 'nm': ('DIAGNOSTIC REUSED STILL - NOT GAIT ' if diagnostic else '') + asset['id'],
        'ddd': 0, 'assets': image_assets(asset['outputFile'], [width, height], 12),
        'markers': [{'cm': 'idle', 'tm': 0, 'dr': 600 if player else 24},
                    {'cm': 'move', 'tm': 600 if player else 24, 'dr': 600 if player else 8}]}
    if player:
        document['assets'].append({'id': 'poses', 'w': width, 'h': height, 'fr': 150, 'layers': pose_layers(True)})
        document['layers'] = [{'ddd': 0, 'ind': 1, 'ty': 0, 'nm': 'native player pose bank',
            'refId': 'poses', 'w': width, 'h': height, 'sr': 1, 'ks': transform(100, True),
            'tm': time_remap(), 'ip': 0, 'op': 1200, 'st': 0, 'bm': 0}]
    else:
        document['layers'] = pose_layers(False)
    return document


def animated(values, frames):
    return {'a': 1, 'k': [{'t': frames * index / (len(values) - 1), 's': value,
        'i': {'x': [.5], 'y': [1]}, 'o': {'x': [.5], 'y': [0]}} for index, value in enumerate(values)]}


def flat_document(asset, diagnostic=False):
    width, height = asset['logicalSize']
    runtime = asset['runtime']
    frames = runtime['fps'] * runtime['durationSeconds']
    stage = asset['kind'] == 'stage'
    resources = image_assets(asset['outputFile'], [width, height], 4 if stage else 1)
    layers = []
    for index, image in enumerate(resources):
        ks = transform()
        ks['p'] = channel([width / 2, height / 2, 0])
        ks['a'] = channel([width, height, 0])
        if not stage:
            if runtime['preset'] == 'centered-native-rotation':
                ks['r'] = animated([[0], [360]], frames)
            else:
                ks['o'] = animated([[100], [70], [100]], frames)
                if asset['id'] in ['fx.hit', 'fx.enemyDeath']:
                    # NativePlayback holds one-shots at op-1, never at the exclusive op.
                    ks['o'] = animated([[100], [0]], max(0, frames - 1))
        layers.append({'ddd': 0, 'ind': index + 1, 'ty': 2, 'nm': image['id'], 'refId': image['id'],
            'sr': 1, 'ks': ks, 'ip': index if stage else 0, 'op': index + 1 if stage else frames,
            'st': 0, 'bm': 0, 'ao': 0})
    return {'v': '5.7.4', 'fr': runtime['fps'], 'ip': 0, 'op': frames, 'w': width, 'h': height,
            'nm': ('DIAGNOSTIC REUSED STILL - NOT FLAME ' if diagnostic else '') + asset['id'],
            'ddd': 0, 'assets': resources, 'layers': layers}
