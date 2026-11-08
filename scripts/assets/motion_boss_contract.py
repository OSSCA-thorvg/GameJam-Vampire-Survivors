"""Boss-only whole-bank camera; ordinary flying and grounded exports remain frozen."""
from motion_flying_contract import FLYING_OPERATIONS

BOSS_STRATEGY = 'master-footprint-one-camera-before-kcentroid-ALL16'
BOSS_OPERATIONS = FLYING_OPERATIONS[:5] + ['master-footprint-camera:ONE-affine-ALL16-bounded'] + FLYING_OPERATIONS[5:]


def camera_plan(boxes, master_box, cell, final, margin=2):
    source = boxes[0]; ratio = final[0] / cell[0]
    center = [(source[0] + source[2]) / 2, (source[1] + source[3]) / 2]
    target = [(master_box[0] + master_box[2]) / 2 / ratio, (master_box[1] + master_box[3]) / 2 / ratio]
    wanted = min((master_box[2] - master_box[0]) / ((source[2] - source[0]) * ratio),
                 (master_box[3] - master_box[1]) / ((source[3] - source[1]) * ratio))
    union = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
    limits = []
    for axis in range(2):
        if center[axis] > union[axis]: limits.append((target[axis] - margin) / (center[axis] - union[axis]))
        if union[axis + 2] > center[axis]: limits.append((cell[axis] - margin - target[axis]) / (union[axis + 2] - center[axis]))
    allowed = min(limits); scale = min(wanted, allowed)
    if scale <= 0: raise ValueError('The shared boss camera cannot fit all16 poses inside the approved stage')
    transform = {'scale': scale,
        'dx': target[0] - (cell[0] / 2 + scale * (center[0] - cell[0] / 2)),
        'dy': target[1] - (cell[1] / 2 + scale * (center[1] - cell[1] / 2))}
    return {'transform': transform, 'wantedScale': wanted, 'allowedAll16Scale': allowed, 'marginStagePixels': margin,
            'neutralSourceBox': source, 'master2xBox': master_box, 'all16SourceBoxes': boxes,
            'oneCameraAcrossAll16': True, 'perPoseFit': False, 'appliedBeforeFinalKCentroid': True}
