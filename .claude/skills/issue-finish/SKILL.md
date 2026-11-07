---
name: issue-finish
description: Finish an issue — verify the acceptance criteria, run the checks, push, open a PR that closes the issue, and squash-merge it right away once checks pass, then mark the issue status:done and unblock dependents. Use when implementation of an issue is complete ("open the PR for #12", "12번 마무리").
---

# issue-finish

This project merges its own PRs immediately after the checks pass; there is no waiting for human review. The quality gate is therefore the acceptance criteria and the checks below. Do not skip them.

Writing rules follow `dw:commit-conventions`: a `<prefix>: <imperative summary>` subject of at most 72 characters (`feat:`, `fix:`, `update:`, `refactor:`, `test:`, `docs:`, `chore:`), bodies without hard wraps, and bodies passed with `--body-file`.

## Steps

1. Go through the issue's acceptance criteria one by one and confirm each with evidence: a test, a command's output, or a screenshot for visual behaviour. If one is not met, do not open the PR; report what is missing.
2. Run the repository checks listed in `CLAUDE.md` under Commands (lint, typecheck, test, build). All must pass locally.
3. If the branch touches dependencies, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/server`, `packages/shared/src/protocol.ts`, Docker files, `.github/workflows`, or code that puts user data into the DOM, run the `security-check` skill (preferably in a subagent). Do not open the PR while a **high** finding is open.
4. If the change touched gameplay feel, compare it with `docs/reference/gameplay.md` and update that file with any new observations.
5. Push and open the PR. Its title is `<prefix>: <same summary as the issue> (#N)`; the `(#N)` suffix is what `dw:gh-issue-link` falls back to when looking up the PR for an issue. Its body contains `Closes #N`:
   ```sh
   git push -u origin HEAD
   gh pr create -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --title "feat: Spawn enemies from the wave table (#12)" --body-file /tmp/pr-body.md
   ```
   PR body: what changed at the behaviour level, how to verify it (exact commands or steps), the ADRs cited or added, and `Closes #N`.
6. Copy the issue's `type:*`, `priority:*`, `area:*` and `phase:*` labels to the PR, and move the issue to review:
   ```sh
   gh issue edit <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --add-label "type:enhancement" --add-label "priority:high" --add-label "area:gameplay" --add-label "phase:1-core-loop"
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --remove-label status:in-progress --add-label status:review
   ```
7. Wait for CI, then squash-merge:
   ```sh
   gh pr checks <PR> --watch -R OSSCA-thorvg/GameJam-Vampire-Survivors
   gh pr merge <PR> --squash --delete-branch -R OSSCA-thorvg/GameJam-Vampire-Survivors
   ```
   - If a check fails, fix it on the branch, push, and wait again. Never merge with failing checks, and never bypass branch protection.
   - If the PR has merge conflicts, rebase onto `main`, re-run step 2, and force-push the branch with `--force-with-lease`.
   - Until a CI workflow exists (it is added by the monorepo setup issue), merge after the local checks pass.
8. Close the loop:
   ```sh
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --remove-label status:review --add-label status:done
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json state,labels
   git switch main && git pull --ff-only origin main
   ```
   - If the issue is still open, the closing link failed. Close it with a comment naming the PR. If the `dw` plugin is installed, `dw:gh-issue-link`'s `verify-issue-closed-state.sh <N>` checks the same three conditions: issue closed, `status:done`, and PR merged.
9. Unblock dependents: find open `status:blocked` issues whose "Depends on" lists `#N`. If all of their dependencies are now closed, switch them to `status:ready`:
   ```sh
   gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --label status:blocked --search "#<N> in:body" --json number,title
   ```
10. Report the PR URL, the merge commit, and any issues that were unblocked.
