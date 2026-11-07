---
name: issue-finish
description: Finish an issue — verify the acceptance criteria, run the checks, push, open a PR that closes the issue, wait for the auto-merge workflow to squash-merge it on green CI, and verify the issue is status:done and its dependents unblocked. Use when implementation of an issue is complete ("open the PR for #12", "12번 마무리").
---

# issue-finish

This project merges its own PRs as soon as CI passes; there is no waiting for human review. Merging is done only by the auto-merge workflow (`.github/workflows/auto-merge.yml`, ADR 0012): never run `gh pr merge` and never use the web UI merge button. A ready PR with green CI is merged immediately, so the quality gate is the acceptance criteria and the checks below, done **before** the PR is opened. Do not skip them. If something must still be settled, hold the PR by adding `--label status:blocked` to `gh pr create`; to release it, remove the label and re-run the PR's latest CI run (`gh run rerun <run-id>`, the id from `gh run list --workflow ci.yml --branch <branch> --limit 1`), or push a commit.

Writing rules follow `dw:commit-conventions`: a `<prefix>: <imperative summary>` subject of at most 72 characters (`feat:`, `fix:`, `update:`, `refactor:`, `test:`, `docs:`, `chore:`), bodies without hard wraps, and bodies passed with `--body-file`.

## Steps

1. Go through the issue's acceptance criteria one by one and confirm each with evidence: a test, a command's output, or a screenshot for visual behaviour. If one is not met, do not open the PR; report what is missing.
2. Run the repository checks listed in `CLAUDE.md` under Commands (lint, typecheck, test, build). All must pass locally.
3. **Sync the docs** (`.claude/rules/docs-sync.md`). For each row whose trigger applies to this branch, make sure the listed document is updated in this branch. Always re-read `CLAUDE.md` § Commands and § Architecture against the diff. Commit the forgotten updates; step 6 squashes them into the PR's one commit.
4. If the branch touches dependencies, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/server`, `packages/shared/src/protocol.ts`, Docker files, `.github/workflows`, or code that puts user data into the DOM, run the `security-check` skill (preferably in a subagent). Do not open the PR while a **high** finding is open.
5. If the change touched gameplay feel, compare it with `docs/reference/gameplay.md` and update that file with any new observations.
6. Rebase and squash the branch into one commit on top of the current `origin/main` (ADR 0012, `.claude/rules/commits.md`). Its subject is the PR title below and its body the PR summary, written to a scratch file. `git reset --soft` keeps the working tree and the index; never use `--hard`. If the rebase changed anything, re-run step 2:
   ```sh
   git fetch origin main && git rebase origin/main
   git reset --soft origin/main && git commit -F /tmp/commit-msg.txt
   git log --oneline origin/main..HEAD   # exactly one line
   ```
   Then move the issue to review, push with `--force-with-lease`, and open the PR with the issue's `type:*`, `priority:*`, `area:*` and `phase:*` labels. Labels are applied at creation, because the workflow may merge the PR, and set `status:done`, within a minute of CI starting. The title is `<prefix>: <same summary as the issue> (#N)`; the `(#N)` suffix is what `dw:gh-issue-link` falls back to when looking up the PR for an issue. The body contains `Closes #N`:
   ```sh
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --remove-label status:in-progress --add-label status:review
   git push --force-with-lease -u origin HEAD
   gh pr create -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --title "feat: Spawn enemies from the wave table (#12)" --body-file /tmp/pr-body.md \
     --label "type:enhancement" --label "priority:high" --label "area:gameplay" --label "phase:1-core-loop"
   ```
   PR body: what changed at the behaviour level, how to verify it (exact commands or steps), the ADRs cited or added, and `Closes #N`.
7. Wait for CI, then wait for the auto-merge workflow to merge the PR (timeout 10 minutes):
   ```sh
   gh pr checks <PR> --watch -R OSSCA-thorvg/GameJam-Vampire-Survivors
   for i in $(seq 60); do
     [ "$(gh pr view <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state -q .state)" = MERGED ] && break
     sleep 10
   done
   gh pr view <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state,mergedBy,mergeCommit
   ```
   - The PR is merged by `github-actions[bot]`. Do not merge it yourself, whatever happens.
   - If a check fails, the workflow leaves one comment on the PR naming the conclusion and the run. Fix it on the branch, squash the fix into the one commit (`git commit --amend`, or step 6 again), and `git push --force-with-lease`; the new commit's CI run is re-evaluated automatically. A PR title or body fixed with `gh pr edit` also re-runs CI.
   - If the PR conflicts with `main`, or `main` moved since the branch was squashed, the workflow (or the `PR rules` check "Branch is one rebased commit") comments asking for a rebase. Repeat step 6 (rebase onto `origin/main` and squash), re-run step 2, and `git push --force-with-lease`.
   - If the PR is still open after the timeout with green checks, read the workflow's run: `gh run list -R OSSCA-thorvg/GameJam-Vampire-Survivors --workflow auto-merge.yml --limit 5`, then `gh run view <run-id> --log -R OSSCA-thorvg/GameJam-Vampire-Survivors`. A PR labelled `status:blocked` (or a draft) is never merged; release the hold as described above.
8. Verify what the workflow did after the merge, and sync local `main`:
   ```sh
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state,labels
   gh run list -R OSSCA-thorvg/GameJam-Vampire-Survivors --workflow ci.yml --branch main --limit 1
   git switch main && git pull --ff-only origin main
   ```
   - The issue must be closed and labelled `status:done`, without `status:review`. If the issue is still open, the closing link failed: close it with a comment naming the PR. If a label is wrong, the workflow's post-merge step failed: read its log and fix the labels by hand with `gh issue edit`. If the `dw` plugin is installed, `dw:gh-issue-link`'s `verify-issue-closed-state.sh <N>` checks the same three conditions: issue closed, `status:done`, and PR merged.
   - A CI run on `main` (event `workflow_dispatch`) must have started after the merge.
9. Verify the unblocking: open `status:blocked` issues whose "Depends on" lists `#N` and whose dependencies are now all closed must have moved to `status:ready`. Fix any the workflow missed by hand:
   ```sh
   gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --label status:blocked --search "#<N> in:body" --json number,title,labels
   ```
10. Report the PR URL, the merge commit, and any issues that were unblocked.
