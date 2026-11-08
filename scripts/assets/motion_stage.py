"""Explicit stage5 intake/export/replay; never generate or approve art implicitly."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

from motion_inventory import DEFAULT_MOTION_RECIPE, reject_symlink_chain
from motion_stage_contract import DEFAULT_GEOMETRY, contract_digest
from rebuild_common import ROOT, checked_tool, digest, generation_source, portable, read_json, write_json, validate_png

ENGINE = ROOT / 'scripts/assets/motion_stage_engine.py'


def evidence_path(value):
    if Path(value).is_absolute() or '..' in Path(value).parts: raise ValueError('Stage evidence paths must remain canonical repository-relative paths')
    path = ROOT / value
    reject_symlink_chain(path); path.resolve().relative_to(ROOT / 'verification')
    return path


def stand_source(run, asset):
    reject_symlink_chain(run / 'raw/stand.png'); reject_symlink_chain(run / 'reports/stand.json')
    proof = generation_source(run / 'raw/stand.png', run / 'reports/stand.json')
    if [ref['sha256'] for ref in proof['references']] != [asset['master']['sha256']]:
        raise ValueError('Cold stand generation must actually reference the exact approved brazier master')
    return proof


def geometry_proof(path, stand):
    value = read_json(path); geometry = value['geometry']; preview = value['preview']; review = value['review']
    if geometry['canvas'] != [48, 80] or value['standSourceSha256'] != stand['sourceSha256']:
        raise ValueError('Stage geometry must bind the actual coldstand source and48x80 canvas')
    for key in ['standCap', 'flameCap', 'cup']:
        if len(geometry[key]) != 2 or any(type(n) is not int or n < 0 for n in geometry[key]):
            raise ValueError('Stage geometry coordinates require explicit integer pixel values')
    if (type(geometry['standFootY']) is not int or not 0 < geometry['standFootY'] <= 80 or
            not 0 < geometry['cup'][1] < 80 or not 0 < geometry['cup'][0] < 48 or
            min(geometry['standCap'] + geometry['flameCap']) <= 0 or geometry['flameCap'][1] > geometry['cup'][1]):
        raise ValueError('Stand floor and flame cup must lie inside the stage canvas')
    if digest(evidence_path(preview['file'])) != preview['sha256'] or digest(evidence_path(review['file'])) != review['sha256']:
        raise ValueError('Geometry preview/review evidence changed')
    approved = read_json(evidence_path(review['file']))
    if (approved.get('status') != 'pass' or approved.get('geometry') != geometry or
            approved.get('previewSha256') != preview['sha256'] or approved.get('standSourceSha256') != stand['sourceSha256'] or
            re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', approved.get('reviewer', '')) is None):
        raise ValueError('Actual stand/cup geometry needs a bound canonical reviewer decision')
    return value


def stage_input(run, asset, geometry_file):
    stand = stand_source(run, asset); geometry = geometry_proof(geometry_file, stand)
    flame_run = run / 'flame-row'; request = read_json(flame_run / 'sprite-request.json')
    manifest = read_json(flame_run / 'frames/frames-manifest.json')
    state = request.get('states', {}).get('flame', {})
    if (request.get('subject') != 'effect' or request.get('directions') or set(request.get('states', {})) != {'flame'} or
            state.get('frames') != 4 or state.get('fps') != 6 or state.get('loop') is not True or
            request.get('fit', {}).get('pixel_unfake') is not False or digest(flame_run / 'base-source.png') != asset['master']['sha256']):
        raise ValueError('Stage requires a genuine flat4-pose6fps looping flame-only effect row')
    rows = manifest.get('rows', [])
    if manifest.get('ok') is not True or manifest.get('errors') or len(rows) != 1 or rows[0]['state'] != 'flame' or rows[0]['method'] != 'components' or len(rows[0]['files']) != 4:
        raise ValueError('All4 flame components must extract successfully without slot fallback')
    flame = generation_source(flame_run / 'raw/flame.png', flame_run / 'reports/gen-set/flame.json')
    expected = [flame_run / 'base-source.png', flame_run / 'references/layout-guides/flame.png']
    if flame['references'] != [{'file': portable(path), 'sha256': digest(path)} for path in expected]:
        raise ValueError('Flame generation requires its exact approved base and actual4-cell guide')
    return {'stand': stand, 'flame': flame, 'geometryFile': portable(geometry_file), 'geometrySha256': digest(geometry_file),
        'geometry': geometry, 'requestSha256': digest(flame_run / 'sprite-request.json'),
        'manifestSha256': digest(flame_run / 'frames/frames-manifest.json')}


def run_engine(request, output, tool):
    output.mkdir(parents=True, exist_ok=True); path = output / 'processing-request.json'; write_json(path, request)
    subprocess.run([str(tool.with_name('python')), str(ENGINE), '--request', str(path), '--out', str(output)], check=True, capture_output=True, cwd=ROOT)
    return read_json(output / 'processing.json')


def export_stage(run, output, asset, recipe, tool, geometry_file=None):
    if output.exists(): raise ValueError('Choose a fresh stage output directory')
    run.resolve().relative_to(ROOT / 'verification'); output.resolve().relative_to(ROOT / 'verification')
    if geometry_file is None:
        stand_source(run, asset)
        return run_engine({'mode': 'stand-preview', 'runDir': portable(run), 'geometry': DEFAULT_GEOMETRY}, output, tool)
    proof = stage_input(run, asset, geometry_file)
    request = {'mode': 'export', 'runDir': portable(run), 'geometry': proof['geometry']['geometry']}
    bank = run_engine(request, output, tool)
    if bank['standAlphaSha256'] != proof['geometry']['preview']['alphaSha256']:
        raise ValueError('Final stand geometry differs from the visually reviewed preview')
    bank.update(inputProof=proof, runDir=portable(run), upstream=recipe['tool'],
        contractSha256=contract_digest(asset, request['geometry']),
        scripts=[{'file': portable(path), 'sha256': digest(path)} for path in [ENGINE, ROOT / 'scripts/assets/motion_stage_contract.py', ROOT / 'scripts/assets/motion_refine_bank.py']])
    write_json(output / 'stage-bank.json', bank); return bank


def validate_stage(path, recipe, asset, tool, require_approval=True):
    tool = checked_tool(tool.resolve().parents[2], {'source': recipe['tool']})
    evidence_path(portable(path)); bank = read_json(path)
    if (bank.get('id') != 'stage.brazier' or bank.get('kind') != 'genuine-flameless-stand-plus-four-flame-source-bank' or
            bank.get('upstream') != recipe['tool'] or bank.get('contractSha256') != contract_digest(asset, bank['geometry'])):
        raise ValueError('Stage bank must match its exact source/export contract')
    expected = [{'file': portable(p), 'sha256': digest(p)} for p in [ENGINE, ROOT / 'scripts/assets/motion_stage_contract.py', ROOT / 'scripts/assets/motion_refine_bank.py']]
    if bank.get('scripts') != expected or bank.get('quality') != 'pending-five-source-and-native-composition-review':
        raise ValueError('Stage authoring scripts or source-bank kind changed')
    proof = stage_input(ROOT / bank['runDir'], asset, ROOT / bank['inputProof']['geometryFile'])
    if proof != bank['inputProof'] or bank['standAlphaSha256'] != proof['geometry']['preview']['alphaSha256']:
        raise ValueError('Stage source/geometry ancestry changed')
    if [record['name'] for record in bank['records']] != ['stand', 'flame-0', 'flame-1', 'flame-2', 'flame-3']:
        raise ValueError('Stage must preserve exactly one stand and four flame resources')
    for record in bank['records']:
        file = path.parent / (record['name'] + '.png')
        reject_symlink_chain(file)
        if record['file'] != portable(file) or digest(file) != record['sha256'] or validate_png(file) != (48, 80):
            raise ValueError('Stage resource bytes or geometry changed')
    palette = path.parent / 'palette.lock.json'
    if bank['sharedPalette'] != {'file': portable(palette), 'sha256': digest(palette)}:
        raise ValueError('Stage requires its exact shared5-source palette evidence')
    with tempfile.TemporaryDirectory(prefix='stage-replay-', dir=ROOT / 'verification') as temporary:
        replay = run_engine({'mode': 'export', 'runDir': bank['runDir'], 'geometry': bank['geometry']}, Path(temporary), tool)
        for key in ['geometry', 'standAlphaSha256', 'standProcessing', 'flameCommonScale', 'canonicalFlameReplay', 'rawFlameSource', 'processingChroma', 'flameMotionPresence', 'hardwareInstances', 'operations']:
            if bank[key] != replay[key]: raise ValueError('Stage differs from actual upstream replay: ' + key)
        keys = ['name', 'sha256', 'size', 'box', 'nonzeroPixels', 'alphaSha256', 'alphaValues', 'visibleColors']
        if bank['sharedPalette']['sha256'] != replay['sharedPalette']['sha256'] or any(any(a[k] != b[k] for k in keys) for a, b in zip(bank['records'], replay['records'])):
            raise ValueError('Stage final pixels/palette differ from actual upstream replay')
    if require_approval: validate_stage_reviews(path, bank)
    return bank


def validate_stage_reviews(path, bank):
    if bank['flameMotionPresence'] < .01: raise ValueError('A static flame cannot pass the genuine4-pose motion gate')
    approval = read_json(path.parent / 'stage-approval.json'); names = []
    if approval.get('bankSha256') != digest(path) or len(approval.get('reviews', [])) != 2:
        raise ValueError('Stage requires two exact-bank independent source/composition reviews')
    for ref in approval['reviews']:
        file = evidence_path(ref['file'])
        if digest(file) != ref['sha256']: raise ValueError('Stage review changed')
        review = read_json(file); name = review.get('reviewer', '')
        if (re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', name) is None or review.get('bankSha256') != digest(path) or
                review.get('status') != 'pass' or review.get('coverage') != {'stand': 1, 'flame': 4, 'nativeLoop': 'pass'} or
                review.get('standFlameless') is not True or review.get('flameOnly') is not True or review.get('hardwareStatic') is not True):
            raise ValueError('Review must cover all5 genuine sources and static hardware/native flame loop')
        names.append(name)
    if names[0] == names[1]: raise ValueError('Stage reviewers must be distinct')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['stand-preview', 'export', 'validate'])
    parser.add_argument('--run-dir', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--geometry', type=Path); parser.add_argument('--bank', type=Path)
    parser.add_argument('--tool-root', type=Path, required=True); parser.add_argument('--recipe', type=Path, default=DEFAULT_MOTION_RECIPE)
    parser.add_argument('--require-approval', action='store_true'); args = parser.parse_args()
    recipe = read_json(args.recipe); asset = next(a for a in recipe['assets'] if a['id'] == 'stage.brazier')
    tool = checked_tool(args.tool_root, {'source': recipe['tool']})
    if args.command == 'validate': validate_stage(args.bank.resolve(), recipe, asset, tool, args.require_approval)
    else:
        if args.command == 'export' and not args.geometry: parser.error('export requires visually frozen --geometry')
        export_stage(args.run_dir.resolve(), args.out.resolve(), asset, recipe, tool, args.geometry.resolve() if args.geometry else None)
    print('Stage source/export validation complete; approval remains an explicit independent step')


if __name__ == '__main__': main()
