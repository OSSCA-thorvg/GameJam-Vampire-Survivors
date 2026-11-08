"""Run with the pinned sprite-gen virtualenv: explicit painted-source pixel refinement."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image
from sprite_gen.curate.curation import apply_transform
from sprite_gen.frames.extract import (apply_palette, binarize_alpha, build_shared_palette,
                                      conform_row_logical, fit_pixel_unfake, write_pinned_palette)
from sprite_gen.util.resample import resize_cell
from rebuild_contract import FULL_RECTANGLE_OPERATIONS, PAINTED_INPUT, PAINTED_OPERATIONS, PAINTED_ROUTE


def refine(source: Path, output: Path, block: int, palette_size: int, full_rectangle: bool = False) -> dict:
    image = Image.open(source).convert('RGBA')
    width, height = image.size
    target = image.getbbox()
    if not target or width % block or height % block:
        raise ValueError('A nonempty canvas divisible by the pixel block is required')
    cap = [max(1, (target[2] - target[0]) // block), max(1, (target[3] - target[1]) // block)]
    if full_rectangle:
        cap = [width // block, height // block]
        logical = resize_cell(image, tuple(cap)).copy()
    else:
        logical = conform_row_logical([image], cap[0], cap[1], True)[0]
    logical = binarize_alpha(logical)
    palette = build_shared_palette([logical], palette_size)
    logical = apply_palette(logical, palette)
    output.mkdir(parents=True, exist_ok=True)
    write_pinned_palette(output, palette, 'explicit-painted-source-kcentroid')
    fitted = fit_pixel_unfake(logical, width, height, 0, 0, block,
                              {'align_x': 'alpha-centroid', 'align_y': 'bottom'})
    box = fitted.getbbox()
    scale = min((target[2] - target[0]) / (box[2] - box[0]),
                (target[3] - target[1]) / (box[3] - box[1]), 1.0)
    dx = (target[0] + target[2]) / 2 - (width / 2 + ((box[0] + box[2]) / 2 - width / 2) * scale)
    dy = target[3] - (height / 2 + (box[3] - height / 2) * scale)
    transform = {'scale': scale, 'rotate': 0, 'dx': dx, 'dy': dy}
    final = apply_transform(fitted, transform, (width, height), snap_scale=block)
    final.save(output / 'frame-0.png')
    return {'route': PAINTED_ROUTE, 'inputLattice': None,
            'inputKind': PAINTED_INPUT,
            'operations': FULL_RECTANGLE_OPERATIONS if full_rectangle else PAINTED_OPERATIONS,
            'physicalBlock': block, 'paletteSize': palette_size, 'sourceBox': list(target),
            'paintedFootprintLogicalCap': cap,
            'fittedBox': list(box), 'transform': transform, 'finalBox': list(final.getbbox()),
            'warnings': ['Automatic input pitch detection is intentionally not used for painted inputs.']}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--block', type=int, default=2)
    parser.add_argument('--palette', type=int, default=64)
    parser.add_argument('--full-rectangle', action='store_true')
    args = parser.parse_args()
    report = refine(args.source, args.out_dir, args.block, args.palette, args.full_rectangle)
    (args.out_dir / 'painted-source.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
