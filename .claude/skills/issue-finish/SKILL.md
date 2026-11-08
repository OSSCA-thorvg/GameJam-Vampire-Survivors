---
name: issue-finish
description: Finish an issue — verify the acceptance criteria by running the real app, prove the change's safety with impact-check, run the checks, bring a stale branch up to date with resolve-conflicts, push, open a PR that closes the issue, wait for the auto-merge workflow to squash-merge it on green CI, and verify the issue is status:done and its dependents unblocked. Use when implementation of an issue is complete ("open the PR for #12", "12번 마무리").
---

# issue-finish

This project merges its own PRs as soon as CI passes; there is no waiting for human review. Merging is done only by the auto-merge workflow (`.github/workflows/auto-merge.yml`, ADR 0012): never run `gh pr merge` and never use the web UI merge button. A ready PR with green CI is merged immediately, so the quality gate is the acceptance criteria, the impact and verification evidence, and the checks below, done **before** the PR is opened. Do not skip them. If something must still be settled, hold the PR by adding `--label status:blocked` to `gh pr create`; to release it, remove the label and re-run the PR's latest CI run (`gh run rerun <run-id>`, the id from `gh run list --workflow ci.yml --branch <branch> --limit 1`), or push a commit.

Writing rules follow `.claude/rules/commits.md`: a `<prefix>: <imperative summary>` subject of at most 72 characters (`feat:`, `fix:`, `update:`, `refactor:`, `test:`, `docs:`, `chore:`), bodies without hard wraps, and bodies passed with `--body-file`.

## Steps

1. Go through the issue's acceptance criteria one by one and confirm each with evidence that meets `.claude/rules/verification.md`: a test, a command's output, or a screenshot for visual behaviour, each with its proof level (user-visible criteria at level 5, run in the real app). If one is not met, do not open the PR; report what is missing.
2. Run the repository checks listed in `CLAUDE.md` under Commands (lint, typecheck, test, build). All must pass locally.
3. **Prove the impact and verify by running** (`.claude/rules/verification.md`):
   - Run the `impact-check` skill in **proof** mode against the diff and the scope notes from the start comment. The safety fact must reach proof level 4; its report becomes the PR body's **Impact** section.
   - Drive every user-visible acceptance criterion in the real app with the `verify-game` skill (Claude in Chrome when connected, Playwright otherwise), following the feature files the change touches and updating them; the Docker server through `pnpm verify:launch --with-server` or the `dev-server` skill. Keep the evidence in `verification/issue-<N>/` (git-ignored); it becomes the **Verification** section.
   - A documentation or config-only branch runs the checks it affects instead (for example every CI `repo rules` step), and says so.
4. **Sync the docs** (`.claude/rules/docs-sync.md`). For each row whose trigger applies to this branch, make sure the listed document is updated in this branch. Always re-read `CLAUDE.md` § Commands and § Architecture against the diff. Commit the forgotten updates; step 8 squashes them into the PR's one commit.
   - **Re-read the issue thread** (`gh issue view <N> --json body,comments` or `gh api repos/<repo>/issues/<N>/comments`): comments added while you worked can change scope or acceptance criteria. Reconcile them before the PR.
   - **Triage follow-ups** (`.claude/rules/issues.md` § Problems found during implementation): for each problem noted during the work, ask the user if it blocks or needs a decision; otherwise create a follow-up issue with `issue-create`, or comment on the open issue that already covers it. List them under `## Follow-ups` in the PR body as plain `#N` references.
5. If the branch touches dependencies, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/server`, `packages/shared/src/protocol.ts`, Docker files, `.github/workflows`, or code that puts user data into the DOM, run the `security-check` skill (preferably in a subagent). Do not open the PR while a **high** finding is open. If the PR is already open when a high finding appears, hold it at once with `gh issue edit <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --add-label status:blocked`, fix it, and release the hold as described above.
6. If the change touched gameplay feel, compare it with `docs/reference/gameplay.md` and update that file with any new observations.
7. **Bring a stale branch up to date.** If `main` moved since the branch was created (`git fetch origin main && git merge-base --is-ancestor origin/main HEAD` fails), run the `resolve-conflicts` skill (`.claude/rules/conflicts.md`) through its step 4: back up, rebase onto `origin/main`, resolve keeping both sides' intent, check functional compatibility and propagate `main`'s improvements. Step 8 below does the squash and push. Then re-run step 2, and step 3's evidence if the code under test changed. Note what conflicted and how it was resolved for the PR body's **Conflicts** section ("none" if the rebase was clean).
8. Rebase and squash the branch into one commit on top of the current `origin/main` (ADR 0012, `.claude/rules/commits.md`). Its subject is the PR title below and its body the PR summary, written to a scratch file. `git reset --soft` keeps the working tree and the index; never use `--hard`. If the rebase changed anything, re-run step 2:
   ```sh
   git fetch origin main && git rebase origin/main
   git reset --soft origin/main && git commit -F /tmp/commit-msg.txt
   git log --oneline origin/main..HEAD   # exactly one line
   ```
   Then move the issue to review, push with `--force-with-lease`, and open the PR with the issue's `type:*`, `priority:*`, `area:*` and `phase:*` labels. Labels are applied at creation, because the workflow may merge the PR, and set `status:done`, within a minute of CI starting. The title is `<prefix>: <same summary as the issue>` with **no** `(#N)` suffix: GitHub appends the PR number to the squash commit, and CI rejects a trailing `(#N)`. The issue link is `Closes #N` in the body, which CI also checks. `Closes #N` must be the only closing keyword in the body: GitHub also acts on quoted ones (even in backticks), so never write `Closes`/`Fixes`/`Resolves` followed by another issue number; CI rejects it. `.github/pull_request_template.md` has the body's sections:
   ```sh
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --remove-label status:in-progress --add-label status:review
   git push --force-with-lease -u origin HEAD
   gh pr create -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --title "feat: Spawn enemies from the wave table" --body-file /tmp/pr-body.md \
     --label "type:enhancement" --label "priority:high" --label "area:gameplay" --label "phase:1-core-loop"
   ```
   PR body (`.claude/rules/pull-requests.md`): what changed at the behaviour level, how to verify it (exact commands or steps), the ADRs cited or added, `Closes #N`, and three sections:
   - **Impact:** the `impact-check` proof-mode report from step 3: the safety fact with its proof level and proof, the risks, and what was cleared;
   - **Verification:** the criteria driven, the proof level each reached, and the commands with their key output or attached screenshots (step 3);
   - **Conflicts:** the files that conflicted with `main` and how each was resolved, or "none" (step 7).
9. Wait for CI, then wait for the auto-merge workflow to merge the PR (timeout 10 minutes):
   ```sh
   gh pr checks <PR> --watch -R OSSCA-thorvg/GameJam-Vampire-Survivors
   for i in $(seq 60); do
     [ "$(gh pr view <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state -q .state)" = MERGED ] && break
     sleep 10
   done
   gh pr view <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state,mergedBy,mergeCommit
   ```
   - The PR is merged by `github-actions[bot]`. Do not merge it yourself, whatever happens.
   - If a check fails, the workflow leaves one comment on the PR naming the conclusion and the run. Fix it on the branch, squash the fix into the one commit (`git commit --amend`, or step 8 again), and `git push --force-with-lease`; the new commit's CI run is re-evaluated automatically. A PR title or body fixed with `gh pr edit` also re-runs CI; if `gh pr edit` fails with a missing-scope error, use `gh api -X PATCH repos/OSSCA-thorvg/GameJam-Vampire-Survivors/pulls/<PR> -f title=...` or `-F body=@/tmp/pr-body.md` (`.claude/rules/pull-requests.md`).
   - If the PR conflicts with `main`, or `main` moved since the branch was squashed, the workflow (or the `PR rules` check "Branch is one rebased commit") comments asking for a rebase. Run the `resolve-conflicts` skill, which rebases onto `origin/main`, re-runs the checks, squashes back to one commit and runs `git push --force-with-lease`, and add its **Conflicts** note to the PR body.
   - If the PR is still open after the timeout with green checks, read the workflow's run: `gh run list -R OSSCA-thorvg/GameJam-Vampire-Survivors --workflow auto-merge.yml --limit 5`, then `gh run view <run-id> --log -R OSSCA-thorvg/GameJam-Vampire-Survivors`. A PR labelled `status:blocked` (or a draft) is never merged; release the hold as described above.
10. Verify what the workflow did after the merge, and sync local `main`:

```sh
gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state,labels
gh run list -R OSSCA-thorvg/GameJam-Vampire-Survivors --workflow ci.yml --branch main --limit 1
git switch main && git pull --ff-only origin main
```

- The issue must be closed and labelled `status:done`, without `status:review`. If the issue is still open, the closing link failed: close it with a comment naming the PR. If a label is wrong, the workflow's post-merge step failed: read its log and fix the labels by hand with `gh issue edit`. (If the dw plugin is installed, its `gh-issue-link` skill has a `verify-issue-closed-state.sh` script that checks the same three conditions; it is optional.)
- A CI run on `main` (event `workflow_dispatch`) must have started after the merge.

11. Verify the unblocking: open `status:blocked` issues whose "Depends on" lists `#N` and whose dependencies are now all closed must have moved to `status:ready`. Fix any the workflow missed by hand:

```sh
gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --label status:blocked --search "#<N> in:body" --json number,title,labels
```

12. Report the PR URL, the merge commit, and any issues that were unblocked.
