"""Fail-closed candidate bank provenance; semantic gait acceptance remains independent."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import re

from rebuild_common import ROOT, checked_tool, digest, portable, png_size, read_json, validate_png
from motion_sampling import SOURCE_STATES, NATIVE_STATES, native_ancestry, ordered_poses, sampling_contract
from motion_flying_contract import FLYING_OPERATIONS
from motion_boss_contract import BOSS_OPERATIONS

OPERATIONS = ['native-chroma-removal', 'upstream-components',
    'fit_row_to_cells:ONE-uniform-factor-per-state', 'exact-canonical-decoded-pixel-replay:ALL16',
    'tighten_components:ALL16', 'conform_row_logical:ALL16-one-final-scale', 'register_row_frames:ALL16',
    'build_shared_palette:ALL16', 'apply_palette', 'row_placement:one-bank', 'place_row_frame:integer1',
    'fixed-full-cycle-temporal-sampling:idle[0,2,4,6];move[0..7]']


def export_contract(recipe, asset):
    settings = recipe['bossExport'] if asset.get('profile') == 'boss' else recipe['bankExport'] if asset['grounded'] else recipe['flyingExport']
    return {key: asset[key] for key in ['id', 'logicalSize', 'anchor', 'grounded', 'sourceStates', 'nativeStates', 'frameSelection',
                                       'resourceScale', 'resourceGrid', 'paletteSize']} | {'bankExport': settings, 'baseMasterSha256': asset['master']['sha256']}


def contract_digest(recipe, asset):
    return hashlib.sha256(json.dumps(export_contract(recipe, asset), sort_keys=True).encode()).hexdigest()


def validate_bank(bank_file, recipe, asset, tool, require_approval=False):
    tool = checked_tool(tool.resolve().parents[2], {'source': recipe['tool']})
    from motion_source import intake
    bank = read_json(bank_file)
    operations = BOSS_OPERATIONS if asset.get('profile') == 'boss' else OPERATIONS if asset['grounded'] else FLYING_OPERATIONS
    if (bank.get('id') != asset['id'] or bank.get('operations') != operations or
            bank.get('inputLattice', 'missing') is not None or bank.get('perPoseBboxFit') is not False or
            bank.get('exportContractSha256') != contract_digest(recipe, asset) or bank.get('upstream') != recipe['tool']):
        raise ValueError('Bank requires the reviewed whole-bank source/export contract')
    script = verify_authoring_scripts(bank, asset)
    if asset.get('profile') == 'boss':
        master = bank_file.parent / 'master-footprint-2x.png'
        if bank.get('masterFootprintFile') != portable(master) or digest(master) != bank.get('masterFootprintSha256'):
            raise ValueError('Boss master-footprint evidence is missing or changed')
    proof = bank.get('inputProof', {})
    run = (ROOT / proof.get('requestFile', '')).parent
    run.resolve().relative_to(ROOT / 'verification')
    if intake(run, asset, tool) != proof:
        raise ValueError('Bank input provenance differs from actual source rows/requests/reports')
    request = {'id': asset['id'], 'logicalSize': asset['logicalSize'], 'anchor': asset['anchor'],
               'grounded': asset['grounded'], 'runDir': portable(run)}
    if read_json(bank_file.parent / 'bank-request.json') != request:
        raise ValueError('Bank processing request differs from the approved export contract')
    if bank.get('sampling') != sampling_contract():
        raise ValueError('Bank requires the fixed duration-preserving16-source-to12-native sampling contract')
    source_frames = bank.get('sourceFrames', [])
    if [(frame.get('state'), frame.get('index')) for frame in source_frames] != ordered_poses(SOURCE_STATES):
        raise ValueError('All16 source poses must be retained exactly once, including unsampled idle poses')
    frames = bank.get('frames', [])
    if [(frame.get('state'), frame.get('index')) for frame in frames] != ordered_poses(NATIVE_STATES):
        raise ValueError('All12 native poses are required exactly once and in order')
    row_proofs = {('idle' if row['sourceState'].endswith('_idle') else 'move'): row for row in proof['rows']}
    for frame in source_frames:
        selected = row_proofs[frame['state']]
        if frame['sourceRow']['rawFile'] != selected['selectedRawFile'] or frame['sourceRow']['rawSha256'] != selected['selectedRawSha256']:
            raise ValueError('Every pose must bind to its selected, provider-verified raw row')
        verify_frame_paths(bank_file.parent, frame, asset)
    verify_native_ancestry(bank_file.parent, frames, source_frames)
    palette = bank.get('sharedPalette', {})
    palette_file = bank_file.parent / 'palette.lock.json'
    if palette != {'file': portable(palette_file), 'sha256': digest(palette_file)}:
        raise ValueError('Bank requires its actual shared palette evidence')
    subprocess.run([str(tool.with_name('python')), str(ROOT / 'scripts/assets/motion_inspect_bank.py'),
                    '--bank', str(bank_file)], check=True, capture_output=True)
    verify_replay(bank, bank_file.parent / 'bank-request.json', tool, script)
    if require_approval:
        validate_approval(bank_file, bank)
    return bank


def verify_authoring_scripts(bank, asset):
    from motion_source import authoring_script, foundation_files
    script = authoring_script(asset)
    if bank.get('authoringScript') != {'file': portable(script), 'sha256': digest(script)}:
        raise ValueError('Bank authoring script changed')
    sampling_script = ROOT / 'scripts/assets/motion_sampling.py'
    if bank.get('samplingScript') != {'file': portable(sampling_script), 'sha256': digest(sampling_script)}:
        raise ValueError('Bank temporal sampling implementation changed')
    if not asset['grounded']:
        expected = [{'file': file, 'sha256': digest(ROOT / file)} for file in foundation_files(asset)]
        if bank.get('foundationScripts') != expected:
            raise ValueError('Flying coordinate authoring foundations changed')
    return script


def verify_replay(bank, request, tool, script):
    """Recompute upstream derivation; self-reported hashes cannot prove source ancestry."""
    with tempfile.TemporaryDirectory(prefix='motion-bank-replay-', dir=ROOT / 'verification') as temporary:
        output = Path(temporary)
        subprocess.run([str(tool.with_name('python')), str(script),
                        '--request', str(request), '--out', str(output)], cwd=ROOT, check=True, capture_output=True)
        replay = read_json(output / 'bank.json')
        if script.name == 'motion_refine_boss.py':
            if bank['camera'] != replay['camera'] or bank['masterFootprintSha256'] != replay['masterFootprintSha256']:
                raise ValueError('Boss camera differs from the bounded master-footprint replay')
        for key in ['kind', 'inputLattice', 'perPoseBboxFit', 'commonScale', 'operations',
                    'rawMagnification', 'stateCalibration', 'calibratedMedianHeights',
                    'finalMotionMetrics', 'motionPresenceGate',
                    'sourceScaleContinuity', 'placement', 'sourceRows', 'quality', 'sampling']:
            if bank.get(key) != replay[key]:
                raise ValueError('Bank differs from deterministic upstream replay: ' + key)
        if bank['sharedPalette']['sha256'] != replay['sharedPalette']['sha256']:
            raise ValueError('Shared palette differs from deterministic upstream replay')
        keys = ['state', 'index', 'sha256', 'size', 'box', 'nonzeroPixels',
                'sourceComponentSha256', 'canonicalComparison', 'canonicalComparisonSha256', 'sourceRow']
        if bank['placement']['grounded'] is False:
            keys += ['coordinateProof', 'mappedCellSha256']
        if script.name == 'motion_refine_boss.py': keys += ['cameraCellSha256']
        for collection in ['sourceFrames', 'frames']:
            for actual, expected in zip(bank[collection], replay[collection]):
                if any(actual.get(key) != expected[key] for key in keys):
                    raise ValueError('Pose pixels/source evidence differ from deterministic upstream replay')


def verify_frame_paths(directory, frame, asset):
    expected = directory / 'source-poses' / frame['state'] / f"frame-{frame['index']}.png"
    component = directory / 'source-components' / frame['state'] / expected.name
    if frame['file'] != portable(expected) or frame['sha256'] != digest(expected):
        raise ValueError('Pose output path or hash differs from its candidate')
    if frame['sourceComponent'] != portable(component) or frame['sourceComponentSha256'] != digest(component):
        raise ValueError('Pose source component evidence is missing or changed')
    comparison = (ROOT / frame['canonicalComparison']).resolve()
    comparison.relative_to(ROOT / 'verification')
    if digest(comparison) != frame['canonicalComparisonSha256']:
        raise ValueError('Canonical comparison changed')
    dimensions = tuple(value * 2 for value in asset['logicalSize'])
    if validate_png(expected) != dimensions or frame['size'] != list(dimensions):
        raise ValueError('Pose resources must remain two-times logical size')
    row = frame['sourceRow']
    raw = (ROOT / row['rawFile']).resolve()
    raw.relative_to(ROOT / 'verification')
    if digest(raw) != row['rawSha256'] or list(png_size(raw)) != row['rawSize']:
        raise ValueError('Raw-row geometry/source bytes changed')
    if list(png_size(component)) != row['componentSizes'][frame['index']]:
        raise ValueError('Source component dimensions differ from measured row evidence')
    if not asset['grounded']:
        verify_flying_evidence(directory, frame)
    if asset.get('profile') == 'boss':
        camera = directory / 'camera-full-cells' / frame['state'] / f"frame-{frame['index']}.png"
        if frame['cameraCell'] != portable(camera) or digest(camera) != frame['cameraCellSha256']:
            raise ValueError('Boss pre-kCentroid camera-cell evidence changed')


def verify_flying_evidence(directory, frame):
    mask = directory / 'component-masks' / frame['state'] / f"frame-{frame['index']}.bin"
    proof = frame['coordinateProof']
    if (frame['maskEvidence'] != {'file': portable(mask), 'sha256': digest(mask)} or
            digest(mask) != proof['maskRawIndexSha256'] or mask.stat().st_size != proof['maskPixelCount'] * 4):
        raise ValueError('Flying requires exact upstream raw component-mask membership evidence')
    mapped = directory / 'mapped-full-cells' / frame['state'] / f"frame-{frame['index']}.png"
    if (frame['mappedCell'] != portable(mapped) or frame['mappedCellSha256'] != digest(mapped) or
            validate_png(mapped) != tuple(frame['sourceRow']['calibrationCellSize'])):
        raise ValueError('Flying mapped full-cell evidence is missing or changed')


def verify_native_ancestry(directory, frames, sources):
    by_pose = {(frame['state'], frame['index']): frame for frame in sources}
    for frame, (state, target, source) in zip(frames, native_ancestry()):
        ancestor = by_pose[(state, source)]
        expected = directory / state / f'frame-{target}.png'
        if (frame.get('sourceIndex') != source or frame.get('sourcePoseFile') != ancestor['file'] or
                frame.get('sourcePoseSha256') != ancestor['sha256'] or frame['file'] != portable(expected) or
                digest(expected) != ancestor['sha256'] or frame['sha256'] != ancestor['sha256']):
            raise ValueError('Native pose must be the exact predetermined source-pose bytes')
        inherited = {key: value for key, value in ancestor.items() if key not in ['index', 'file']}
        if any(frame.get(key) != value for key, value in inherited.items()):
            raise ValueError('Native pose ancestry metadata differs from its fixed source pose')


def validate_approval(bank_file, bank):
    if bank.get('motionPresenceGate') != {'threshold': .01, 'status': 'pass'}:
        raise ValueError('All source/native cycles must meet the unchanged upstream motion threshold')
    approval = read_json(bank_file.parent / 'bank-approval.json')
    reviews = approval.get('reviews', [])
    if approval.get('bankSha256') != digest(bank_file) or len(reviews) != 2:
        raise ValueError('Both independent reviews must bind this exact immutable bank')
    names = []
    for review in reviews:
        path = (ROOT / review['file']).resolve()
        path.relative_to(ROOT / 'verification')
        if digest(path) != review['sha256']:
            raise ValueError('Bank review evidence changed')
        value = read_json(path)
        from motion_direction_proof import validate_review_direction
        validate_review_direction(bank['id'], value)
        if value.get('bankSha256') != digest(bank_file) or value.get('states') != {'idle': 'pass', 'move': 'pass'}:
            raise ValueError('Both complete source states need temporal/anatomy/identity acceptance')
        if value.get('coverage') != {'source': {'idle': 8, 'move': 8}, 'native': {'idle': 4, 'move': 8}}:
            raise ValueError('Review must cover all16 source poses before accepting the fixed12 native poses')
        if any(row['sourceWarnings'] for row in bank['sourceRows']) and value.get('sourceWarningsAcknowledged') is not True:
            raise ValueError('Source warnings require explicit acknowledgment in both independent reviews')
        name = value.get('reviewer')
        if not isinstance(name, str) or re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', name) is None:
            raise ValueError('Reviewers require canonical nonblank lowercase ASCII hyphen-token IDs')
        names.append(name)
    if names[0] == names[1]:
        raise ValueError('Producer and independent reviewer must be distinct')
