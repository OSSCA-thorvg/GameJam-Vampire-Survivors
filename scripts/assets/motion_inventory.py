"""Closed issue84 inventory and durable restoration of approved pre-motion masters."""
from pathlib import Path
import argparse
import hashlib
import subprocess

from rebuild_common import ROOT, digest, read_json
from motion_sampling import SOURCE_STATES, NATIVE_STATES, FRAME_SELECTION
from motion_flying_contract import FLYING_STRATEGY
from motion_boss_contract import BOSS_STRATEGY

ACTORS = {'player.warden', 'player.ember', 'player.swift', 'player.aurelia',
          'enemy.bat', 'enemy.ghoul', 'enemy.skeleton', 'enemy.wisp', 'enemy.brute', 'enemy.wraith',
          'boss.reaper5', 'boss.reaper10', 'boss.death'}
WEAPONS = {'weapon.axe', 'weapon.bloodyTear', 'weapon.cross', 'weapon.deathSpiral', 'weapon.fireWand',
           'weapon.garlic', 'weapon.heavenSword', 'weapon.hellfire', 'weapon.holyWand', 'weapon.kingBible',
           'weapon.knife', 'weapon.magicWand', 'weapon.soulEater', 'weapon.thousandEdge',
           'weapon.unholyVespers', 'weapon.whip'}
EFFECTS = {'fx.hit', 'fx.enemyDeath', 'fx.levelUp', 'fx.chestOpen', 'fx.freeze', 'fx.warning'}
MOTION_IDS = ACTORS | WEAPONS | EFFECTS | {'stage.brazier'}
DEFAULT_MOTION_RECIPE = ROOT / 'docs/assets/motion-84.json'


def validate_inventory(recipe):
    ids = [asset['id'] for asset in recipe['assets']]
    if len(ids) != 36 or set(ids) != MOTION_IDS or set(recipe['motionIds']) != MOTION_IDS:
        raise ValueError('Motion inventory must cover all36 declared IDs exactly once, including brazier')
    logical, static = set(recipe['logicalIds']), set(recipe['staticIds'])
    diagnostic = recipe['diagnosticMaster']
    if (diagnostic['id'], diagnostic['file'], diagnostic['gitCommit']) != (
            'enemy.lottieTest', 'assets/enemies/lottie-test.json', '65cfedebd3b1969c84704432808cc948dcfc5a3e'):
        raise ValueError('Publication requires the pinned upstream shape-only diagnostic')
    if len(logical) != 85 or len(static) != 48 or logical != MOTION_IDS | static | {diagnostic['id']} or MOTION_IDS & static:
        raise ValueError('All85 IDs must partition into36 motion,48 static and1 diagnostic entry')
    if recipe['finalFormatCounts'] != {'lottie': 37, 'png': 47, 'ttf': 1}:
        raise ValueError('Final motion formats must preserve the closed85-ID scope')
    export = recipe['bankExport']
    if (export.get('sourcePoseCount') != 16 or export.get('nativePoseCount') != 12 or
            export.get('frameSelection') != FRAME_SELECTION):
        raise ValueError('Whole-bank export must retain16 source poses before fixed12-native sampling')
    if (export.get('strategy') != 'unmodified-upstream-canonical-row-common-then-whole-bank' or
            export.get('finalMotionPresenceThreshold') != .01 or export.get('perPoseBboxFit') is not False):
        raise ValueError('Motion requires official uniform state calibration and the unchanged final motion gate')
    flying = recipe.get('flyingExport', {})
    if (flying.get('strategy') != FLYING_STRATEGY or flying.get('registration', 'missing') is not None or
            flying.get('perPoseBboxFit') is not False or flying.get('footBaseline') is not False or
            flying.get('sourcePoseCount') != 16 or flying.get('nativePoseCount') != 12 or
            flying.get('frameSelection') != FRAME_SELECTION or flying.get('finalMotionPresenceThreshold') != .01):
        raise ValueError('Flying requires raw component coordinate ancestry with no per-pose or foot registration')
    from motion_direction_proof import validate_asset_direction
    for asset in recipe['assets']:
        validate_asset_direction(asset)
        if asset['id'].startswith('boss.') and (asset.get('profile') != 'boss' or asset.get('grounded') is not False):
            raise ValueError('Approved floating bosses require the isolated master-footprint camera profile')
        if asset['id'] == 'enemy.wraith' and (asset.get('grounded') is not True or asset.get('bodyPlan') != 'biped'):
            raise ValueError('Approved wrapped humanoid wraith requires the grounded biped source profile')
        if asset['id'] in ACTORS:
            if (asset['sourceStates'] != SOURCE_STATES or asset.get('nativeStates') != NATIVE_STATES or
                    asset.get('frameSelection') != FRAME_SELECTION):
                raise ValueError('Actor sources require8+8 poses with fixed full-cycle16-to12 temporal sampling')
        if asset['resourceScale'] != 2 or asset['resourceGrid'] != 1 or asset['paletteSize'] != 64:
            raise ValueError('Motion starts with2x resources, one-resource-pixel grid, shared64 palette')
        if 'gitCommit' not in asset['master'] or 'gitBlob' not in asset['master']:
            raise ValueError('Approved masters require durable Gitblob provenance')
    historical = ROOT / recipe['historicalReceipt']['file']
    if digest(historical) != recipe['historicalReceipt']['sha256']:
        raise ValueError('The historical issue76 receipt changed')


def restore_masters(recipe, output):
    reject_symlink_chain(output.absolute())
    output = output.resolve()
    output.relative_to(ROOT / 'verification')
    for asset in recipe['assets']:
        for master in [asset['master'], *asset['master'].get('resources', [])]:
            path = Path(master['file'])
            if path.is_absolute() or '..' in path.parts or path.parts[0] != 'assets':
                raise ValueError('Master paths must be canonical assets paths')
            reference = master['gitCommit'] + ':' + path.as_posix()
            blob = subprocess.check_output(['git', 'rev-parse', reference], cwd=ROOT, text=True).strip()
            if blob != master['gitBlob']:
                raise ValueError('Approved master Gitblob differs from the recorded source')
            data = subprocess.check_output(['git', 'show', reference], cwd=ROOT)
            if hashlib.sha256(data).hexdigest() != master['sha256']:
                raise ValueError('Approved master SHA256 differs from Gitblob bytes')
            target = output / path.relative_to('assets')
            verify_restore_target(output, target)
            target.parent.mkdir(parents=True, exist_ok=True)
            verify_restore_target(output, target)
            if target.exists() and digest(target) != master['sha256']:
                raise ValueError('Existing master differs; it was left untouched')
            if not target.exists():
                target.write_bytes(data)
            if digest(target) != master['sha256']:
                raise ValueError('Restored master SHA256 mismatch')


def reject_symlink_chain(path):
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink():
            raise ValueError('Master restoration forbids symlinked ancestors and targets')


def verify_restore_target(output, target):
    reject_symlink_chain(target)
    target.resolve().relative_to(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'restore-masters'])
    parser.add_argument('--recipe', type=Path, default=DEFAULT_MOTION_RECIPE)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    recipe = read_json(args.recipe)
    validate_inventory(recipe)
    if args.command == 'restore-masters':
        if not args.out:
            parser.error('restore-masters requires --out under verification/')
        restore_masters(recipe, args.out)
    print(f"85 logical IDs;36 motion;1 diagnostic;13 actors;47 static PNGs;protected font; phase={recipe['phase']}")


if __name__ == '__main__':
    main()
