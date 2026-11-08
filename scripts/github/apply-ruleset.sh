#!/bin/sh
# Applies the main-branch ruleset and the merge settings (ADR 0015, #74).
# Run by a maintainer with repository admin after every change to .github/rulesets/main.json; never by CI.
# Usage: sh scripts/github/apply-ruleset.sh   (GH_REPO=<owner>/<repo> to target another repository)
set -eu

R=${GH_REPO:-OSSCA-thorvg/GameJam-Vampire-Survivors}
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
RULESET="$ROOT/.github/rulesets/main.json"

command -v gh > /dev/null 2>&1 || { echo "gh is required (https://cli.github.com)" >&2; exit 1; }
[ -f "$RULESET" ] || { echo "Missing $RULESET" >&2; exit 1; }

# Refuse a ruleset whose required checks do not match the CI job names.
node "$ROOT/scripts/github/check-ruleset.mjs" --ruleset "$RULESET"

id=$(gh api "repos/$R/rulesets" --jq '[.[] | select(.name == "main" and .target == "branch")][0].id // empty')
if [ -n "$id" ]; then
  echo "Updating ruleset 'main' ($id) on $R."
  gh api -X PUT "repos/$R/rulesets/$id" --input "$RULESET" --jq '.id' > /dev/null
else
  echo "Creating ruleset 'main' on $R."
  id=$(gh api -X POST "repos/$R/rulesets" --input "$RULESET" --jq '.id')
fi

gh api -X PATCH "repos/$R" \
  -F allow_auto_merge=true -F allow_squash_merge=true -F allow_merge_commit=false \
  -F allow_rebase_merge=false -F delete_branch_on_merge=true \
  --jq '"allow_auto_merge=\(.allow_auto_merge) allow_squash_merge=\(.allow_squash_merge) allow_merge_commit=\(.allow_merge_commit) allow_rebase_merge=\(.allow_rebase_merge) delete_branch_on_merge=\(.delete_branch_on_merge)"'

echo "Ruleset id: $id"
echo "Rules on main: $(gh api "repos/$R/rules/branches/main" --jq '[.[].type] | join(", ")')"
