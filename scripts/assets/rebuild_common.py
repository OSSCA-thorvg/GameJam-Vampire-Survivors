"""Shared contracts for the issue 76 sprite-gen recipes; image operations stay upstream."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RECIPE = ROOT / 'docs/assets/rebuild-76.json'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recipe_digest(recipe: dict) -> str:
    return hashlib.sha256(json.dumps(recipe, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def portable(path: Path) -> str:
    """Receipts contain repository-relative paths, never a contributor's home directory."""
    return path.resolve().relative_to(ROOT).as_posix()


def validate_recipe(recipe: dict) -> None:
    assets = recipe['assets']
    ids = [asset['id'] for asset in assets]
    if len(ids) != 84 or len(set(ids)) != 84:
        raise ValueError('Recipe must cover the audited 82 IDs plus the two declared additions')
    preserved = [asset for asset in assets if asset['action'] == 'preserve']
    if len(preserved) != 1 or preserved[0]['id'] != 'font.hud':
        raise ValueError('Only the licensed HUD font is preserved')
    validate_additions(recipe)
    validate_hp_contract(recipe)
    targets = [item for job in recipe['jobs'] for item in job['targets']]
    expected = {asset['id'] for asset in assets if asset['action'] != 'preserve'}
    if len(targets) != 83 or set(targets) != expected:
        raise ValueError('Jobs must cover every one of the 83 targets exactly once')
    if len({job['id'] for job in recipe['jobs']}) != len(recipe['jobs']):
        raise ValueError('Generation job IDs must be unique')
    for job in recipe['jobs']:
        if job['grid'][0] * job['grid'][1] != len(job['targets']):
            raise ValueError(f"Grid/target mismatch: {job['id']}")
    for asset in assets:
        for key in ('originalFile', 'candidateFile') if asset['action'] != 'generate' else ('candidateFile',):
            path = Path(asset[key])
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Asset paths must stay relative to assets/')
        if asset['action'] != 'preserve':
            if max(asset['logicalSize']) * recipe['export']['scale'] > 2048:
                raise ValueError(f"Raster budget exceeded: {asset['id']}")


def validate_additions(recipe: dict) -> None:
    baseline = recipe['baselineIds']
    additions = recipe['additions']
    if len(baseline) != 82 or len(set(baseline)) != 82:
        raise ValueError('The original audited 82-ID baseline must remain intact')
    if set(additions) != {'player.aurelia', 'portrait.aurelia'} or len(additions) != 2:
        raise ValueError('Only the two explicitly approved Aurelia additions are in scope')
    assets = recipe['assets']
    if set(baseline) != {asset['id'] for asset in assets if asset['action'] != 'generate'}:
        raise ValueError('Baseline asset identities changed')
    if set(additions) != {asset['id'] for asset in assets if asset['action'] == 'generate'}:
        raise ValueError('New targets must be declared as additions')
    for asset in assets:
        if asset['action'] not in {'preserve', 'regenerate', 'generate'}:
            raise ValueError('Unknown asset action')
        if asset['action'] == 'generate' and any(key.startswith('original') for key in asset):
            raise ValueError('New artwork must not invent original files or hashes')


def validate_hp_contract(recipe: dict) -> None:
    hp = next(asset for asset in recipe['assets'] if asset['id'] == 'ui.hpBar')
    expected = {'route': 'upstream-full-rectangle', 'canvas': [160, 24],
                'nativeFillRect': [4, 4, 152, 16], 'inner': 'opaque-neutral-dark'}
    if hp['logicalSize'] != [40, 6] or any(hp.get('normalization', {}).get(key) != value for key, value in expected.items()):
        raise ValueError('HP track must preserve the latest-main empty-track/native-fill geometry contract')


def png_size(path: Path) -> tuple[int, int]:
    with path.open('rb') as handle:
        header = handle.read(33)
    if len(header) != 33 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
        raise ValueError(f'Not a PNG with IHDR: {path.name}')
    return struct.unpack('>II', header[16:24])


def validate_png(path: Path) -> tuple[int, int]:
    """Reject metadata, animation, corruption and images outside the runtime budget."""
    data = path.read_bytes()
    dimensions = png_size(path)
    if not min(dimensions) or max(dimensions) > 2048 or len(data) > 16 * 1024 * 1024:
        raise ValueError('PNG exceeds the runtime raster budget')
    if dimensions[0] * dimensions[1] * 4 > 16 * 1024 * 1024:
        raise ValueError('Decoded PNG exceeds the runtime raster budget')
    if data[24:29] != bytes([8, 6, 0, 0, 0]):
        raise ValueError('PNG must be noninterlaced 8-bit RGBA')
    offset, chunks = 8, []
    allowed = {b'IHDR', b'IDAT', b'IEND', b'sRGB', b'gAMA', b'cHRM', b'pHYs', b'sBIT'}
    while offset + 12 <= len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        end = offset + 12 + length
        kind = data[offset + 4:offset + 8]
        if end > len(data) or kind not in allowed:
            raise ValueError('PNG contains an unsupported or truncated chunk')
        crc = struct.unpack('>I', data[end - 4:end])[0]
        if zlib.crc32(data[offset + 4:end - 4]) != crc:
            raise ValueError('PNG chunk CRC is invalid')
        chunks.append(kind)
        offset = end
        if kind == b'IEND':
            break
    if offset != len(data) or chunks[0] != b'IHDR' or chunks[-1] != b'IEND' or b'IDAT' not in chunks:
        raise ValueError('PNG chunk sequence is incomplete')
    return dimensions


def checked_tool(tool_root: Path, recipe: dict) -> Path:
    revision = subprocess.check_output(['git', '-C', str(tool_root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != recipe['source']['commit']:
        raise ValueError('sprite-gen checkout does not match the pinned commit')
    subprocess.run(['git', '-C', str(tool_root), 'diff', '--quiet', 'HEAD', '--'], check=True)
    executable = tool_root / '.venv/bin/sprite-gen'
    if not executable.is_file():
        raise ValueError('Use the pinned tool virtualenv; run bootstrap first')
    return executable


def require_subscription() -> None:
    result = subprocess.run(['codex', 'login', 'status'], text=True, capture_output=True, timeout=20)
    if result.returncode or 'chatgpt' not in (result.stdout + result.stderr).lower():
        raise ValueError('ChatGPT subscription login required; no API/provider fallback was attempted')


def run_tool(tool: Path, arguments: list[str], log: Path) -> None:
    log.parent.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment['SPRITE_GEN_CONFIG_DIR'] = str(log.parent / 'preferences')
    environment['SPRITE_GEN_CODEX_UNAVAILABLE'] = 'ask'
    with log.open('w') as output:
        subprocess.run([str(tool), *arguments], check=True, env=environment, stdout=output, stderr=subprocess.STDOUT)


def generation_source(image: Path, report_path: Path) -> dict:
    report = read_json(report_path)
    extra = report.get('extra', {})
    if report.get('provider') != 'codex' or extra.get('auth_source') != 'codex-login':
        raise ValueError('Generation receipt requires the explicitly selected ChatGPT subscription provider')
    if report.get('provider_resolved_from') != 'explicit' or not extra.get('inline_results'):
        raise ValueError('Missing explicit provider or actual generation result')
    if Path(report['out']).resolve() != image.resolve():
        raise ValueError('Provider report does not name this generated source image')
    png_size(image)
    return {
        'provider': 'codex', 'auth': 'ChatGPT subscription',
        'sourceFile': portable(image), 'sourceSha256': digest(image),
        'reportFile': portable(report_path), 'reportSha256': digest(report_path),
        'promptSha256': hashlib.sha256(report['prompt'].encode()).hexdigest(),
        'sessionId': report['session_id'],
        'references': [{'file': portable(Path(reference)), 'sha256': digest(Path(reference))}
                       for reference in report.get('refs', [])],
    }


def slice_command(image: Path, output: Path, ids: list[str], grid: list[int], width: int,
                  height: int, baseline: float, target_height: float, alpha_floor: int) -> list[str]:
    return ['slice-sheet', '--sheet', str(image), '--out-dir', str(output), '--chroma-key', 'none',
            '--alpha-floor', str(alpha_floor), '--grid', f'{grid[0]}x{grid[1]}',
            '--names', ','.join(item.replace('.', '-') for item in ids),
            '--cell-width', str(width), '--cell-height', str(height),
            '--baseline-y', str(baseline), '--target-height', str(target_height), '--fit', 'contain']


def validate_slice(output: Path, expected: list[str]) -> dict:
    report = read_json(output / 'slice-sheet.json')
    cells = report['cells']
    if [cell['name'] for cell in cells] != [item.replace('.', '-') for item in expected]:
        raise ValueError('Slice reading-order mapping differs from recipe')
    if any(cell['clipped_px'] != 0 or not cell['parts'] for cell in cells):
        raise ValueError('An extracted cell is clipped or empty; regenerate or adjust upstream options')
    return report


def bootstrap(tool_root: Path, recipe: dict) -> None:
    tool_root = tool_root.resolve()
    # Tool checkouts and environments live only in already ignored verification evidence.
    tool_root.relative_to(ROOT / 'verification')
    if not tool_root.exists():
        tool_root.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '--no-checkout', recipe['source']['repository'], str(tool_root)], check=True)
        subprocess.run(['git', '-C', str(tool_root), 'checkout', '--detach', recipe['source']['commit']], check=True)
    revision = subprocess.check_output(['git', '-C', str(tool_root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != recipe['source']['commit']:
        raise ValueError('Existing checkout is another revision; it was left untouched')
    subprocess.run(['git', '-C', str(tool_root), 'diff', '--quiet', 'HEAD', '--'], check=True)
    venv = tool_root / '.venv'
    if not venv.exists():
        subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
    python = venv / 'bin/python'
    pins = [f'{name}=={version}' for name, version in recipe['source']['dependencies'].items()]
    subprocess.run([str(python), '-m', 'pip', 'install', *pins, '-e', str(tool_root)], check=True)
    checked_tool(tool_root, recipe)
