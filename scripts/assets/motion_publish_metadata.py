"""Closed catalog semantic overlay; no source art, geometry, format or mass metadata adoption."""
import re
import subprocess

from motion_inventory import reject_symlink_chain
from motion_publish_splash import SPLASH_ID
from rebuild_common import ROOT

SEMANTIC = {'Original role', 'Used by'}


def catalog_rows(text):
    headers, rows, records = [], {}, []
    for index, line in enumerate(text.splitlines()):
        if not line.startswith('|'): continue
        cells = [cell.strip() for cell in line.split('|')[1:-1]]
        if cells and cells[0] == 'ID':
            if len(cells) != len(set(cells)): raise ValueError('Catalog headers must remain unique')
            headers = cells; continue
        if not cells or not cells[0].startswith('`'): continue
        if len(cells) != len(headers) or not SEMANTIC <= set(headers):
            raise ValueError('Catalog metadata overlay requires the known table schema')
        ids = re.findall(r'`([^`]+)`', cells[0])
        if not ids or re.fullmatch(r'`[^`]+`(?:,\s*`[^`]+`)*', cells[0]) is None:
            raise ValueError('Catalog row must contain only canonical logical IDs')
        data = dict(zip(headers, cells)); records.append((index, headers, ids))
        for id in ids:
            if id in rows: raise ValueError('Catalog overlay rejects duplicate logical IDs')
            rows[id] = data | {'ID': id}
    return rows, records


def check_catalog_rows(recipe, baseline, current):
    if set(baseline) != set(recipe['logicalIds']) or set(current) - {SPLASH_ID} != set(baseline):
        raise ValueError('Catalog metadata overlay requires the exact closed85 logical IDs')
    originals = {a['id']: 'lottie' if a['master']['file'].endswith('.json') else 'png' for a in recipe['assets']}
    for id, row in baseline.items():
        other = current[id]
        if list(row) != list(other) or any(row[key] != other[key] for key in row.keys() - SEMANTIC - {'Format'}):
            raise ValueError('Catalog metadata overlay cannot change size, file, status or ID metadata')
        target, source = row['Format'].partition(','), other['Format'].partition(',')
        allowed = {target[0], originals.get(id, target[0])}
        if source[0] not in allowed or source[1:] != target[1:]:
            raise ValueError('Catalog metadata overlay cannot change format or mass metadata')


def overlay_catalog_metadata(target, source, recipe):
    reject_symlink_chain(target); reject_symlink_chain(source)
    text, current_text = target.read_text(), source.read_text()
    baseline, records = catalog_rows(text); current, _ = catalog_rows(current_text)
    check_catalog_rows(recipe, baseline, current)
    original = subprocess.check_output(['git', 'show', recipe['baseMain'] + ':assets/CATALOG.md'], cwd=ROOT, text=True)
    nonrows = lambda value: [line for line in value.splitlines() if not line.startswith('| `')]
    if nonrows(current_text) not in [nonrows(text), nonrows(original)]:
        raise ValueError('Unexpected catalog prose/schema changes need explicit review')
    lines = text.splitlines()
    for index, headers, ids in records:
        fields = lines[index].split('|')
        for name in SEMANTIC:
            values = {current[id][name] for id in ids}
            if len(values) != 1: raise ValueError('Grouped catalog IDs require identical semantic metadata')
            fields[headers.index(name) + 1] = ' ' + values.pop() + ' '
        lines[index] = '|'.join(fields)
    target.write_text('\n'.join(lines) + '\n')
