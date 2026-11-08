"""Map a generated complete rectangular UI track with unmodified sprite-gen primitives."""
import argparse
import json
from pathlib import Path

from PIL import Image
from sprite_gen.frames.extract import tighten_components
from sprite_gen.util.resample import resize_cell
from rebuild_common import digest, portable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--width', type=int, required=True)
    parser.add_argument('--height', type=int, required=True)
    args = parser.parse_args()
    image = Image.open(args.source).convert('RGBA')
    tight = tighten_components([image])[0]
    result = resize_cell(tight, (args.width, args.height))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output)
    report = {'route': 'upstream-tighten-components-resize-cell-full-rectangle',
              'source': portable(args.source), 'sourceSha256': digest(args.source),
              'output': portable(args.output), 'outputSha256': digest(args.output),
              'scriptSha256': digest(Path(__file__)),
              'operations': ['tighten_components:solid-alpha-bounds', 'resize_cell:full-rectangle'],
              'sourceCanvas': list(image.size), 'tightSourceCanvas': list(tight.size),
              'outputCanvas': list(result.size), 'outputBox': result.getbbox(),
              'geometry': 'Complete generated frame maps to the complete canvas; no standing-figure baseline or padding.'}
    args.output.with_suffix('.normalization.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
