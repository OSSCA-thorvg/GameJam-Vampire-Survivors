"""Review preflight and receipt sealing after root explicitly installs the reviewed asset pack."""
import json
from pathlib import Path
import shutil
import subprocess

from motion_publish_sources import approved_sources, verify_preserved
from motion_publish_verify import verify_receipt
from motion_inventory import reject_symlink_chain
from rebuild_common import ROOT, checked_tool, read_json, write_json


def review_preflight(directory, tool, node='node', actual_assets=None):
    directory = directory.resolve(); directory.relative_to(ROOT / 'verification'); reject_symlink_chain(directory)
    recipe = read_json(directory / 'publication-recipe.json')
    tool = checked_tool(tool.resolve().parents[2], {'source': recipe['tool']})
    sources = approved_sources(read_json(directory / 'source-map.json'), recipe, tool)
    assets = actual_assets or directory / 'assets'
    graph = json.loads(subprocess.check_output([node, '--import', 'tsx', str(ROOT / 'scripts/assets/motion_publish_graph.ts'),
        str(assets), str(directory / 'publication-recipe.json')], cwd=ROOT, text=True))
    receipt = read_json(directory / 'motion-84.receipt.json')
    verify_receipt(receipt, graph, directory / 'source-archive', recipe, assets); verify_preserved(recipe, assets)
    for id, source in sources.items():
        if receipt['assets'][id]['bankSha256'] != source['sha256']:
            raise ValueError('Current approved source changed after staging; rebuild and review the new pack')
    return receipt


def seal_installed(directory, tool, node='node'):
    # No asset writes: this succeeds only AFTER root explicitly installs the exact reviewed pack.
    receipt = review_preflight(directory, tool, node, ROOT / 'assets')
    source = directory / 'source-archive'; target = ROOT / 'docs/assets/motion-source-archive84'
    reject_symlink_chain(target)
    if target.exists():
        for path in target.rglob('*'):
            if path.is_symlink(): raise ValueError('Installed source archive forbids symlinks')
    shutil.copytree(source, target, dirs_exist_ok=True)
    receipt['phase'] = 'installed-exact-graph-verified'
    output = ROOT / 'docs/assets/motion-84.receipt.json'; write_json(output, receipt)
    subprocess.run([node, str(ROOT / 'node_modules/prettier/bin/prettier.cjs'), '--write', str(output)], check=True, cwd=ROOT)
    return receipt
