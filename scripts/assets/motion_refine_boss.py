"""Pinned flying coordinates plus one bounded master-footprint camera for a whole boss bank."""
import argparse
from pathlib import Path
import statistics

import sprite_gen.frames.extract as engine
from sprite_gen.curate.curation import apply_transform
from motion_refine_bank import read_rgba, select_native_frames, final_motion_metrics
from motion_refine_flying import flying_inputs
from motion_boss_contract import camera_plan, BOSS_OPERATIONS
from motion_sampling import sampling_contract
from rebuild_common import ROOT, read_json, write_json, digest, portable


def boss_inputs(config, output):
    cells, sources, rows, cell = flying_inputs(config, output)
    final = [value * 2 for value in config['logicalSize']]
    base = read_rgba(ROOT / config['runDir'] / 'base-source.png')
    master = apply_transform(base, {'scale': .5}, tuple(final), snap_scale=1)
    path = output / 'master-footprint-2x.png'; master.save(path)
    camera = camera_plan([list(image.getbbox()) for image in cells], list(master.getbbox()), cell, final)
    transformed = [apply_transform(image, camera['transform'], tuple(cell)) for image in cells]
    for image, source in zip(transformed, sources):
        path = output / 'camera-full-cells' / source['state'] / f"frame-{source['index']}.png"
        path.parent.mkdir(parents=True, exist_ok=True); image.save(path)
        source.update(cameraCell=portable(path), cameraCellSha256=digest(path))
    return transformed, sources, rows, cell, final, camera, output / 'master-footprint-2x.png'


def refine_boss(config, output):
    if config['grounded'] is not False: raise ValueError('Boss camera currently requires the approved flying boss profile')
    output.mkdir(parents=True, exist_ok=True)
    cells, sources, rows, cell, final, camera, master = boss_inputs(config, output)
    logical = [engine.binarize_alpha(engine._kcentroid_downscale(image, *final, True)) for image in cells]
    palette = engine.build_shared_palette(logical, 64); engine.write_pinned_palette(output, palette, 'motion84-shared-whole-bank')
    images = [engine.apply_palette(image, palette) for image in logical]; records = []
    for image, source in zip(images, sources):
        path = output / 'source-poses' / source['state'] / f"frame-{source['index']}.png"
        path.parent.mkdir(parents=True, exist_ok=True); image.save(path)
        records.append(source | {'file': portable(path), 'sha256': digest(path), 'size': final, 'box': list(image.getbbox()),
            'nonzeroPixels': engine.alpha_nonzero_count(image), 'qa': {'approved': False}})
    native = select_native_frames(records, output); metrics = final_motion_metrics(records, native)
    raw = {row['state']: statistics.median(size[1] for size in row['rawSolidComponentSizes']) for row in rows}
    calibrated = {row['state']: statistics.median(image.getbbox()[3] - image.getbbox()[1]
        for image, source in zip(cells, sources) if source['state'] == row['state']) for row in rows}
    return {'version': 5, 'issue': 84, 'id': config['id'], 'kind': 'candidate-boss-whole-bank-master-camera-export',
        'inputLattice': None, 'perPoseBboxFit': False, 'commonScale': final[0] / cell[0], 'camera': camera,
        'masterFootprintFile': portable(master), 'masterFootprintSha256': digest(master),
        'sharedPalette': {'file': portable(output / 'palette.lock.json'), 'sha256': digest(output / 'palette.lock.json')},
        'rawMagnification': {'medianSolidHeights': raw, 'moveToIdleHeightRatio': raw['move'] / raw['idle'],
            'interpretation': 'Raw source drawing magnification; no anatomy approval inferred'},
        'stateCalibration': {row['state']: row['officialRowCommonFitScale'] for row in rows}, 'calibratedMedianHeights': calibrated,
        'sourceScaleContinuity': {'status': 'requires-independent-temporal-review', 'basis': 'One whole-bank camera; review all16 and native12 at the approved master footprint'},
        'finalMotionMetrics': metrics, 'motionPresenceGate': {'threshold': .01, 'status': 'pass' if all(v >= .01 for v in metrics.values()) else 'failed'},
        'placement': {'grounded': False, 'registration': None, 'canonicalCell': cell, 'finalCanvas': final,
            'frameOrigin': 'raw component coordinates followed by one uniform bounded bank camera'},
        'operations': BOSS_OPERATIONS, 'sampling': sampling_contract(), 'sourceFrames': records, 'frames': native,
        'sourceRows': rows, 'quality': 'pending-temporal-and-identity-review'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True); parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(); write_json(args.out / 'bank.json', refine_boss(read_json(args.request), args.out))
