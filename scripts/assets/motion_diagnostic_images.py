"""Pinned sprite-gen nearest resampling for explicitly non-gait GPU diagnostics."""
import argparse
from pathlib import Path
from PIL import Image
from sprite_gen.curate.curation import apply_transform
from rebuild_common import ROOT, digest, read_json, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    records = []
    for asset in read_json(args.recipe)['assets']:
        if asset['id'] in ['fx.levelUp', 'fx.chestOpen']:
            continue
        master = ROOT / asset['master']['archive']
        if digest(master) != asset['master']['sha256']:
            raise ValueError('Approved diagnostic master changed')
        size = tuple(value * 2 for value in asset['logicalSize'])
        image = Image.open(master).convert('RGBA')
        if image.size != tuple(value * 4 for value in asset['logicalSize']):
            raise ValueError('Diagnostic source must be the approved4x canvas')
        result = apply_transform(image, {'scale': .5}, size, snap_scale=1)
        stem = Path(asset['outputFile']).with_suffix('')
        count = 12 if asset['kind'] == 'actor' else 4 if asset['kind'] == 'stage' else 1
        for index in range(count):
            path = args.assets / stem / f'pose-{index}.png'
            path.parent.mkdir(parents=True, exist_ok=True)
            result.save(path)
            records.append({'id': asset['id'], 'pose': index, 'file': str(path.relative_to(ROOT)),
                'sha256': digest(path), 'physicalSize': list(size), 'masterSha256': digest(master),
                'kind': 'diagnostic-approved-still-reuse-NOT-generated-motion',
                'operation': 'upstream apply_transform scale0.5 NEAREST; no bbox fit'})
    write_json(args.report, {'issue': 84, 'kind': 'diagnostic-only-not-motion-acceptance', 'resources': records})


if __name__ == '__main__':
    main()
