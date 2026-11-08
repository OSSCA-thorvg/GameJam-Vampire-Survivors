#!/usr/bin/env python3
"""Replayable sprite-gen commands; never generate or approve art implicitly."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

from rebuild_common import (DEFAULT_RECIPE, ROOT, bootstrap, checked_tool, digest, generation_source,
                            read_json, require_subscription, run_tool, validate_recipe, write_json)
from rebuild_export import approve, export_job
from rebuild_receipt import assemble


def load_recipe(path: Path) -> dict:
    recipe = read_json(path)
    validate_recipe(recipe)
    return recipe


def find_job(recipe: dict, identifier: str) -> dict:
    return next(job for job in recipe['jobs'] if job['id'] == identifier)


def make_prompt(recipe: dict, job: dict) -> str:
    if job.get('promptFile'):
        path = ROOT / job['promptFile']
        if job.get('promptSha256') and digest(path) != job['promptSha256']:
            raise ValueError('Tracked identity prompt changed without updating its recipe digest')
        return path.read_text()
    assets = {asset['id']: asset for asset in recipe['assets']}
    lines = [recipe['stylePrompt']]
    if len(job['targets']) > 1:
        lines.append(f"Make exactly {len(job['targets'])} independent game assets in a separated {job['grid'][0]}-column by {job['grid'][1]}-row board, in the following reading order:")
    else:
        lines.append('Make one complete isolated original game illustration:')
    lines += [f"{number}. {identifier}: {assets[identifier]['description']}" for number, identifier in enumerate(job['targets'], 1)]
    lines += ['Use generous transparent padding and gutters. Keep every silhouette and glow wholly inside its cell; no source-edge cropping.',
              'No words, labels, letters, numbers, grid lines, watermark, floor or scene. No drawn white/checkerboard background. True PNG alpha.',
              'The attached reference defines consistent painted materials and style; retain the requested subjects rather than drawing the reference character.']
    return '\n'.join(lines) + '\n'


def generate(recipe: dict, job: dict, tool: Path, run: Path, style: Path,
             references: list[Path], prompt_file: Path | None) -> tuple[Path, Path]:
    run.resolve().relative_to(ROOT / 'verification')
    for reference in [style, *references]:
        reference.resolve().relative_to(ROOT / 'verification')
    require_subscription()
    directory = run / job['id']
    directory.mkdir(parents=True, exist_ok=True)
    prompt = prompt_file.read_text() if prompt_file else make_prompt(recipe, job)
    inputs = {'tool': recipe['source'], 'job': job, 'prompt': prompt,
              'refs': [digest(path) for path in [style, *references]]}
    fingerprint = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    saved = directory / 'request.json'
    image, report = directory / 'board.png', directory / 'generation.report.json'
    if saved.exists():
        state = read_json(saved)
        if state['fingerprint'] != fingerprint:
            raise ValueError('Request changed: choose a fresh run directory rather than reuse stale images')
        if state.get('completed'):
            if digest(image) != state['imageSha256'] or digest(report) != state['reportSha256']:
                raise ValueError('Cached generation was modified')
            return image, report
    (directory / 'prompt.txt').write_text(prompt)
    write_json(saved, {'fingerprint': fingerprint, 'completed': False})
    arguments = ['gen', '--provider', 'codex', '--transparent', '--alpha-mode', 'native',
                 '--prompt-file', str(directory / 'prompt.txt'), '--out', str(image), '--report', str(report)]
    for reference in [style, *references]:
        arguments += ['--ref', str(reference)]
    run_tool(tool, arguments, directory / 'generation.log')
    generation_source(image, report)
    write_json(saved, {'fingerprint': fingerprint, 'completed': True,
                       'imageSha256': digest(image), 'reportSha256': digest(report)})
    return image, report


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('--recipe', type=Path, default=DEFAULT_RECIPE)
    commands = result.add_subparsers(dest='command', required=True)
    commands.add_parser('plan')
    setup = commands.add_parser('bootstrap')
    setup.add_argument('--tool-root', type=Path, required=True)
    for name in ('run', 'export'):
        command = commands.add_parser(name)
        command.add_argument('--tool-root', type=Path, required=True)
        command.add_argument('--run-dir', type=Path, required=True)
        command.add_argument('--job', required=True)
        if name == 'run':
            command.add_argument('--style-ref', type=Path, required=True)
            command.add_argument('--ref', type=Path, action='append', default=[])
            command.add_argument('--prompt-file', type=Path)
            command.add_argument('--confirmed-subscription', action='store_true', required=True)
        else:
            command.add_argument('--image', type=Path, required=True)
            command.add_argument('--report', type=Path, required=True)
    review = commands.add_parser('approve')
    review.add_argument('--candidate-receipt', type=Path, required=True)
    review.add_argument('--notes', required=True)
    receipt = commands.add_parser('receipt')
    receipt.add_argument('--run-dir', type=Path, action='append', required=True)
    receipt.add_argument('--out', type=Path, required=True)
    receipt.add_argument('--require-approved', action='store_true')
    receipt.add_argument('--final-assets', action='store_true')
    return result


def main() -> None:
    args = parser().parse_args()
    recipe = load_recipe(args.recipe)
    if args.command == 'plan':
        print(json.dumps({'ids': len(recipe['assets']), 'targets': 83, 'baselineIds': 82,
                          'regenerated': 81, 'generated': 2, 'preserved': ['font.hud'],
                          'jobs': [{'id': job['id'], 'producer': job['producer'], 'targets': job['targets']} for job in recipe['jobs']]}, indent=2))
    elif args.command == 'bootstrap':
        bootstrap(args.tool_root, recipe)
    elif args.command == 'approve':
        approve(args.candidate_receipt, args.notes)
    elif args.command == 'receipt':
        write_json(args.out, assemble(recipe, args.run_dir, args.require_approved, args.final_assets))
    else:
        job = find_job(recipe, args.job)
        tool = checked_tool(args.tool_root, recipe)
        if args.command == 'run':
            image, report = generate(recipe, job, tool, args.run_dir, args.style_ref, args.ref, args.prompt_file)
        else:
            image, report = args.image, args.report
        candidate = export_job(recipe, job, tool, args.run_dir, image, report)
        print(json.dumps({'job': job['id'], 'candidates': [entry['id'] for entry in candidate['entries']]}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, StopIteration) as error:
        print(f'asset rebuild refused: {error}', file=sys.stderr)
        raise SystemExit(1) from error
