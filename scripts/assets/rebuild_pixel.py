"""Explicit painted-source refinement through unmodified pinned sprite-gen primitives."""
from __future__ import annotations

from pathlib import Path
import subprocess

from rebuild_common import ROOT, digest, portable, read_json, validate_png, write_json
from rebuild_pixel_proof import measure
from rebuild_contract import evidence_paths


def refine(recipe: dict, asset: dict, source: Path, tool: Path, output: Path) -> Path:
    settings = recipe['export']['pixel']
    width, height = validate_png(source)
    if width % settings['physicalBlock'] or height % settings['physicalBlock']:
        raise ValueError('Pixel grid must divide the physical canvas exactly')
    # Keep the earlier automatic extraction attempts as truthful failure evidence.
    final_dir = output / 'painted'
    final_dir.mkdir(parents=True, exist_ok=True)
    script = ROOT / 'scripts/assets/refine_painted.py'
    request = {'source': portable(source), 'sourceSha256': digest(source),
               'route': settings['route'], 'physicalBlock': settings['physicalBlock'],
               'paletteSize': settings['paletteSize'], 'script': portable(script),
               'scriptSha256': digest(script)}
    rectangle = asset.get('normalization', {}).get('route') == 'upstream-full-rectangle'
    if rectangle:
        request['fullRectangle'] = True
    write_json(final_dir / 'request.json', request)
    with (final_dir / 'refine.log').open('w') as log:
        subprocess.run([str(tool.with_name('python')), str(script), '--source', str(source),
                        '--out-dir', str(final_dir), '--block', str(settings['physicalBlock']),
                        '--palette', str(settings['paletteSize']), *(['--full-rectangle'] if rectangle else [])],
                       check=True, stdout=log, stderr=subprocess.STDOUT)
    final = final_dir / 'frame-0.png'
    validate_png(final)
    proof = measure(source, final, tool, asset['id'] == 'stage.ground', hp_track=rectangle)
    write_json(final_dir / 'final-proof.json', proof)
    reports = evidence_paths(final, source, script, rectangle)
    write_json(output / 'processing.json', {
        'version': 2, 'route': settings['route'], 'inputLattice': None,
        'engineCommit': recipe['source']['commit'],
        'source': portable(source), 'sourceSha256': digest(source),
        'output': portable(final), 'outputSha256': digest(final),
        'physicalBlock': settings['physicalBlock'], 'paletteSize': settings['paletteSize'],
        'files': [{'role': role, 'file': portable(path), 'sha256': digest(path)} for role, path in reports.items()],
    })
    return final
