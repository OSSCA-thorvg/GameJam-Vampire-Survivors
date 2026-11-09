"""Pinned upstream flying refinement; mask coordinates survive wings and genuine hover."""
import argparse
import hashlib
from pathlib import Path
import statistics
import struct
from unittest.mock import patch

import sprite_gen.frames.extract as engine
from sprite_gen.curate.curation import apply_transform

from motion_refine_bank import (canonical_row_components, final_motion_metrics, read_rgba,
                               select_native_frames, source_components)
from motion_flying_contract import FLYING_OPERATIONS
from motion_sampling import sampling_contract
from rebuild_common import ROOT, digest, portable, read_json, write_json


def mask_evidence(source, groups, padding=4):
    indices = sorted(index for group in groups for index in group['pixels'])
    box = [min(g['bbox'][0] for g in groups), min(g['bbox'][1] for g in groups),
           max(g['bbox'][2] for g in groups), max(g['bbox'][3] for g in groups)]
    encoded = b''.join(struct.pack('>I', index) for index in indices)
    return {'rawBBox': box, 'componentOrigin': [max(0, box[0] - padding), max(0, box[1] - padding)],
            'maskPixelCount': len(indices), 'maskRawIndexSha256': hashlib.sha256(encoded).hexdigest(),
            'maskEncoding': 'sorted big-endian uint32 raw-image pixel indices'}, encoded


def capture_components(run, state, request, manifest):
    # Observe the unmodified engine's actual grouping; never replace its selection or pixels.
    with patch.object(engine, 'component_group_image', wraps=engine.component_group_image) as trace:
        components, row = source_components(run, state, request, manifest.get('extract_args', {}), tight=False)
    masks = [mask_evidence(*call.args, **call.kwargs) for call in trace.call_args_list]
    if len(masks) != 8 or len(components) != 8:
        raise ValueError('Flying requires all8 actual connected-component masks per source state')
    for component, (proof, _) in zip(components, masks):
        if engine.alpha_nonzero_count(component) != proof['maskPixelCount']:
            raise ValueError('Masked component pixels differ from actual upstream membership')
    return components, row, masks


def coordinate_mapping(info, component_size, raw_size, index, factor, cell):
    raw_width, raw_height = raw_size
    center = (index + .5) * raw_width / 8
    midline = raw_height / 2
    ox, oy = info['componentOrigin']
    transform = {'scale': factor, 'dx': factor * (ox + component_size[0] / 2 - center),
                 'dy': factor * (oy + component_size[1] / 2 - midline)}
    box = info['rawBBox']
    projected = [cell[0] / 2 + factor * (box[0] - center), cell[1] / 2 + factor * (box[1] - midline),
                 cell[0] / 2 + factor * (box[2] - center), cell[1] / 2 + factor * (box[3] - midline)]
    if min(projected) < 0 or projected[2] > cell[0] or projected[3] > cell[1]:
        raise ValueError('Common flying state affine clips a real component; revise shared stage geometry')
    return info | {'slotOrigin': [index * raw_width / 8, 0], 'slotCenter': center, 'rowMidline': midline,
        'stateScale': factor, 'componentToCellTransform': transform, 'projectedMaskBounds': projected,
        'affine': 'cellPoint = cellCenter + stateFactor*(rawPoint - [slotCenter,rowMidline])'}


def flying_inputs(config, output):
    run = ROOT / config['runDir']
    request = read_json(run / 'sprite-request.json')
    manifest = read_json(run / 'frames/frames-manifest.json')
    cell = [request['cell']['width'], request['cell']['height']]
    images, records, rows = [], [], []
    for state, kind in [('down45_idle', 'idle'), ('down45_walk', 'move')]:
        canonical = next(row for row in manifest['rows'] if row['state'] == state)
        _, calibration = canonical_row_components(run, state, request, manifest, canonical)
        components, row, masks = capture_components(run, state, request, manifest)
        factor = calibration['officialRowCommonFitScale']
        row.update(state=kind, sourceState=state, officialRowCommonFitScale=factor,
            rawSolidComponentSizes=calibration['rawSolidComponentSizes'],
            canonicalFrames=calibration['canonicalFrames'], canonicalDecodedPixelReplay=[True] * 8,
            calibrationCellSize=cell, sourceWarnings=manifest.get('warnings', []), sourceErrors=manifest.get('errors', []))
        rows.append(row)
        for index, (component, (mask, encoded)) in enumerate(zip(components, masks)):
            proof = coordinate_mapping(mask, component.size, row['rawSize'], index, factor, cell)
            stage = apply_transform(component, proof['componentToCellTransform'], tuple(cell))
            component_path = output / 'source-components' / kind / f'frame-{index}.png'
            mask_path = output / 'component-masks' / kind / f'frame-{index}.bin'
            mapped = output / 'mapped-full-cells' / kind / f'frame-{index}.png'
            for path in [component_path, mask_path, mapped]: path.parent.mkdir(parents=True, exist_ok=True)
            component.save(component_path); mask_path.write_bytes(encoded); stage.save(mapped)
            comparison = run / canonical['files'][index]
            records.append({'state': kind, 'index': index, 'sourceRow': row, 'coordinateProof': proof,
                'sourceComponent': portable(component_path), 'sourceComponentSha256': digest(component_path),
                'maskEvidence': {'file': portable(mask_path), 'sha256': digest(mask_path)},
                'mappedCell': portable(mapped), 'mappedCellSha256': digest(mapped),
                'canonicalComparison': portable(comparison), 'canonicalComparisonSha256': digest(comparison)})
            images.append(stage)
    return images, records, rows, cell


def refine_flying(config, output):
    if config['grounded'] is not False:
        raise ValueError('The raw-coordinate flying route requires the flying profile')
    output.mkdir(parents=True, exist_ok=True)
    cells, sources, rows, cell = flying_inputs(config, output)
    width, height = [value * 2 for value in config['logicalSize']]
    if width / cell[0] != height / cell[1]:
        raise ValueError('Flying final full-cell scale must be uniform on both axes')
    logical = [engine.binarize_alpha(engine._kcentroid_downscale(frame, width, height, True)) for frame in cells]
    palette = engine.build_shared_palette(logical, 64)
    engine.write_pinned_palette(output, palette, 'motion84-shared-whole-bank')
    frames = [engine.apply_palette(frame, palette) for frame in logical]
    records = []
    for image, source in zip(frames, sources):
        path = output / 'source-poses' / source['state'] / f"frame-{source['index']}.png"
        path.parent.mkdir(parents=True, exist_ok=True); image.save(path)
        records.append(source | {'file': portable(path), 'sha256': digest(path), 'size': [width, height],
            'box': list(image.getbbox()), 'nonzeroPixels': engine.alpha_nonzero_count(image), 'qa': {'approved': False}})
    native = select_native_frames(records, output)
    metrics = final_motion_metrics(records, native)
    raw = {row['state']: statistics.median(size[1] for size in row['rawSolidComponentSizes']) for row in rows}
    calibrated = {row['state']: statistics.median(image.getbbox()[3] - image.getbbox()[1]
                    for image, source in zip(cells, sources) if source['state'] == row['state']) for row in rows}
    return {'version': 4, 'issue': 84, 'id': config['id'], 'kind': 'candidate-flying-raw-coordinate-bank-painted-api-export',
        'inputLattice': None, 'perPoseBboxFit': False, 'commonScale': width / cell[0],
        'sharedPalette': {'file': portable(output / 'palette.lock.json'), 'sha256': digest(output / 'palette.lock.json')},
        'rawMagnification': {'medianSolidHeights': raw, 'moveToIdleHeightRatio': raw['move'] / raw['idle'],
            'interpretation': 'Uncorrected source drawing magnification; never an anatomy-quality pass'},
        'stateCalibration': {row['state']: row['officialRowCommonFitScale'] for row in rows},
        'calibratedMedianHeights': calibrated, 'sourceScaleContinuity': {'status': 'requires-independent-temporal-review',
            'basis': 'Preserve actual raw coordinate motion; inspect final head/torso scale and wingbeat'},
        'finalMotionMetrics': metrics, 'motionPresenceGate': {'threshold': .01, 'status': 'pass' if all(v >= .01 for v in metrics.values()) else 'failed'},
        'placement': {'grounded': False, 'registration': None, 'canonicalCell': cell, 'finalCanvas': [width, height],
                      'frameOrigin': 'declared8-column slot center and raw-row midline; metadata only, never raster cuts'},
        'operations': FLYING_OPERATIONS, 'sampling': sampling_contract(), 'sourceFrames': records,
        'frames': native, 'sourceRows': rows, 'quality': 'pending-temporal-and-identity-review'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True); parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    write_json(args.out / 'bank.json', refine_flying(read_json(args.request), args.out))
