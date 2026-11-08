"""Canonical upstream extraction/export and explicit candidate approvals."""
from __future__ import annotations

from pathlib import Path
import json
import subprocess

from rebuild_common import (ROOT, digest, generation_source, portable, read_json, recipe_digest,
                            run_tool, slice_command, validate_png, validate_slice, write_json)
from rebuild_pixel import refine


def export_job(recipe: dict, job: dict, tool: Path, run: Path, image: Path, report: Path) -> dict:
    source = generation_source(image, report)
    assets = {asset['id']: asset for asset in recipe['assets']}
    output = run / job['id']
    output.mkdir(parents=True, exist_ok=True)
    if job['targets'] == ['stage.ground']:
        paths = {'stage.ground': export_tile(tool, image, output)}
    else:
        paths = export_slices(recipe, job, tool, image, output, assets)
    entries = []
    for identifier, path in paths.items():
        asset = assets[identifier]
        processing = None
        if recipe['export'].get('pixel', {}).get('enabled'):
            path = refine(recipe, asset, path, tool, output / 'pixel' / identifier.replace('.', '-'))
            report_path = path.parent.parent / 'processing.json'
            processing = {'file': portable(report_path), 'sha256': digest(report_path)}
        expected = tuple(value * recipe['export']['scale'] for value in asset['logicalSize'])
        if validate_png(path) != expected:
            raise ValueError(f'Export canvas does not match 4x logical size: {identifier}')
        entries.append({
            'id': identifier, 'candidateFile': asset['candidateFile'],
            'action': 'generated' if asset['action'] == 'generate' else 'regenerated',
            'file': portable(path), 'sha256': digest(path), 'physicalSize': list(expected),
            'logicalSize': asset['logicalSize'], 'anchor': asset['anchor'],
            'integration': asset['kind'], 'job': job['id'], 'source': source,
            'recipeSha256': recipe_digest(recipe),
            'processing': processing,
            'tool': recipe['source'], 'qa': {'approved': False},
        })
    result = {'version': 1, 'issue': 76, 'job': job['id'], 'entries': entries}
    write_json(output / 'candidates.json', result)
    return result


def export_slices(recipe: dict, job: dict, tool: Path, image: Path, output: Path, assets: dict) -> dict:
    settings = recipe['export']
    base = output / 'extracted'
    if len(job['targets']) > 1:
        arguments = slice_command(image, base, job['targets'], job['grid'], 512, 512, 460.8, 409.6, settings['alphaFloor'])
        run_tool(tool, arguments, output / 'extract.log')
        validate_slice(base, job['targets'])
    paths = {}
    for identifier in job['targets']:
        asset = assets[identifier]
        source = base / (identifier.replace('.', '-') + '.png') if len(job['targets']) > 1 else image
        width, height = [value * settings['scale'] for value in asset['logicalSize']]
        rules = asset.get('normalization', {})
        player = asset['category'] == 'player'
        baseline = rules.get('baselineRatio', 0.9)
        target = rules.get('targetHeightRatio', 0.85 if player else 0.8)
        floor = rules.get('alphaFloor', settings['alphaFloor'])
        target_dir = output / 'normalized' / identifier.replace('.', '-')
        if rules.get('route') == 'upstream-full-rectangle':
            paths[identifier] = normalize_rectangle(tool, source, target_dir, width, height)
            continue
        if rules.get('route') == 'upstream-fit-to-cell-composite':
            paths[identifier] = normalize_composite(tool, source, target_dir, width, height, rules)
            continue
        arguments = slice_command(source, target_dir, [identifier], [1, 1], width, height,
                                  height * baseline, height * target, floor)
        run_tool(tool, arguments, output / f'{identifier}.normalize.log')
        validate_slice(target_dir, [identifier])
        paths[identifier] = target_dir / (identifier.replace('.', '-') + '.png')
    return paths


def normalize_rectangle(tool: Path, source: Path, output: Path, width: int, height: int) -> Path:
    target = output / 'full-rectangle.png'
    subprocess.run([str(tool.with_name('python')), str(ROOT / 'scripts/assets/normalize_full_rectangle.py'),
                    '--source', str(source), '--output', str(target), '--width', str(width), '--height', str(height)], check=True)
    return target


def normalize_composite(tool: Path, source: Path, output: Path, width: int, height: int, rules: dict) -> Path:
    output.mkdir(parents=True, exist_ok=True)
    target = output / 'composite.png'
    code = ('import json,sys; from PIL import Image; '
            'from sprite_gen.frames.extract import fit_to_cell; '
            'a=Image.open(sys.argv[1]).convert("RGBA"); w,h,mx,my=map(int,sys.argv[3:]); '
            'b=fit_to_cell(a,w,h,mx,my,{"resample":"lanczos","align_x":"bbox-center","align_y":"center"}); '
            'b.save(sys.argv[2]); print(json.dumps({"route":"upstream-fit-to-cell-composite",'
            '"sourceBox":a.getbbox(),"box":b.getbbox(),"canvas":[w,h],'
            '"containment":"upstream fit_scale contains the complete union bbox; no measured clipping counter"}))')
    result = subprocess.run([str(tool.with_name('python')), '-c', code, str(source), str(target),
                             str(width), str(height), str(round(width * rules['marginRatioX'])),
                             str(round(height * rules['marginRatioY']))], text=True, capture_output=True, check=True)
    write_json(output / 'composite-normalization.json', json.loads(result.stdout))
    return target


def export_tile(tool: Path, source: Path, output: Path) -> Path:
    horizontal = output / 'ground-x.png'
    final = output / 'stage-ground.png'
    for axis, origin, target in [('x', source, horizontal), ('y', horizontal, final)]:
        run_tool(tool, ['background-tile', '--source', str(origin), '--axis', axis,
                        '--period', '512', '--overlap', '32', '--out', str(target)], output / f'tile-{axis}.log')
    return final


def approve(path: Path, notes: str) -> None:
    if not notes.strip():
        raise ValueError('Visual review notes are required')
    result = read_json(path)
    for entry in result['entries']:
        if digest(ROOT / entry['file']) != entry['sha256']:
            raise ValueError('Candidate changed after export; regenerate its receipt before review')
        entry['qa'] = {'approved': True, 'review': notes.strip(), 'reviewedSha256': entry['sha256']}
    write_json(path, result)
