# Commit rules

Based on `dw:commit-conventions`. The `commit` skill applies them.

## Message

- Write in English.
- Subject: `<prefix>: <imperative summary>`, at most 72 characters, no trailing period.

  | Prefix | Use for |
  |---|---|
  | `feat:` | new capability |
  | `fix:` | bug fix |
  | `update:` | improvement to an existing feature, or a dependency bump |
  | `refactor:` | restructuring without behaviour change |
  | `test:` | tests only |
  | `docs:` | documentation, ADRs, references |
  | `chore:` | build, CI, tooling, repo config |

- A body is required for anything beyond a trivial change. It says why the change was made, what changed at the behaviour or module level (not file by file), how it was validated, and which issue it relates to (`Refs #N`).
- Bodies are not hard-wrapped: one paragraph or one bullet per physical line.
- Do not add AI attribution, `Co-Authored-By` trailers or "Generated with" lines.

## Content

- One issue, one PR, one commit: logical separation happens per issue and PR, not per commit. Local work-in-progress commits are fine while working.
- Before pushing for a PR, rebase the branch onto `origin/main` and squash it into **one** commit. Its subject is the PR title, `<prefix>: <summary> (#N)`, and its body is the PR summary, following the message rules above. CI rejects a PR branch with more than one commit, with merge commits, or without the current tip of `main` (ADR 0012).
  ```sh
  git fetch origin main && git rebase origin/main
  git reset --soft origin/main && git commit -F /tmp/commit-msg.txt
  git push --force-with-lease -u origin HEAD
  ```
  `git reset --soft` keeps the working tree and the index; never use `--hard`.
- After any later fix (review feedback, a failed check, `main` moving), squash again into the one commit (`git commit --amend`, or the rebase and soft reset above) and push with `git push --force-with-lease`. Never use plain `--force`, and never force-push `main`.
- Never create merge commits. Set this once per clone (`issue-start` does it):
  ```sh
  git config pull.rebase true
  git config merge.ff only
  ```
- Stage files by path. Never use `git add -A`, `git add .`, `git stash` or `git clean`.
- Never commit secrets, `.env` files or build output. `.gitignore` covers the usual ones; check `git status` before committing.
- The pre-commit hook runs Prettier and ESLint (ADR 0002) and must pass. Never use `--no-verify`.

## Where commits go

- All work happens on an issue branch, `<prefix>/issue-<N>-<slug>` (see `issue-start`), and reaches `main` only through a PR that the auto-merge workflow squash-merges on green CI (`issue-finish`, ADR 0012). The repository allows squash merges only. The squash commit's subject is the PR title, `<prefix>: <summary> (#N)`, and its body is the PR body, so `main` stays a linear list of one commit per PR.
- Do not commit to `main` directly. The only exception was the bootstrap commit that created the repository's first content.
- Do not rewrite pushed history on `main`. On your own issue branch, rewriting is expected: push with `git push --force-with-lease` after every rebase or squash.
