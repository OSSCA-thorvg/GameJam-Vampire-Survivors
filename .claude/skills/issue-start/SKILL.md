---
name: issue-start
description: The only way to begin implementing a GitHub issue — verify it is ready (prerequisite gate), switch its label from status:ready to status:in-progress, assign yourself, create the issue's own git worktree and branch, post the marked start comment, read the ADRs it cites, and check the work's scope with impact-check. Use before writing any code for an issue ("start #12", "implement issue 12", "12번 시작").
---

# issue-start

**This skill is the only way to start work on an issue.** No branch, worktree, commit or code for an issue exists before it has run. If the user asks to implement an issue directly, run this first. Other entry points (`/dw:impl`, `/dw:ship`, ad-hoc branches in the main checkout) are not used for this repository's issues. CI rejects a PR whose issue has no assignee or no `issue-start` marker comment (step 6).

## Steps

1. Read the full issue thread: the body **and every comment**, in order, including the newest. Later comments may revise the plan, add findings from earlier PRs, or record user decisions. Where a comment changes the body, the comment wins: note the change in your start comment, and update the body if the change is lasting. Always pass `--json`; plain `gh issue view` uses a deprecated API. If the repository is not found (404 or "Could not resolve"), your `gh` account (`gh auth status`) lacks access: stop and ask the user, do not work around it.

   ```sh
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --json number,title,state,body,labels,assignees,comments
   ```

   Stop and report to the user if any of these hold:
   - the issue is closed;
   - it is labelled `status:in-progress` or `status:review` and assigned to someone else.

   **Prerequisite gate (mandatory, before any label, branch or code change):**

   ```sh
   # numbers listed under the issue's "## Depends on" section
   deps=$(gh api repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N> --jq .body \
     | awk '/^## Depends on/{f=1;next} /^## /{f=0} f' | grep -oE '#[0-9]+' | tr -d '#' | sort -un)
   for d in $deps; do
     echo "#$d $(gh api repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/$d --jq .state)"
   done
   ```
   - If any dependency is `open`:
     - **stop**;
     - comment on the issue naming the open prerequisites;
     - switch it to `status:blocked`;
     - tell the user.
   - Do not create a branch or write code, even if asked to "just start". Never implement a missing prerequisite inside this issue: the prerequisite issue has to be finished, or the plan changed, first.
   - Also confirm that the dependency artifacts this issue names (paths and exported symbols under **Before you start** and **Context**) exist on `origin/main`:
     ```sh
     git fetch origin main
     git ls-tree -r --name-only origin/main | grep -F <path>
     git grep -n <symbol> origin/main -- packages
     ```
     A closed prerequisite whose artifacts are missing is still unmet: stop the same way, and name what is missing.

2. Read `CLAUDE.md`, every ADR the issue cites, and, for gameplay issues, the cited section of `docs/reference/gameplay.md`. If the implementation plan contradicts an accepted ADR, stop and raise it. Do not silently deviate (ADR 0001).
3. Switch the status label and assign yourself. Removing a label the issue does not have is harmless:
   ```sh
   gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --remove-label status:ready --remove-label status:blocked \
     --add-label status:in-progress --add-assignee @me
   gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json labels -q '[.labels[].name]'
   ```
   If `gh issue edit` fails with a missing-scope error (for example `read:org`), use the REST calls in `.claude/rules/pull-requests.md` § Using `gh`, plus `gh api -X POST repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N>/assignees -f 'assignees[]=<your-login>'` (your login: `gh api user -q .login`).
4. **Create the issue's own worktree** and work only inside it. The main checkout stays on `main`, so parallel issues and subagents never share files. `.claude/worktrees/` is git-ignored. The branch name is `<prefix>/issue-<N>-<2-4-word-slug>` (`.claude/rules/commits.md`).
   ```sh
   git fetch origin main
   git worktree add -b feature/issue-12-wave-spawner .claude/worktrees/issue-12 origin/main
   cd .claude/worktrees/issue-12
   git config pull.rebase true && git config merge.ff only   # linear history (ADR 0015)
   pnpm install --frozen-lockfile
   ```
   - Prefix by label: `type:enhancement` → `feature`, `type:bug` → `fix`, `type:refactor` → `refactor`, and anything else → `update`.
   - If `.claude/worktrees/issue-<N>` already exists, reuse it after checking that it is on this issue's branch.
   - A subagent implementing the issue is briefed with this worktree's absolute path and works only there.
   - Dev servers started from the worktree use a port nobody else uses (`--strictPort`). Stop only the processes you started, by PID.
5. Check the scope before writing code: run the `impact-check` skill in **scope** mode (`.claude/rules/verification.md`). It lists what will change, every consumer of it, and the one fact the change is safe because of. If the consumers reach beyond the issue's plan, update the issue body or split the issue before coding (`.claude/rules/issues.md`).
6. Post the start comment: the planned approach in 2–4 bullets, followed by the scope result from step 5, written to a file and passed with `--body-file`:
   ```sh
   gh issue comment <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --body-file /tmp/start.md
   ```
   End the comment with the hidden marker line `<!-- issue-start -->`. CI checks for it, together with an assignee, before a PR for this issue can merge.
7. Implement against the acceptance criteria and the implementation plan. Run what you write as you go: iterate with `pnpm test:changed`, which runs only the tests affected since `origin/main` (the whole suite when a file under `assets/`, a package, Vitest or Vite config, a tsconfig or the lockfile changed); the full suite still runs in `pnpm check` before the PR (`issue-finish`) and in CI. Keep the evidence for `issue-finish` in `verification/issue-<N>/` (`.claude/rules/verification.md`). When the work reveals a decision that will bind later issues, write an ADR with `adr-new` on the same branch.

To give up an issue: switch the label back to `status:ready`, remove yourself as assignee, and comment what was learned.
