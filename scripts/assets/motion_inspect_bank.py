"""Read-only decoded-pixel proof for complete, shared-palette pose banks."""
import argparse
import json
from pathlib import Path
from PIL import Image
import numpy as np
from rebuild_common import ROOT, read_json


def inspect(bank_file):
    bank = read_json(bank_file)
    palette_file = ROOT / bank['sharedPalette']['file']
    palette = read_json(palette_file)
    colors = palette['colors']
    if palette.get('source') != 'motion84-shared-whole-bank' or not 1 <= len(colors) <= 64:
        raise ValueError('Expected the one upstream whole-bank palette')
    allowed = {tuple(color) for color in colors}
    measurements = []
    for frame in [*bank['sourceFrames'], *bank['frames']]:
        with Image.open(ROOT / frame['file']) as image:
            if image.mode != 'RGBA' or list(image.size) != frame['size']:
                raise ValueError('Invalid pose dimensions/mode')
            data = np.array(image)
        alpha = np.unique(data[:,:,3]).tolist()
        visible = data[:,:,3] > 0
        actual = {tuple(color) for color in np.unique(data[visible,:3], axis=0).tolist()}
        if alpha != [0, 255] or not actual or not actual <= allowed:
            raise ValueError('Pose alpha/colors differ from the shared bank contract')
        y,x = np.where(visible)
        box = [int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)]
        if box != frame['box'] or int(visible.sum()) != frame['nonzeroPixels']:
            raise ValueError('Saved pose measurements differ from actual PNGs')
        measurements.append({'state':frame['state'],'index':frame['index'],'box':box,'colors':len(actual)})
    return measurements


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.bank)))
