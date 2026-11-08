"""Approved Gitblob still→2x resources using the pinned upstream NEAREST transform."""
import argparse
import hashlib
import io
from pathlib import Path
import subprocess

from PIL import Image
from sprite_gen.curate.curation import apply_transform
from rebuild_common import ROOT, read_json, write_json, digest, portable
from motion_inventory import WEAPONS
from motion_publish_rotation import rotation_envelope, fitted_document


def derive(recipe, output):
    records = []
    ids = WEAPONS | {'fx.hit', 'fx.enemyDeath', 'fx.freeze', 'fx.warning'}
    for asset in recipe['assets']:
        if asset['id'] not in ids: continue
        master = asset['master']; reference = master['gitCommit'] + ':' + master['gitPath']
        if subprocess.check_output(['git', 'rev-parse', reference], cwd=ROOT, text=True).strip() != master['gitBlob']:
            raise ValueError('Approved master Gitblob identity changed')
        data = subprocess.check_output(['git', 'show', reference], cwd=ROOT)
        if hashlib.sha256(data).hexdigest() != master['sha256']: raise ValueError('Approved master bytes changed')
        with Image.open(io.BytesIO(data)) as source:
            if source.size != tuple(value * 4 for value in asset['logicalSize']): raise ValueError('Master must be4x logical canvas')
            image = apply_transform(source.convert('RGBA'), {'scale': .5}, tuple(value * 2 for value in asset['logicalSize']), snap_scale=1)
        path = output / Path(asset['outputFile']).with_suffix('') / 'pose-0.png'
        path.parent.mkdir(parents=True, exist_ok=True); image.save(path)
        records.append({'id': asset['id'], 'file': path.relative_to(output).as_posix(), 'sha256': digest(path),
                        'master': master, 'operation': 'unmodified upstream apply_transform scale0.5 NEAREST; full canvas; no bbox fit',
                        'rotationEnvelope': rotation_envelope(image, asset['logicalSize']) if asset['runtime']['preset'] == 'centered-native-rotation' else None})
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True); parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True); parser.add_argument('--emit-json', action='store_true'); args = parser.parse_args()
    recipe = read_json(args.recipe); records = derive(recipe, args.assets)
    if args.emit_json:
        from motion_lottie import flat_document
        for record in records:
            asset = next(a for a in recipe['assets'] if a['id'] == record['id'])
            write_json(args.assets / asset['outputFile'], fitted_document(flat_document(asset), record))
    write_json(args.report, {'resources': records})
