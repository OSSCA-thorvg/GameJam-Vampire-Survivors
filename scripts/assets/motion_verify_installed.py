"""Fresh-clone current graph/archive integrity using portable evidence, without ignored AI raws."""
import argparse
import json
from pathlib import Path
import sys

from motion_publish_verify import verify_receipt
from rebuild_common import ROOT, read_json


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=ROOT / 'assets')
    parser.add_argument('--receipt', type=Path, default=ROOT / 'docs/assets/motion-84.receipt.json')
    parser.add_argument('--archive', type=Path, default=ROOT / 'docs/assets/motion-source-archive84')
    parser.add_argument('--recipe', type=Path, default=ROOT / 'docs/assets/motion-84.json')
    args = parser.parse_args()
    verify_receipt(read_json(args.receipt), json.load(sys.stdin), args.archive, read_json(args.recipe), args.assets)
    print('Exact current native/resource graph and mandatory portable source evidence verified')
