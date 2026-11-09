"""Pinned upstream-only stand/flame refinement with shared five-source palette."""
import argparse
import hashlib
from pathlib import Path
import statistics

import sprite_gen.frames.extract as engine
from sprite_gen.curate.curation import apply_transform
from sprite_gen.gen.prepare import draw_guide
from motion_refine_bank import read_rgba, source_components, canonical_row_components
from rebuild_common import ROOT, read_json, write_json, digest, portable


def stand_image(run, geometry):
    image = read_rgba(run / 'raw/stand.png')
    logical = engine.conform_row_logical(engine.tighten_components([image]), *geometry['standCap'], True)[0]
    canvas = geometry['canvas']
    return engine.fit_pixel_unfake(logical, *canvas, 0, canvas[1] - geometry['standFootY'], 1,
                                   {'align_x': 'bbox-center', 'align_y': 'bottom'})


def stand_processing(run, geometry):
    image = read_rgba(run / 'raw/stand.png'); box = engine.solid_alpha_bbox(image)
    content = engine.tighten_components([image])[0]
    factor = min(1, geometry['standCap'][0] / content.width, geometry['standCap'][1] / content.height)
    return {'sourceSize': list(image.size), 'anyAlphaBBox': list(image.getbbox()), 'solidAlphaBBox128': list(box),
            'singleStillScale': factor, 'standCap': geometry['standCap'], 'standFootY': geometry['standFootY'],
            'operations': ['upstream-tighten_components:solid-alpha>=128', 'upstream-conform:ONE-still-kCentroid',
                           'upstream-binarize_alpha:128', 'upstream-fixed-foot-placement:ONE-still']}


def process_stage(request, output):
    run = ROOT / request['runDir']; geometry = request['geometry']; output.mkdir(parents=True, exist_ok=True)
    stand = stand_image(run, geometry)
    if request['mode'] == 'stand-preview':
        stand.save(output / 'stand-preview.png')
        return {'kind': 'STAND GEOMETRY PREVIEW ONLY; NO FIRE/FINAL APPROVAL',
                'file': portable(output / 'stand-preview.png'), 'sha256': digest(output / 'stand-preview.png'),
                'alphaSha256': hashlib.sha256(stand.getchannel('A').tobytes()).hexdigest(), 'geometry': geometry,
                'standProcessing': stand_processing(run, geometry)}
    flame_run = run / 'flame-row'; raw_request = read_json(flame_run / 'sprite-request.json')
    manifest = read_json(flame_run / 'frames/frames-manifest.json'); row = manifest['rows'][0]
    guide = output / 'replayed-layout-guide.png'
    draw_guide(guide, 4, raw_request['cell'])
    if digest(guide) != digest(flame_run / 'references/layout-guides/flame.png'):
        raise ValueError('Flame guide differs from actual upstream request-derived guide')
    _, canonical = canonical_row_components(flame_run, 'flame', raw_request, manifest, row)
    processing_args = manifest.get('extract_args', {}) | {'decontam': 'palette'}
    components, source = source_components(flame_run, 'flame', raw_request, processing_args)
    cap = geometry['flameCap']; factor = min(1, cap[0] / max(i.width for i in components), cap[1] / max(i.height for i in components))
    logical = engine.conform_row_logical(components, *cap, True)
    canvas = geometry['canvas']; flames = [engine.fit_pixel_unfake(image, *canvas, 0, canvas[1] - geometry['cup'][1], 1,
                         {'align_x': 'foot-centroid', 'align_y': 'bottom'}) for image in logical]
    flames = [apply_transform(image, {'dx': geometry['cup'][0] - canvas[0] / 2}, tuple(canvas), snap_scale=1) for image in flames]
    palette = engine.build_shared_palette([stand, *flames], 64)
    engine.write_pinned_palette(output, palette, 'motion84-stage-five-source')
    images = [engine.apply_palette(image, palette) for image in [stand, *flames]]
    records = []
    for name, image in zip(['stand', *[f'flame-{i}' for i in range(4)]], images):
        path = output / (name + '.png'); image.save(path)
        records.append({'name': name, 'file': portable(path), 'sha256': digest(path), 'size': canvas,
            'box': list(image.getbbox()), 'nonzeroPixels': engine.alpha_nonzero_count(image),
            'alphaSha256': hashlib.sha256(image.getchannel('A').tobytes()).hexdigest(),
            'alphaValues': sorted({pixel[3] for pixel in image.getdata()}),
            'visibleColors': len({pixel[:3] for pixel in image.getdata() if pixel[3]})})
    from sprite_gen.qa.inspect import _motion_presence
    return {'version': 1, 'issue': 84, 'id': 'stage.brazier', 'kind': 'genuine-flameless-stand-plus-four-flame-source-bank',
        'geometry': geometry, 'standAlphaSha256': hashlib.sha256(stand.getchannel('A').tobytes()).hexdigest(),
        'standProcessing': stand_processing(run, geometry),
        'flameCommonScale': factor, 'canonicalFlameReplay': canonical, 'rawFlameSource': source,
        'processingChroma': {'decontam': 'palette', 'fit': 'still', 'sourceRequestAndCanonicalOffCacheUnchanged': True},
        'sharedPalette': {'file': portable(output / 'palette.lock.json'), 'sha256': digest(output / 'palette.lock.json')},
        'records': records, 'flameMotionPresence': _motion_presence(images[1:]), 'hardwareInstances': 1,
        'operations': ['upstream-conform:stand-once', 'upstream-canonical-flame-replay4:original-off-cache',
                       'upstream-post-source-chroma-decontam:palette-still-ALL4', 'upstream-conform:flame-one-row-factor',
                       'upstream-fixed-root-flame-placement', 'upstream-shared-palette:ALL5', 'binary-alpha'],
        'quality': 'pending-five-source-and-native-composition-review'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True); parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(); write_json(args.out / 'processing.json', process_stage(read_json(args.request), args.out))
