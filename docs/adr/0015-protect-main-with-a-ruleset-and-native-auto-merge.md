# 0015. Protect main with a ruleset and merge through native auto-merge

- Status: Accepted
- Date: 2026-11-08
- Related issues: #74

## Context

- ADR 0012 made `.github/workflows/auto-merge.yml` the merge gate because the repository was private on GitHub's free plan, where branch protection, rulesets and native auto-merge return 403. Its "Alternatives considered" named native protection as the stronger option, and its consequences noted that nothing but the rule stopped a manual merge.
- The repository became public (verified 2026-11-08: `visibility: public`, `GET /repos/OSSCA-thorvg/GameJam-Vampire-Survivors/rulesets` returns `[]`, and branch protection answers "Branch not protected" instead of 403). Rulesets and native auto-merge are now available. Repository settings that day: `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false`, `delete_branch_on_merge=true`, `allow_auto_merge=false`.
- User decisions (2026-11-08): add a ruleset **and** replace the `workflow_run` merge script with GitHub's native auto-merge; the ruleset has **no bypass actors**, so nobody, admins included, can bypass it.
- The requester's earlier decisions recorded in ADR 0012 still bind (2026-11-07): merge automatically, never when CI fails, and keep a clean linear history with squash merges only.
- ADR 0011 requires SHA-pinned actions, least-privilege `permissions`, no checkout of PR code in a privileged workflow, event values passed through `env:`, and no `pull_request_target`.
- The `CI` workflow (`.github/workflows/ci.yml`) has five jobs whose `name:` values are the status check contexts: `pnpm check`, `verify`, `repo rules`, `server image` and `PR rules`. `PR rules` is skipped for `dependabot[bot]`, and a skipped required check counts as passing.

## Decision

- **Ruleset as code.** `.github/rulesets/main.json` is the exact request body for `POST /repos/{owner}/{repo}/rulesets`: a ruleset named `main`, `target: branch`, `enforcement: active`, `bypass_actors: []`, applied to `~DEFAULT_BRANCH`, with these rules:
  - `deletion` and `non_fast_forward`: `main` cannot be deleted or force-pushed;
  - `required_linear_history`;
  - `pull_request` with 0 required approvals, no code-owner review, no last-push approval, no required thread resolution, and `allowed_merge_methods: ["squash"]`;
  - `required_status_checks` with `strict_required_status_checks_policy: true` (the branch must be up to date with `main`) and the five contexts above, each with `integration_id: 15368` (GitHub Actions).
- **Applying it.** `scripts/github/apply-ruleset.sh` creates or updates the ruleset named `main` from that file, and sets the repository to `allow_auto_merge=true`, `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false` and `delete_branch_on_merge=true`. It needs repository admin, is run by a maintainer after every change to the JSON, and is never run by CI.
- **The coupling is checked.** `scripts/github/check-ruleset.mjs` runs in the CI `repo rules` job and fails when a required context is not a `ci.yml` job name, or when the five contexts are not all present. Renaming or removing a CI job therefore updates the ruleset JSON in the same PR, and the maintainer re-runs `apply-ruleset.sh` once it merges.
- **Native auto-merge.** `issue-finish` opens the PR and, once every pre-merge gate is met, enables auto-merge with `gh pr merge <PR> --auto --squash` (or the `enablePullRequestAutoMerge` GraphQL mutation when `gh` lacks a scope). GitHub then squash-merges the PR as the user who enabled it, as soon as the ruleset is satisfied. After every later force-push, `issue-finish` confirms `autoMergeRequest` is still set and enables it again if not.
- **The hold** is "auto-merge not enabled": a PR without auto-merge never merges. `gh pr merge <PR> --disable-auto` holds it again. The `status:blocked` label on a PR stays as a visible marker of the hold, but does not stop a merge by itself.
- **No immediate merges.** `gh pr merge --auto --squash` from `issue-finish` is the only merge command anyone runs. Never run `gh pr merge` without `--auto`, and never use the web UI merge button. The ruleset refuses a merge whose checks are not green on an up-to-date branch, and nobody can bypass it.
- **Two workflows replace `auto-merge.yml`, and neither merges:**
  - `.github/workflows/pr-feedback.yml` runs on `workflow_run` when `CI` completes for a `pull_request` event from this repository, ignores forks and `dependabot[bot]`, and acts only on the newest CI run for the PR's head commit. When CI did not succeed, it comments once per commit (marker `<!-- auto-merge:<sha> -->`, kept so existing comments still deduplicate); when CI succeeded but the PR is behind its base, it comments once per commit asking for a rebase (marker `<!-- auto-merge:behind:<sha> -->`). Permissions: `pull-requests: write`, `issues: write`, `actions: read`, `contents: read`. No checkout.
  - `.github/workflows/post-merge.yml` runs on `pull_request: closed` when the PR was merged and comes from this repository. It labels every closing issue `status:done` (removing `status:review` and `status:in-progress`), and moves every open `status:blocked` issue whose `## Depends on` numbers are all closed to `status:ready`, with the same shell logic ADR 0012's workflow used. Permissions: `issues: write`, `pull-requests: read`, `contents: read`. No checkout.
- **No post-merge CI dispatch.** A native auto-merge is made by a user, not `GITHUB_TOKEN`, so the push to `main` triggers `ci.yml` and the `pull_request: closed` workflow runs on their own. `ci.yml` keeps `workflow_dispatch` for manual runs.
- **Linear history (unchanged from ADR 0012):** every PR is one commit rebased onto the current tip of `main`, and it lands with a squash merge only. The PR title is the squash subject and the PR body its message. The `PR rules` job's step "Branch is one rebased commit" enforces exactly one commit in `base..head`, no merge commits, and the base tip as an ancestor of the head. Local work-in-progress commits are fine, but before pushing for a PR the branch is rebased and squashed into one commit; every later fix is squashed into it again and pushed with `git push --force-with-lease`. Each clone sets `git config pull.rebase true` and `git config merge.ff only` (`.claude/rules/commits.md`).
- Fork and Dependabot PRs are never auto-merged: nobody enables auto-merge on them, and they are reviewed and merged by hand through the same ruleset.

## Alternatives considered

- **Keep `auto-merge.yml` and add only the ruleset** — the ruleset would close the manual-merge gap, but the script would keep its own copies of the mergeability, staleness and post-merge logic, and its `GITHUB_TOKEN` merges would still need the CI dispatch on `main`. Not chosen: the user asked to replace it.
- **A ruleset with an admin bypass** — would let a maintainer merge a red PR in an emergency. Not chosen: the user asked that nobody can bypass it.
- **Classic branch protection** — offers the same checks, but rulesets are the current API, can be kept as one JSON body in the repository and are visible to every contributor.
- **A merge queue** — unnecessary at this project's PR rate, and out of scope for #74.
- **Required reviews or CODEOWNERS** — the project does not wait for human review (ADR 0012).

## Consequences

- GitHub itself enforces the gate: no PR reaches `main` with a failing, missing or stale required check, and no one can force-push or delete `main`.
- Enabling auto-merge is an explicit step in `issue-finish`, so a PR opened early does not merge until its author says so; there is no need to open it with a label hold.
- Every merge still makes the other open PRs stale; the strict up-to-date policy keeps them unmerged until they are rebased, squashed and force-pushed, and `pr-feedback.yml` says so on the PR.
- A force-push can disable auto-merge on some PRs, which is why `issue-finish` re-checks `autoMergeRequest` after each one.
- The ruleset's contexts are strings matched against job names: renaming a CI job without updating `.github/rulesets/main.json` and re-applying it would make every PR unmergeable. `check-ruleset.mjs` catches the first half; re-applying stays a maintainer step.
- `workflow_run` runs the default-branch version of `pr-feedback.yml`, so changes to it take effect only after they merge. While the PR that removes `auto-merge.yml` is open, the old workflow is still live on `main`; that PR is held with `status:blocked` so the old workflow skips it, and it merges through native auto-merge.
- If the repository becomes private on the free plan again, rulesets and native auto-merge stop working: revisit this ADR.
