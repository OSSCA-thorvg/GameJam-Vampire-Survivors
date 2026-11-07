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

   If the `dw` plugin is installed, validate the wrapping:
   ```sh
   python3 "$HOME/.claude/plugins/marketplaces/lablup-marketplace/plugins/dw/skills/commit-conventions/scripts/validate_body.py" /tmp/commit-msg.txt
   ```
5. Commit:
   ```sh
   git commit -F /tmp/commit-msg.txt
   ```
   The pre-commit hook runs Prettier and ESLint on the staged files.
   - If it fails, fix the reported problems, re-stage the same paths, and commit again. Never use `--no-verify`.
   - If the hook reformatted files, re-stage them and commit again.
6. Push when the user asks, or as part of `issue-finish`:
   ```sh
   git push -u origin HEAD
   ```
