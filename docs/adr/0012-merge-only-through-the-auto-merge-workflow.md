# 0012. Merge only through the auto-merge workflow

- Status: Superseded by [0015](0015-protect-main-with-a-ruleset-and-native-auto-merge.md)
- Date: 2026-11-07
- Related issues: #28

## Context

- The requester asked that PRs merge automatically, but never when CI fails (2026-11-07): "merge automatically, but never when CI fails" (머지는 자동이지만 ci 실패하면 머지 안되도록, 무조건 ci 체크되면 머지).
- The requester also asked for a clean history (2026-11-07): "commits must always be rebased and squashed, merges always squash, keep history clean".
- The repository already allows squash merges only: `allow_merge_commit=false`, `allow_rebase_merge=false`, `allow_squash_merge=true`, with the squash commit titled from the PR title and its message from the PR body (verified 2026-11-07).
- The repository is private on GitHub's free plan. Branch protection, rulesets and GitHub's native auto-merge all return 403 there (verified 2026-11-07), so GitHub itself cannot require a green check before merge.
- Until now the gate lived in the `issue-finish` skill, which ran `gh pr merge` after `gh pr checks --watch`. Nothing stopped a merge made any other way, and a fast merge could race a check that had not started yet.
- ADR 0002 defines CI; ADR 0011 requires least-privilege tokens, SHA-pinned actions and no untrusted code in privileged workflows.

## Decision

- `.github/workflows/auto-merge.yml` is the only way a PR reaches `main`. It runs on `workflow_run` when the `CI` workflow completes for a `pull_request` event, and it:
  - finds the open PR whose head is exactly the commit CI ran on, and acts only on the newest CI run for that commit;
  - never merges drafts, PRs labelled `status:blocked` (the hold), PRs from forks or PRs authored by `dependabot[bot]` (those are reviewed and merged by hand);
  - when CI did not succeed, leaves one comment per failing commit (deduplicated with a hidden `<!-- auto-merge:<sha> -->` marker) and stops; cancelled and skipped runs are ignored because a newer run decides;
  - re-reads the PR, requires the head to still be that commit, the PR not to conflict with `main` (a conflict gets one comment asking for a rebase), and the PR to be up to date with its base branch (`compare/<base>...<sha>` `behind_by == 0`; otherwise one comment per commit, marker `<!-- auto-merge:behind:<sha> -->`, asking to rebase onto `origin/main`, squash and force-push), then runs `gh pr merge --squash --delete-branch --match-head-commit <sha>`, so a push after CI ran makes the merge fail;
  - after the merge, labels every closing issue `status:done` (removing `status:review` and `status:in-progress`), moves every open `status:blocked` issue whose `## Depends on` numbers are all closed to `status:ready`, and dispatches `ci.yml` on `main`, because merges made with `GITHUB_TOKEN` do not trigger `push` workflows.
- The workflow follows ADR 0011: job-level permissions limited to `contents`, `pull-requests`, `issues` and `actions` write, no checkout of PR code, no third-party actions (only the preinstalled `gh`), and event values passed through `env:`.
- `ci.yml` gains a `workflow_dispatch` trigger for the post-merge run, and a `ready_for_review` PR trigger so a draft re-enters the gate when it is marked ready.
- **Linear history:** every PR is one commit rebased onto the current tip of `main`, and it lands with a squash merge only (the repository allows no other merge method). The `PR rules` CI job enforces it with the step "Branch is one rebased commit": exactly one commit in `base..head`, no merge commits, and the base tip is an ancestor of the head. Local work-in-progress commits are fine, but before pushing for a PR the branch is rebased and squashed into one commit whose subject is the PR title and whose body is the PR summary; every later fix is squashed into it again and pushed with `git push --force-with-lease`. Each clone sets `git config pull.rebase true` and `git config merge.ff only`, so no merge commit is created by accident (`.claude/rules/commits.md`).
- Nobody merges by hand: never run `gh pr merge`, and never use the web UI merge button. To hold a PR back from merging, label it `status:blocked`; to release it, remove the label and re-run the PR's latest CI run (`gh run rerun <run-id>`, the id from `gh run list --workflow ci.yml --branch <branch> --limit 1`), or push a commit. Draft PRs are also never merged, but GitHub offers drafts for private repositories only on paid plans, so the label is the hold that works here. `issue-finish` opens the PR, waits for the checks and then for the PR to reach `MERGED`, and verifies the labels the workflow set.

## Alternatives considered

- **Make the repository public** — branch protection, required status checks and native auto-merge are free for public repositories, and GitHub would enforce the gate itself. Not chosen because the repository is meant to stay private during the jam.
- **Upgrade the organization to GitHub Team** — gives the same native protection on a private repository. Not chosen because of the cost; it remains the stronger option if the project continues.
- **Keep the gate in the `issue-finish` skill** — depends on every session following the skill, and a merge can happen before all checks have even registered.
- **A third-party auto-merge action** — adds a supply-chain dependency with a write token (ADR 0011) for logic that a short `gh` script covers.

## Consequences

- PRs merge without any manual command as soon as CI is green on their latest commit, and failures are explained on the PR.
- `main` is a linear list of one commit per PR. Every merge makes the other open PRs stale: each must be rebased, re-squashed and force-pushed before it can merge, which also re-runs its CI against the new `main`.
- Force-pushing is part of the normal flow on issue branches (only with `--force-with-lease`, never on `main`), so a branch must not be shared by two people working at once.
- The web UI merge button and `gh pr merge` remain technically available to anyone with write access, so the rule, not GitHub, forbids them. Native protection (see the alternatives) would close this gap.
- `workflow_run` always runs the default-branch version of the workflow, so changes to `auto-merge.yml` take effect only after they are merged, and the PR that introduced it was merged by hand after green CI as the last manual merge.
- Everything that must hold before merge (acceptance criteria, `pnpm check`, docs sync, `security-check`) must be done before the PR is opened, or the PR must be opened with the `status:blocked` hold, because green CI merges it immediately. Removing a label does not trigger CI, so releasing a hold needs the explicit re-run.
- `dw` skills that merge with `gh pr merge` (such as `/dw:ship`) must stop after opening the PR in this repository.
