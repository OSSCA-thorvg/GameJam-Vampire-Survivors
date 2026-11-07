---
name: commit
description: Commit work on the current issue branch following .claude/rules/commits.md — English prefixed subject, unwrapped body, path-based staging, pre-commit hook must pass, no AI attribution. Use whenever committing in this repository ("commit this", "커밋해줘").
---

# commit

Rules: `.claude/rules/commits.md`.

## Steps

1. Check where you are:
   ```sh
   git branch --show-current
   git status --short
   ```
   - On `main`: stop. Create or switch to the issue branch with `issue-start`.
   - On a branch without an issue number: ask which issue the work belongs to.
2. Review what will be committed with `git diff` and `git diff --staged`. Unrelated changes go in a separate commit or stay uncommitted. Never commit secrets, `.env` files or build output.
3. Stage by path only:
   ```sh
   git add packages/client/src/worker/loop.ts packages/client/src/worker/loop.test.ts
   ```
4. Write the message to a scratch file outside the repository:
   - subject: `<prefix>: <imperative summary>`, at most 72 characters;
   - body: why, what changed at the behaviour level, how it was validated, and `Refs #N`; one line per paragraph or bullet;
   - no AI attribution and no `Co-Authored-By` trailers.

   Check that no paragraph or bullet is split across lines. If the dw plugin is installed, its `commit-conventions` skill ships a `validate_body.py` script that checks this; run it on the message file.

5. Commit:
   ```sh
   git commit -F /tmp/commit-msg.txt
   ```
   The pre-commit hook runs Prettier and ESLint on the staged files.
   - If it fails, fix the reported problems, re-stage the same paths, and commit again. Never use `--no-verify`.
   - If the hook reformatted files, re-stage them and commit again.
6. Work-in-progress commits on the issue branch are fine. A PR branch, however, must be **one** commit rebased onto `origin/main` (ADR 0012), so before pushing for a PR, squash (this is also `issue-finish` step 8):
   ```sh
   git fetch origin main && git rebase origin/main
   git reset --soft origin/main && git commit -F /tmp/commit-msg.txt   # subject = PR title, body = PR summary
   git push --force-with-lease -u origin HEAD
   ```
   - `git reset --soft` keeps the working tree and the index. Never use `--hard`.
   - For a fix after the PR is open, commit it, then squash it into the one commit again (`git commit --amend`, or the soft reset above) and `git push --force-with-lease`. Never use plain `--force`, and never push to `main`.
   - If the rebase stops on a conflict, resolve it with the `resolve-conflicts` skill (`.claude/rules/conflicts.md`). Never resolve by merging `main` into the branch.
