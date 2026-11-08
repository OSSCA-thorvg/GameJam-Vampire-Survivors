"""Verify the complete painted-source chain against actual candidate bytes."""
from pathlib import Path

import rebuild_common as common
from rebuild_common import checked_tool, digest, portable, read_json, validate_png
from rebuild_contract import FULL_RECTANGLE_OPERATIONS, PAINTED_INPUT, PAINTED_OPERATIONS, PAINTED_ROUTE, evidence_paths
from rebuild_pixel_proof import measure


def owned_path(value: str) -> Path:
    path = (common.ROOT / value).resolve()
    path.relative_to(common.ROOT / 'verification')
    if value != portable(path):
        raise ValueError('Processing evidence paths must be repository-relative')
    return path


def locations(entry: dict, recipe: dict) -> tuple[Path, Path, Path]:
    final = owned_path(entry['file'])
    asset = next(asset for asset in recipe['assets'] if asset['id'] == entry['id'])
    jobs = [job for job in recipe['jobs'] if job['id'] == entry['job'] and entry['id'] in job['targets']]
    if len(jobs) != 1:
        raise ValueError('Candidate job/target mapping differs from recipe')
    identifier = entry['id'].replace('.', '-')
    if (final.name != 'frame-0.png' or final.parent.name != 'painted' or
            final.parents[1].name != identifier or final.parents[2].name != 'pixel' or
            final.parents[3].name != entry['job']):
        raise ValueError('Candidate does not occupy its canonical job/pixel path')
    job_dir = final.parents[3]
    if entry['id'] == 'stage.ground':
        source = job_dir / 'stage-ground.png'
    else:
        route = asset.get('normalization', {}).get('route')
        name = ('composite.png' if route == 'upstream-fit-to-cell-composite' else
                'full-rectangle.png' if route == 'upstream-full-rectangle' else identifier + '.png')
        source = job_dir / 'normalized' / identifier / name
    return final, source, final.parents[1] / 'processing.json'


def validate_processing(entry: dict, recipe: dict) -> None:
    settings = recipe['export'].get('pixel', {})
    if not settings.get('enabled'):
        raise ValueError('Final candidates require painted-source pixel refinement')
    final, source, report_path = locations(entry, recipe)
    processing = entry.get('processing')
    if not processing or processing.get('file') != portable(report_path):
        raise ValueError('The canonical final pixel processing report is missing')
    if digest(report_path) != processing.get('sha256'):
        raise ValueError('Pixel processing report hash changed')
    report = read_json(report_path)
    validate_settings(report, settings, recipe)
    if (report.get('source') != portable(source) or report.get('sourceSha256') != digest(source) or
            report.get('output') != portable(final) or report.get('outputSha256') != digest(final) or
            entry['sha256'] != digest(final)):
        raise ValueError('Processing inputs/output are not bound to the actual candidate')
    script = common.ROOT / 'scripts/assets/refine_painted.py'
    rectangle = entry['id'] == 'ui.hpBar'
    paths = evidence_paths(final, source, script, rectangle)
    validate_evidence(report, paths)
    if rectangle:
        validate_normalization(paths, entry, source)
    validate_request(paths['request'], source, script, settings, rectangle)
    tool = checked_tool(common.ROOT / 'verification/issue-76/tool/sprite-gen', recipe)
    validate_png(source)
    dimensions = tuple(value * recipe['export']['scale'] for value in entry['logicalSize'])
    if validate_png(final) != dimensions:
        raise ValueError('Actual processing output has the wrong physical dimensions')
    actual = measure(source, final, tool, entry['id'] == 'stage.ground', hp_track=rectangle)
    if (actual['size'] != list(dimensions) or actual['mode'] != 'RGBA' or
            actual['grid'] != {'physicalPitch': settings['physicalBlock'], 'phase': [0, 0], 'uniformFraction': 1.0} or
            actual['visibleColors'] > settings['paletteSize']):
        raise ValueError('Actual final pixel measurements violate the recipe')
    if read_json(paths['finalProof']) != actual:
        raise ValueError('Saved final pixel proof differs from actual PNG measurements')
    validate_operations(read_json(paths['operations']), actual, settings, rectangle)
    validate_palette(read_json(paths['palette']), actual, settings)


def validate_normalization(paths: dict, entry: dict, source: Path) -> None:
    report = read_json(paths['normalization'])
    expected = {'route': 'upstream-tighten-components-resize-cell-full-rectangle',
                'operations': ['tighten_components:solid-alpha-bounds', 'resize_cell:full-rectangle'],
                'source': entry['source']['sourceFile'], 'sourceSha256': entry['source']['sourceSha256'],
                'output': portable(source), 'outputSha256': digest(source),
                'scriptSha256': digest(paths['normalizationScript']), 'outputCanvas': [160, 24]}
    if any(report.get(key) != value for key, value in expected.items()):
        raise ValueError('HP normalization must map the complete generated frame through the pinned rectangle route')


def validate_settings(report: dict, settings: dict, recipe: dict) -> None:
    expected = {'version': 2, 'route': PAINTED_ROUTE, 'inputLattice': None,
                'engineCommit': recipe['source']['commit'],
                'physicalBlock': settings['physicalBlock'], 'paletteSize': settings['paletteSize']}
    if settings['route'] != PAINTED_ROUTE or any(key not in report or report[key] != value for key, value in expected.items()):
        raise ValueError('Processing route/settings differ from the pinned final recipe')


def validate_evidence(report: dict, paths: dict) -> None:
    files = report.get('files')
    if not isinstance(files, list) or len(files) != len(paths):
        raise ValueError('Processing report must contain every mandatory evidence role')
    roles = [item.get('role') for item in files]
    if len(set(roles)) != len(roles) or set(roles) != set(paths):
        raise ValueError('Processing evidence roles are missing, duplicate or unsupported')
    for item in files:
        expected = paths[item['role']]
        if item.get('file') != portable(expected) or item.get('sha256') != digest(expected):
            raise ValueError('Mandatory processing evidence path or hash changed')


def validate_request(path: Path, source: Path, script: Path, settings: dict, rectangle: bool = False) -> None:
    expected = {'source': portable(source), 'sourceSha256': digest(source),
                'route': settings['route'], 'physicalBlock': settings['physicalBlock'],
                'paletteSize': settings['paletteSize'], 'script': portable(script),
                'scriptSha256': digest(script)}
    if rectangle:
        expected['fullRectangle'] = True
    if read_json(path) != expected:
        raise ValueError('Painted-source request/script is not the reviewed exporter invocation')


def validate_operations(report: dict, proof: dict, settings: dict, rectangle: bool = False) -> None:
    expected = {'route': PAINTED_ROUTE, 'inputLattice': None, 'inputKind': PAINTED_INPUT,
                'operations': FULL_RECTANGLE_OPERATIONS if rectangle else PAINTED_OPERATIONS,
                'physicalBlock': settings['physicalBlock'],
                'paletteSize': settings['paletteSize'], 'sourceBox': proof['sourceCanvasBox'],
                'finalBox': proof['box']}
    box, block = proof['sourceCanvasBox'], settings['physicalBlock']
    expected['paintedFootprintLogicalCap'] = [max(1, (box[i + 2] - box[i]) // block) for i in (0, 1)]
    if any(key not in report or report[key] != value for key, value in expected.items()):
        raise ValueError('Painted-source operations or measured geometry differ from the recipe')


def validate_palette(report: dict, proof: dict, settings: dict) -> None:
    colors = report.get('colors')
    if (report.get('kind') != 'sprite-gen-palette-lock' or report.get('source') != 'explicit-painted-source-kcentroid' or
            not isinstance(colors, list) or not 1 <= len(colors) <= settings['paletteSize']):
        raise ValueError('The pinned painted-source palette is missing or invalid')
    if any(not isinstance(color, list) or len(color) != 3 or
           any(type(value) is not int or not 0 <= value <= 255 for value in color) for color in colors):
        raise ValueError('Pinned palette colors must be RGB bytes')
    if not {tuple(color) for color in proof['visiblePalette']} <= {tuple(color) for color in colors}:
        raise ValueError('Actual candidate colors are outside the recorded upstream palette')
