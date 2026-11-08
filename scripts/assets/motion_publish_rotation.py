"""One native rotation scale from opaque pixel-corner radius; no raster or per-frame fitting."""
import math


def rotation_envelope(image, logical_size, margin=.5):
    width, height = image.size
    radius = 0.0
    for y in range(height):
        for x in range(width):
            if image.getpixel((x, y))[3] < 128: continue
            radius = max(radius, *(math.hypot(x + dx - width / 2, y + dy - height / 2) for dx, dy in [(0, 0), (0, 1), (1, 0), (1, 1)]))
    if not radius: raise ValueError('Rotating source must contain opaque art')
    half = min(logical_size) / 2
    clipped_at_default = radius * .5 > half
    scale = 100 * (half - margin) / radius if clipped_at_default else 50
    return {'opaquePixelCornerRadius': radius, 'nativeHalfCanvas': half,
            'marginLogicalPixels': margin, 'scalePercent': scale, 'changedFromDefault50': clipped_at_default,
            'rule': 'ONE constant native layer scale; source PNG bytes and timing unchanged'}


def fitted_document(document, resource):
    fit = resource.get('rotationEnvelope')
    if fit:
        scale = fit['scalePercent']
        document['layers'][0]['ks']['s'] = {'a': 0, 'k': [scale, scale, 100]}
    return document
