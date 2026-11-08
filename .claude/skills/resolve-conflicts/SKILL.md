---
name: resolve-conflicts
description: Bring an issue branch up to date with main and resolve git and functional conflicts by rebasing — back up, analyse both sides, resolve per .claude/rules/conflicts.md (lockfile, manifest, ADR numbers, protocol), propagate main's improvements, validate, squash back to one commit on origin/main and force-push with lease. Use when a PR conflicts with main, when the PR feedback workflow reports a failed or stale branch, before opening a PR on a stale branch, or when asked to "충돌 해결", "rebase onto main" or "resolve conflicts".
---

# resolve-conflicts

Rules: `.claude/rules/conflicts.md`. The procedure is adapted from the dw plugin's `merge-resolver` agent (the plugin is not needed), but rebases instead of merging: under ADR 0015 (linear history unchanged from ADR 0012) a PR branch is exactly one commit on top of the current `origin/main`, and CI ("Branch is one rebased commit") and the `main` ruleset (linear history, strict up-to-date checks) both refuse merge commits and stale branches. Run it in a subagent when the conflict spans many files, and give the subagent this skill, the rules file and both issues.

## 1. Analyse

```sh
BR=$(git branch --show-current)          # must be an issue branch, never main
git status --short                       # must be clean; commit or ask about uncommitted work first
git fetch origin main
BASE=$(git merge-base HEAD origin/main)
git log --oneline "$BASE"..origin/main   # what landed on main
git log --oneline "$BASE"..HEAD          # what this branch adds
git diff --name-status "$BASE" origin/main
git diff --name-status "$BASE" HEAD
```

For each PR that landed on `main` since the merge base, read its title and issue. Classify each change as `LIBRARY_UPGRADE`, `SECURITY_FIX`, `REFACTOR`, `BUGFIX`, `FEATURE` or `CONFIG`. List the files both sides touched; that is where conflicts and functional clashes will be.

## 2. Back up and rebase

```sh
git branch "backup/$BR-$(date +%Y%m%d%H%M)"
git rebase origin/main
```

For each stop:

1. Run `git status` and `git diff` to see the conflicted files. During a rebase, `--ours` is `main` plus the commits already replayed, and `--theirs` is the branch commit being replayed.
2. Resolve each file following the table in `.claude/rules/conflicts.md`, keeping both sides' intent. Regenerate the lockfile and generated files with their tools; never hand-merge them.
3. Check that no markers remain: `git diff --check` and `grep -rnE '^(<<<<<<<|=======|>>>>>>>)' -- <files>` print nothing.
4. Stage by path (`git add <file>`), then `git rebase --continue`.

To back out entirely, run `git rebase --abort`. The backup branch is still there. Never use `reset --hard`, `clean` or `stash`.

## 3. Check functional compatibility

Even if git reported no conflicts:

- Run `pnpm install` if any `package.json` or the lockfile changed, then `pnpm check`.
- Look at the files both sides touched: protocol message shapes, worker messages, content IDs, asset IDs, config and environment variables. Make sure this branch's code uses `main`'s current names and shapes.
- If the server or Docker files changed on either side, run `pnpm server:up` and check `/healthz` (`dev-server` skill).

## 4. Propagate main's improvements

Update this branch's new code to follow anything `main` introduced: upgraded library APIs, security fixes (scan the new code for the same pattern), renamed modules, and new rules in `CLAUDE.md` or `.claude/rules/`. A local work-in-progress commit is fine here (`commit` skill); step 5 squashes it into the branch's one commit.

## 5. Validate, squash and push

Squash the branch back into **one** commit on top of `origin/main` (ADR 0015, `commit` skill step 6). Its subject is the PR title, `<prefix>: <summary>` with no `(#N)` suffix, and its body the PR summary, written to a scratch file outside the repository. If the branch is already one commit and the rebase only replayed it, keep its message (`git log -1 --format=%B > /tmp/commit-msg.txt`). `git reset --soft` keeps the working tree and the index; never use `--hard`.

```sh
pnpm check                               # once package.json exists (roadmap F1)
git fetch origin main
git merge-base --is-ancestor origin/main HEAD || echo "main moved again: repeat step 2 before squashing"
git reset --soft origin/main && git commit -F /tmp/commit-msg.txt
git log --oneline origin/main..HEAD      # exactly one line, subject = PR title
git push --force-with-lease -u origin "$BR"
```

Only run the `reset --soft` when `origin/main` is an ancestor of `HEAD`; on a stale base it would fold `main`'s newer changes into the commit in reverse.

- Never plain `--force`, and never push to `main`.
- Add a **Conflicts** section to the PR body: which files conflicted and how each was resolved, or "none" with what the functional check covered. Write the body to a file and update it with `gh pr edit <PR> --body-file /tmp/pr-body.md` (if that fails with a missing-scope error, use `gh api -X PATCH repos/OSSCA-thorvg/GameJam-Vampire-Survivors/pulls/<PR> -F body=@/tmp/pr-body.md`, `.claude/rules/pull-requests.md`).
- The pushed commit re-runs CI, and GitHub's native auto-merge merges on green. A force-push can turn auto-merge off: check `gh pr view <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json autoMergeRequest` and, if it is `null` and the PR is not meant to be held, enable it again with `gh pr merge <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --auto --squash` (`issue-finish` step 9). Never merge immediately (`gh pr merge` without `--auto`).
- Delete the backup branch after the PR merges: `git branch -D backup/...`.
- If a resolution required a binding decision, write an ADR with `adr-new`. If two intents could not both be kept, stop and ask the user instead of choosing silently; hold an open PR meanwhile with `gh pr merge <PR> --disable-auto`, and mark it with `gh issue edit <PR> --add-label status:blocked`.
