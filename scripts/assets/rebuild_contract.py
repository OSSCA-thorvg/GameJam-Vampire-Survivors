"""Fixed operations and evidence roles for the reviewed painted-source exporter."""

PAINTED_ROUTE = 'pinned-upstream-primitives-painted-source'
PAINTED_OPERATIONS = [
    'conform_row_logical:kcentroid', 'binarize_alpha', 'build_shared_palette',
    'apply_palette', 'fit_pixel_unfake:integer-nearest',
    'apply_transform:nearest-and-cell-grid-quantization',
]
PAINTED_INPUT = 'normalized painted illustration; no implied pixel lattice measured'
FULL_RECTANGLE_OPERATIONS = ['resize_cell:full-rectangle-logical-grid', *PAINTED_OPERATIONS[1:]]


def evidence_paths(final, normalized, script, full_rectangle=False):
    paths = {'paintedInput': normalized, 'request': final.parent / 'request.json',
            'script': script, 'operations': final.parent / 'painted-source.json',
            'palette': final.parent / 'palette.lock.json', 'finalProof': final.parent / 'final-proof.json'}
    if full_rectangle:
        paths.update(normalization=normalized.with_suffix('.normalization.json'),
                     normalizationScript=script.with_name('normalize_full_rectangle.py'))
    return paths
