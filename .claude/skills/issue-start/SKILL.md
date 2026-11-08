---
name: issue-start
description: Begin implementing a GitHub issue — verify it is ready, switch its label from status:ready to status:in-progress, assign yourself, create the branch, read the ADRs it cites, and check the work's scope with impact-check. Use before writing any code for an issue ("start #12", "implement issue 12", "12번 시작").
---

# issue-start

Code for an issue is written only after this skill has run. If the user asks to implement an issue directly, run this first.

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
4. Create the branch from an up-to-date `main`, named `<prefix>/issue-<N>-<2-4-word-slug>` (`.claude/rules/commits.md`). Once per clone, make `git pull` rebase and refuse merge commits (linear history, ADR 0012); setting them again is harmless:
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
