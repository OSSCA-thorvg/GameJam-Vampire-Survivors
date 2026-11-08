"""Run with pinned sprite-gen Python: one scale/palette for an entire actor pose bank."""
import argparse
import json
from pathlib import Path
import statistics
import shutil

from PIL import Image
from sprite_gen.frames.extract import (alpha_nonzero_count, apply_palette, build_shared_palette,
    conform_row_logical, extract_component_images, place_row_frame, register_row_frames,
    remove_chroma_background, remove_chroma_background_ycbcr, row_placement, separate_fused_poses,
    tighten_components, write_pinned_palette, fit_scale, fit_row_to_cells)
from sprite_gen.qa.inspect import _motion_presence
from sprite_gen.spec.layout import guide_rel, raw_rel
from sprite_gen.util.resample import resize_cell

from rebuild_common import ROOT, digest, portable, read_json, write_json
from motion_sampling import native_ancestry, sampling_contract


def read_rgba(path):
    with Image.open(path) as image:
        return image.convert('RGBA')


def source_components(run, state, request, extract_args, reference_height=None, tight=True):
    raw = run / raw_rel(request, state)
    image = read_rgba(raw)
    chroma = request.get('chroma', {})
    rgb = tuple(request['chroma_key']['rgb'])
    common = {'decontam': extract_args.get('decontam', chroma.get('decontam', 'off'))}
    if chroma.get('mode', 'rgb') == 'ycbcr':
        keyed = remove_chroma_background_ycbcr(image, rgb, [], **common)
    else:
        keyed = remove_chroma_background(image, rgb, extract_args.get('key_threshold', 96),
            extract_args.get('fringe_key_threshold', 180), extract_args.get('fringe_delta', 18),
            unmix_reach=extract_args.get('fringe_unmix_reach', chroma.get('unmix_reach', 4)),
            spill_max_fraction=extract_args.get('spill_max_fraction', chroma.get('spill_max_fraction', .005)), **common)
    reference_height = reference_height or image.height
    calibration = reference_height / image.height
    if calibration != 1:
        keyed = resize_cell(keyed, (round(image.width * calibration), reference_height))
    frames = request['states'][state]['frames']
    keyed = separate_fused_poses(keyed, frames, request.get('fit', {}), 'components', state)
    components = extract_component_images(keyed, frames)
    if components is None or len(components) != frames:
        raise ValueError('The complete connected-component row is required; no slot fallback')
    if tight:
        components = tighten_components(components)
    guide = run / guide_rel(request, state)
    with Image.open(guide) as guide_image:
        guide_size = list(guide_image.size)
    return components, {'rawFile': portable(raw), 'rawSha256': digest(raw),
        'rawSize': list(image.size), 'layoutGuideFile': portable(guide), 'layoutGuideSha256': digest(guide),
        'layoutGuideSize': guide_size, 'uniformWholeRasterCalibration': calibration,
        'referenceRawHeight': reference_height, 'componentSizes': [list(im.size) for im in components]}


def bank_inputs(config, output):
    run = Path(config['runDir'])
    request = read_json(run / 'sprite-request.json')
    manifest = read_json(run / 'frames/frames-manifest.json')
    states = ['down45_idle', 'down45_walk']
    frames, sources, rows = [], [], []
    for state, kind in zip(states, ['idle', 'move']):
        canonical = next(row for row in manifest['rows'] if row['state'] == state)
        if canonical['ok'] is not True or canonical['frames'] != len(canonical['files']):
            raise ValueError('A successful complete canonical comparison row is required')
        components, row = canonical_row_components(run, state, request, manifest, canonical)
        row.update(state=kind, sourceState=state)
        rows.append(row)
        for index, component in enumerate(components):
            path = output / 'source-components' / kind / f'frame-{index}.png'
            path.parent.mkdir(parents=True, exist_ok=True)
            component.save(path)
            comparison = run / canonical['files'][index]
            sources.append({'state': kind, 'index': index, 'sourceComponent': portable(path),
                'sourceComponentSha256': digest(path), 'canonicalComparison': portable(comparison),
                'canonicalComparisonSha256': digest(comparison), 'sourceRow': row})
            frames.append(component)
    return frames, sources, rows


def canonical_row_components(run, state, request, manifest, canonical):
    """Replay the official uniform-row camera calibration before whole-bank refinement."""
    components, row = source_components(run, state, request, manifest.get('extract_args', {}), tight=False)
    sprites = [image.crop(image.getbbox()) for image in components]
    cell, fit = request['cell'], request.get('fit', {})
    args = [cell['width'], cell['height'], cell['safe_margin_x'], cell['safe_margin_y']]
    factor = fit_scale(sprites, *args, fit.get('align_x', 'foot-centroid'))
    calibrated = fit_row_to_cells(components, *args, fit)
    comparisons = [read_rgba(run / file) for file in canonical['files']]
    if any(actual.size != expected.size or actual.tobytes() != expected.tobytes()
           for actual, expected in zip(calibrated, comparisons)):
        raise ValueError('Official row replay differs from actual canonical decoded pixels')
    tight = tighten_components(calibrated)
    row.update(rawComponentSizes=row['componentSizes'],
        rawSolidComponentSizes=[list(image.size) for image in tighten_components(components)],
        componentSizes=[list(image.size) for image in tight], officialRowCommonFitScale=factor,
        canonicalFrames=[{'file': portable(run / file), 'sha256': digest(run / file)} for file in canonical['files']],
        canonicalDecodedPixelReplay=[True] * len(calibrated),
        sourceWarnings=manifest.get('warnings', []), sourceErrors=manifest.get('errors', []))
    return tight, row


def refine_bank(config, output):
    output.mkdir(parents=True, exist_ok=True)
    components, sources, rows = bank_inputs(config, output)
    width, height = [size * 2 for size in config['logicalSize']]
    cap = [round(width * .9), round(height * .85)]
    common_scale = min(1, cap[0] / max(im.width for im in components), cap[1] / max(im.height for im in components))
    logical = conform_row_logical(components, cap[0], cap[1], True)
    registered = register_row_frames(logical, slack_x=2, slack_y=1)
    palette = build_shared_palette(registered, 64)
    write_pinned_palette(output, palette, 'motion84-shared-whole-bank')
    fitted = [apply_palette(image, palette) for image in registered]
    fit = {'align_x': 'foot-centroid' if config['grounded'] else 'bbox-center',
           'align_y': 'bottom' if config['grounded'] else 'center'}
    margin = round(height * .1) if config['grounded'] else 0
    left, top = row_placement(fitted, width, height, margin, 1, fit)
    records = []
    for image, source in zip(fitted, sources):
        final = place_row_frame(image, width, height, 1, left, top, margin,
                                ground=config['grounded'], align_y=fit['align_y'])
        if alpha_nonzero_count(final) != alpha_nonzero_count(image):
            raise ValueError('Placement clipped accepted pose pixels; adjust the common bank geometry')
        path = output / 'source-poses' / source['state'] / f"frame-{source['index']}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        final.save(path)
        records.append(source | {'file': portable(path), 'sha256': digest(path), 'size': [width, height],
            'box': list(final.getbbox()), 'nonzeroPixels': alpha_nonzero_count(final), 'qa': {'approved': False}})
    native = select_native_frames(records, output)
    metrics = final_motion_metrics(records, native)
    return {'version': 3, 'issue': 84, 'id': config['id'], 'kind': 'candidate-canonical-row-common-bank-painted-api-export',
        'inputLattice': None, 'perPoseBboxFit': False, 'commonScale': common_scale,
        'sharedPalette': {'file': portable(output / 'palette.lock.json'), 'sha256': digest(output / 'palette.lock.json')},
        **scale_evidence(rows), 'finalMotionMetrics': metrics,
        'motionPresenceGate': {'threshold': .01, 'status': 'pass' if all(value >= .01 for value in metrics.values()) else 'failed'},
        'placement': {'left': left, 'top': top, 'grounded': config['grounded'], 'baseline': height - margin},
        'operations': ['native-chroma-removal', 'upstream-components',
            'fit_row_to_cells:ONE-uniform-factor-per-state', 'exact-canonical-decoded-pixel-replay:ALL16',
            'tighten_components:ALL16', 'conform_row_logical:ALL16-one-final-scale', 'register_row_frames:ALL16',
            'build_shared_palette:ALL16', 'apply_palette', 'row_placement:one-bank', 'place_row_frame:integer1',
            'fixed-full-cycle-temporal-sampling:idle[0,2,4,6];move[0..7]'],
        'sampling': sampling_contract(), 'sourceFrames': records, 'frames': native,
        'sourceRows': rows, 'quality': 'pending-temporal-and-identity-review'}


def scale_evidence(rows):
    raw = {row['state']: statistics.median(size[1] for size in row['rawSolidComponentSizes']) for row in rows}
    calibrated = {row['state']: statistics.median(size[1] for size in row['componentSizes']) for row in rows}
    return {'rawMagnification': {'medianSolidHeights': raw, 'moveToIdleHeightRatio': raw['move'] / raw['idle'],
                'interpretation': 'Uncorrected source drawing magnification; never an anatomy-quality pass'},
            'stateCalibration': {row['state']: row['officialRowCommonFitScale'] for row in rows},
            'calibratedMedianHeights': calibrated,
            'sourceScaleContinuity': {'status': 'requires-independent-temporal-review',
                'basis': 'Inspect calibrated final head/torso, baseline and temporal continuity; retain raw magnification evidence'}}


def final_motion_metrics(sources, native):
    def frames(records, state):
        return [read_rgba(ROOT / record['file']) for record in records if record['state'] == state]
    return {'sourceIdle8': _motion_presence(frames(sources, 'idle')),
            'nativeIdle4': _motion_presence(frames(native, 'idle')),
            'sourceMove8': _motion_presence(frames(sources, 'move')),
            'nativeMove8': _motion_presence(frames(native, 'move'))}


def select_native_frames(records, output):
    """Copy predetermined full-cycle samples after every source pose has been refined."""
    by_pose = {(frame['state'], frame['index']): frame for frame in records}
    result = []
    for state, target, source in native_ancestry():
        frame = by_pose[(state, source)]
        path = output / state / f'frame-{target}.png'
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / frame['file'], path)
        result.append(frame | {'index': target, 'sourceIndex': source, 'sourcePoseFile': frame['file'],
                               'sourcePoseSha256': frame['sha256'], 'file': portable(path), 'sha256': digest(path)})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    write_json(args.out / 'bank.json', refine_bank(read_json(args.request), args.out))


if __name__ == '__main__':
    main()
