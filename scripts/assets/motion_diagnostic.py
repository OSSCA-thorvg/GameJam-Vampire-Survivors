"""Create an ignored copied asset pack for GPU mechanics; reused stills are NOT gait acceptance."""
import argparse
from pathlib import Path
import shutil
import subprocess

from motion_inventory import DEFAULT_MOTION_RECIPE, validate_inventory
from motion_lottie import actor_document, flat_document
from rebuild_common import ROOT, checked_tool, digest, read_json, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, default=DEFAULT_MOTION_RECIPE)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tool-root', type=Path, required=True)
    args = parser.parse_args()
    recipe = read_json(args.recipe)
    validate_inventory(recipe)
    output = args.out.resolve()
    output.relative_to(ROOT / 'verification')
    if output.exists():
        raise ValueError('Choose a fresh diagnostic pack directory; existing outputs are left intact')
    tool = checked_tool(args.tool_root, {'source': recipe['tool']})
    assets = output / 'assets'
    shutil.copytree(ROOT / 'assets', assets)
    image_report = output / 'diagnostic-images.json'
    subprocess.run([str(tool.with_name('python')), str(ROOT / 'scripts/assets/motion_diagnostic_images.py'),
                    '--recipe', str(args.recipe), '--assets', str(assets), '--report', str(image_report)], check=True)
    manifest = read_json(assets / 'manifest.json')
    wrappers = []
    for asset in recipe['assets']:
        entry = manifest['assets'][asset['id']]
        original = entry['file']
        if asset['id'] not in ['fx.levelUp', 'fx.chestOpen']:
            document = actor_document(asset, True) if asset['kind'] == 'actor' else flat_document(asset, True)
            write_json(assets / asset['outputFile'], document)
            (assets / original).unlink()
        entry.update(file=asset['outputFile'], format='lottie', loop=asset['kind'] == 'actor' or asset['runtime']['loop'])
        entry.pop('filter', None)
        wrappers.append({'id': asset['id'], 'file': asset['outputFile'],
                         'sha256': digest(assets / asset['outputFile'])})
    write_json(assets / 'manifest.json', manifest)
    write_json(output / 'diagnostic-pack.json', {'kind': 'GPU-DIAGNOSTIC-REUSED-STILLS-NOT-MOTION-QUALITY',
        'issue': 84, 'logicalIds': 84, 'motionIds': 36, 'actorBankFrames': 12,
        'actorResourcesScale': 2, 'qualityAccepted': False, 'bulkGenerationAllowed': False,
        'imageProof': {'file': str(image_report.relative_to(ROOT)), 'sha256': digest(image_report)},
        'wrappers': wrappers})
    print(output)


if __name__ == '__main__':
    main()
