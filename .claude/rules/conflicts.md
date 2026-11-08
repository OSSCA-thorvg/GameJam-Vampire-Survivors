# Conflict resolution rules

Adapted from the dw plugin's `merge-resolver` agent (the plugin is not needed), and adapted to this repository's linear history (ADR 0012): a PR branch is exactly one commit rebased onto the current `origin/main`, and it lands with a squash merge. The `resolve-conflicts` skill applies these rules.

## When

- Before opening a PR, when `main` moved since the branch was created (`issue-finish`). A rebase that applies cleanly still needs the functional check below.
- When the auto-merge workflow comments that a PR conflicts with `main` or is behind it, or the `PR rules` check "Branch is one rebased commit" fails. Every merge makes the other open PRs stale, so this is routine.
- When parallel subagents work on issues that touch the same files. Each branch rebases right before its PR, and the one that merges later resolves.

## How

- **Rebase onto `origin/main`, never merge.** Never merge `main` into the branch and never use `git pull` without rebase: a merge commit fails the `PR rules` checks "Branch is one rebased commit" and the commit-subject rule. Each clone sets `pull.rebase true` and `merge.ff only` (`issue-start`).
- **End with one commit.** After resolving, the branch is squashed again into exactly one commit on top of `origin/main`, whose subject is the PR title and whose body is the PR summary (`.claude/rules/commits.md`). Push it with `git push --force-with-lease`, only on your own issue branch, never plain `--force` and never on `main`.
- **Back up first:** run `git branch backup/<branch>-<yyyymmddHHMM>` before rebasing. Delete it after the PR merges.
- **Never lose functionality.** Understand what each side intended (read the other PR and its issue), and keep both. When the two intents truly contradict, the side that follows an accepted ADR wins. If neither does, stop and ask the user.
- **Functional conflicts count too.** After a clean rebase, still check APIs, types, message shapes, content IDs and config that both sides touched. `pnpm check` must pass.
- **Propagate main's improvements:** if `main` brought a library upgrade, a security fix, a renamed module or a new convention, update this branch's new code to match it. A separate local commit is fine while working; it is squashed into the branch's one commit before pushing.
- **Protect the working tree:**
  - Stage resolved files by path.
  - Never use `git reset --hard`, `git clean`, `git stash` or `git checkout -- .`. Squash with `git reset --soft`, which keeps the working tree and the index.
  - To back out of a rebase, use `git rebase --abort`.
  - To redo a single file, use `git checkout --ours/--theirs -- <path>` or `git restore --source=<ref> -- <path>`.
- **No conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`) may remain. The pre-commit hook and `pnpm check` run on the result, and `--no-verify` stays forbidden.

## Files with a fixed resolution

| File                                                                                                            | Resolution                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-lock.yaml`                                                                                                | Never hand-merge. Take `main`'s version, then run `pnpm install` to re-add this branch's dependency changes, and stage the result. The `minimumReleaseAge` policy still applies. During a rebase, `--ours` is the `main` side and `--theirs` is your commit being replayed, so `main`'s version is `git checkout --ours -- pnpm-lock.yaml`. |
| `package.json` files                                                                                            | Keep both sides' dependencies and scripts, then regenerate the lockfile as above.                                                                                                                                                                                                                                                           |
| `assets/manifest.json`, `assets/CATALOG.md`                                                                     | Union of entries. If both sides added the same ID with different files, stop and ask. Re-run `pnpm assets:sync` (once it exists) for the generated ID list.                                                                                                                                                                                 |
| Generated files (`ASSET_IDS`, `assets/fonts/hud.ttf` and similar)                                               | Never hand-merge. Regenerate them with their script.                                                                                                                                                                                                                                                                                        |
| `docs/adr/NNNN-*.md` number collision                                                                           | The branch that has not merged yet renumbers its ADR to the next free number, and updates `docs/adr/README.md` and every reference to it (grep for `ADR NNNN` and the file name).                                                                                                                                                           |
| `docs/adr/README.md`, `docs/roadmap.md`, `.github/labels.json`, `.env.example`, `compose.yaml`, `.dockerignore` | Union of rows and entries, in numeric or table order.                                                                                                                                                                                                                                                                                       |
| `CLAUDE.md`, `.claude/rules/*.md`, skills                                                                       | Keep both sides' rules. If they contradict, the newer user decision wins; ask when unsure. Then re-check `docs-sync.md`.                                                                                                                                                                                                                    |
| `packages/shared/src/protocol.ts`, content data                                                                 | Keep both. Then fix every type error in client and server, because the type checker shows the functional conflicts.                                                                                                                                                                                                                         |

## Recording

- The PR body gets a short **Conflicts** note: which files conflicted and how each was resolved.
- If resolving needed a decision that binds later work, write an ADR (`adr-new`).
