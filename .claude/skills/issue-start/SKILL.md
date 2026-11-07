---
name: issue-start
description: Begin implementing a GitHub issue — verify it is ready, switch its label from status:ready to status:in-progress, assign yourself, create the branch, read the ADRs it cites, and check the work's scope with impact-check. Use before writing any code for an issue ("start #12", "implement issue 12", "12번 시작").
---

# issue-start

Code for an issue is written only after this skill has run. If the user asks to implement an issue directly, run this first.

## Steps

1. Read the full issue thread, not just the body: later comments may revise the plan. Always pass `--json`; plain `gh issue view` uses a deprecated API (`dw:gh-workflow`):
   ```sh
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --json number,title,state,body,labels,assignees,comments
   ```
   Stop and report to the user if any of these hold:
   - the issue is closed;
   - it is labelled `status:in-progress` or `status:review` and assigned to someone else;
   - an issue under "Depends on" is still open.
2. Read `CLAUDE.md`, every ADR the issue cites, and, for gameplay issues, the cited section of `docs/reference/gameplay.md`. If the implementation plan contradicts an accepted ADR, stop and raise it. Do not silently deviate (ADR 0001).
3. Switch the status label and assign yourself. Removing a label the issue does not have is harmless:
   ```sh
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --remove-label status:ready --remove-label status:blocked \
     --add-label status:in-progress --add-assignee @me
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json labels -q '[.labels[].name]'
   ```
4. Create the branch from an up-to-date `main`, following `dw:branch-conventions`: `<prefix>/issue-<N>-<2-4-word-slug>`. Once per clone, make `git pull` rebase and refuse merge commits (linear history, ADR 0012); setting them again is harmless:
   ```sh
   git config pull.rebase true
   git config merge.ff only
   git fetch origin main
   git switch main && git pull --ff-only origin main
   git switch -c feature/issue-12-wave-spawner
   ```
   Prefix by label: `type:enhancement` → `feature`, `type:bug` → `fix`, `type:refactor` → `refactor`, and anything else → `update`. Inside a secondary git worktree, branch from `origin/main` instead of checking out `main`.
5. Check the scope before writing code: run the `impact-check` skill in **scope** mode (`.claude/rules/verification.md`). It lists what will change, every consumer of it, and the one fact the change is safe because of. If the consumers reach beyond the issue's plan, update the issue body or split the issue before coding (`.claude/rules/issues.md`).
6. Post the start comment: the planned approach in 2–4 bullets, followed by the scope result from step 5, written to a file and passed with `--body-file`:
   ```sh
   gh issue comment <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --body-file /tmp/start.md
   ```
7. Implement against the acceptance criteria and the implementation plan. Run what you write as you go, and keep the evidence for `issue-finish` in `verification/issue-<N>/` (`.claude/rules/verification.md`). When the work reveals a decision that will bind later issues, write an ADR with `adr-new` on the same branch.

To give up an issue: switch the label back to `status:ready`, remove yourself as assignee, and comment what was learned.
