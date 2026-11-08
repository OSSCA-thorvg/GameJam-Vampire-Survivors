"""Offline16-source/12-native intake: verify GPT-row provenance, never generate implicitly."""
import argparse
from pathlib import Path
import subprocess
import json
import os
import tempfile

from motion_inventory import ACTORS, DEFAULT_MOTION_RECIPE, validate_inventory
from rebuild_common import ROOT, checked_tool, digest, generation_source, portable, read_json, write_json


def reference_proof(origin, request, state, references, tool=None):
    try:
        from motion_reference_proof import prove
    except ModuleNotFoundError as error:
        if error.name not in ['sprite_gen', 'PIL']:
            raise
        root = Path(os.environ.get('MOTION_TOOL_ROOT', str(ROOT / 'verification/issue-84/tool/sprite-gen')))
        python = tool.with_name('python') if tool else root / '.venv/bin/python'
        with tempfile.TemporaryDirectory(prefix='motion-reference-input-', dir=ROOT / 'verification') as temporary:
            path = Path(temporary) / 'request.json'
            write_json(path, {'origin': str(origin), 'request': request, 'state': state, 'references': references})
            try:
                result = subprocess.run([str(python), str(ROOT / 'scripts/assets/motion_reference_proof.py'),
                                         '--input', str(path)], check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as failure:
                raise ValueError('Upstream reference derivation rejected the source ancestry') from failure
            return json.loads(result.stdout)
    return prove(origin, request, state, references)


def row_proof(run, state, expected, request, tool=None):
    report_file = run / 'reports/gen-set' / (state + '.json')
    report = read_json(report_file)
    original = Path(report['out']).resolve()
    original.relative_to(ROOT / 'verification')
    source = generation_source(original, report_file)
    # taxonomy/v1 stores direction/state separately; require the known current route.
    selected = run / 'raw/down45' / ('idle.png' if state.endswith('_idle') else 'walk.png')
    if digest(selected) != source['sourceSha256']:
        raise ValueError('An adopted row must exactly match its original provider output bytes')
    origin = original.parents[2]
    if original != origin / 'raw/down45' / selected.name:
        raise ValueError('Provider output must belong to its original taxonomy source run')
    ancestry = reference_proof(origin, request, state, source['references'], tool)
    return {'sourceState': state, 'frames': expected['frames'], 'fps': expected['fps'],
            'actualProviderSource': source, 'selectedRawFile': portable(selected),
            'selectedRawSha256': digest(selected),
            'adoptedCopy': original != selected.resolve(), 'referenceDerivation': ancestry}


def intake(run, asset, tool=None):
    if digest(run / 'base-source.png') != asset['master']['sha256']:
        raise ValueError('The source bank must preserve the approved base master bytes')
    request_file = run / 'sprite-request.json'
    request = read_json(request_file)
    if request.get('layout') != 'taxonomy/v1' or request.get('fit', {}).get('pixel_unfake') is not False:
        raise ValueError('The reviewed taxonomy/non-pixel canonical comparison route is required')
    manifest_file = run / 'frames/frames-manifest.json'
    manifest = read_json(manifest_file)
    if manifest.get('ok') is not True or manifest.get('errors'):
        raise ValueError('All source rows require a successful canonical extraction with no errors')
    proofs = []
    for kind, state in [('idle', 'down45_idle'), ('move', 'down45_walk')]:
        expected = asset['sourceStates'][kind]
        actual = request['states'][state]
        row = next(row for row in manifest['rows'] if row['state'] == state)
        if (actual.get('loop') is not True or actual['frames'] != expected['frames'] or actual['fps'] != expected['fps'] or
                row['frames'] != expected['frames'] or len(row['files']) != expected['frames'] or
                row['ok'] is not True or row['method'] != 'components'):
            raise ValueError('Every source row requires complete accepted-count canonical components; no slot fallback')
        proof = row_proof(run, state, expected, request, tool)
        if kind == 'idle' and asset['master']['sha256'] not in [reference['sha256'] for reference in proof['actualProviderSource']['references']]:
            raise ValueError('Idle generation must actually reference its approved base master')
        proofs.append(proof)
    if proofs[1]['referenceDerivation']['anchor']['idleRawSha256'] != proofs[0]['selectedRawSha256']:
        raise ValueError('Walk anchor must descend from this exact selected idle source row')
    return {'requestFile': portable(request_file), 'requestSha256': digest(request_file),
            'canonicalManifest': portable(manifest_file), 'canonicalManifestSha256': digest(manifest_file),
            'rows': proofs}


def authoring_script(asset):
    if asset.get('profile') == 'boss': return ROOT / 'scripts/assets/motion_refine_boss.py'
    return ROOT / 'scripts/assets' / ('motion_refine_bank.py' if asset['grounded'] else 'motion_refine_flying.py')


def foundation_files(asset):
    if asset['grounded']: return []
    files = ['scripts/assets/motion_refine_bank.py', 'scripts/assets/motion_flying_contract.py']
    if asset.get('profile') == 'boss': files += ['scripts/assets/motion_refine_flying.py', 'scripts/assets/motion_boss_contract.py']
    return files


def export_bank(recipe, asset, run, output, tool):
    run = run.resolve()
    output = output.resolve()
    run.relative_to(ROOT / 'verification')
    output.relative_to(ROOT / 'verification')
    if output.exists():
        raise ValueError('Use a fresh bank output; source candidates and proofs are immutable')
    proof = intake(run, asset, tool)
    output.mkdir(parents=True)
    request = {'id': asset['id'], 'logicalSize': asset['logicalSize'], 'anchor': asset['anchor'],
               'grounded': asset['grounded'], 'runDir': portable(run)}
    request_file = output / 'bank-request.json'
    write_json(request_file, request)
    script = authoring_script(asset)
    with (output / 'bank-process.log').open('w') as log:
        subprocess.run([str(tool.with_name('python')), str(script), '--request', str(request_file),
                        '--out', str(output)], check=True, stdout=log, stderr=subprocess.STDOUT, cwd=ROOT)
    bank_file = output / 'bank.json'
    bank = read_json(bank_file)
    from motion_bank_proof import contract_digest
    bank.update(inputProof=proof, upstream=recipe['tool'], exportContractSha256=contract_digest(recipe, asset),
                authoringScript={'file': portable(script), 'sha256': digest(script)},
                samplingScript={'file': 'scripts/assets/motion_sampling.py',
                                'sha256': digest(ROOT / 'scripts/assets/motion_sampling.py')})
    if not asset['grounded']:
        bank['foundationScripts'] = [{'file': file, 'sha256': digest(ROOT / file)} for file in foundation_files(asset)]
    write_json(bank_file, bank)
    return bank


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, default=DEFAULT_MOTION_RECIPE)
    parser.add_argument('--id', required=True)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tool-root', type=Path, required=True)
    args = parser.parse_args()
    recipe = read_json(args.recipe)
    validate_inventory(recipe)
    if args.id not in ACTORS:
        raise ValueError('Only the closed actor inventory uses this12-pose intake')
    asset = next(asset for asset in recipe['assets'] if asset['id'] == args.id)
    bank = export_bank(recipe, asset, args.run_dir, args.out, checked_tool(args.tool_root, {'source': recipe['tool']}))
    print(f"Candidate {args.id}:16source/12native poses, one common scale/palette; full-source temporal review remains required")
    print('Uncorrected source move/idle magnification:', bank['rawMagnification']['moveToIdleHeightRatio'])
    print('Official uniform state factors:', bank['stateCalibration'])


if __name__ == '__main__':
    main()
