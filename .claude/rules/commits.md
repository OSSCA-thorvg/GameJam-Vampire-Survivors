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

- One logical change per commit. Formatting-only churn goes in its own commit.
- Stage files by path. Never use `git add -A`, `git add .`, `git stash` or `git clean`.
- Never commit secrets, `.env` files or build output. `.gitignore` covers the usual ones; check `git status` before committing.
- The pre-commit hook runs Prettier and ESLint (ADR 0002) and must pass. Never use `--no-verify`.

## Where commits go

- All work happens on an issue branch, `<prefix>/issue-<N>-<slug>` (see `issue-start`), and reaches `main` only through a squash-merged PR (`issue-finish`). The squash commit's subject is the PR title, `<prefix>: <summary> (#N)`.
- Do not commit to `main` directly. The only exception was the bootstrap commit that created the repository's first content.
- Do not rewrite pushed history on `main`. On your own branch, `git push --force-with-lease` is allowed after a rebase.
