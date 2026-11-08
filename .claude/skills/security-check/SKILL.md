---
name: security-check
description: Security pass for a branch before its PR — vet dependencies, run pnpm audit, scan dangerous patterns, check server and CI hardening, then run the security review for the current runtime. Use before opening any PR that touches dependencies, the lockfile, pnpm-workspace.yaml, packages/server, the protocol, Docker files, CI workflows, or DOM rendering of user data ("security check", "보안 점검").
---

# security-check

Policy: `docs/adr/0011-security-baseline.md`. Checklist: `.claude/rules/security.md`. This skill reports findings; any **high** finding blocks the merge until it is fixed or accepted in an issue by the user. Because the auto-merge workflow merges a PR as soon as CI is green (ADR 0012), CI passing is not a hold: an open PR with a high finding must carry the `status:blocked` label until the finding is resolved.

Prefer running it in a subagent briefed with the branch name, the issue and this file. The main session reads the report.

## Steps

1. Collect the diff against `main`:
   ```sh
   git fetch origin main
   git diff --name-only origin/main...HEAD
   git diff origin/main...HEAD -- package.json 'packages/*/package.json' pnpm-workspace.yaml pnpm-lock.yaml
   ```
2. **Supply-chain settings.** In `pnpm-workspace.yaml`:
   - `minimumReleaseAge` is still `10080`;
   - every `minimumReleaseAgeExclude` entry has a reason comment and an issue link;
   - every `allowBuilds` entry set to `true` has a reason.

   Any violation is **high**.

3. **New or upgraded dependencies.** For each package added or bumped in a `package.json`:

   ```sh
   pnpm why <pkg>
   npm view <pkg> time.modified maintainers dependencies dist-tags --json
   npm view <pkg>@<resolved-version> time --json   # confirm the resolved version is ≥ 7 days old
   ```

   Check:
   - the PR body justifies it;
   - it is not a typo-squat of a well-known name;
   - it has more than one maintainer or is a well-known package;
   - it has no install scripts unless `allowBuilds` decides them;
   - its transitive dependency count is reasonable.

   Flag runtime dependencies added to `packages/client` other than `@thorvg/webcanvas` as **high**.

4. **Known advisories:**
   ```sh
   pnpm install --frozen-lockfile && pnpm audit --audit-level=high
   ```
   A high or critical advisory is **high**, unless an open issue explicitly accepts it.
5. **Pattern scan** of the added lines:
   ```sh
   git diff origin/main...HEAD -U0 | grep -nE '^\+.*(innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setTimeout\(\s*["'"'"'`])'
   git diff origin/main...HEAD -U0 | grep -niE '^\+.*(api[_-]?key|secret|token|password|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})'
   git diff --name-only origin/main...HEAD | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'
   ```
   DOM sinks or `eval` carrying data are **high**. Secrets or committed `.env` files are **high**; treat a leaked secret as compromised and tell the user to rotate it.
6. **Server and protocol changes.** Confirm each rule in `.claude/rules/security.md` § Server with a pointer to the code or test that enforces it:
   - size limit before parse;
   - schema validation and close with 1008;
   - per-connection rate limit;
   - connections-per-IP limit;
   - `Origin` allow-list;
   - join lockout;
   - nickname normalization;
   - no body logging.

   A missing control is **high**; a missing test for a present control is **medium**.

7. **CI and Docker changes:**
   ```sh
   grep -nE '^\s*-?\s*uses:' .github/workflows/*.yml | grep -vE '@[0-9a-f]{40}( |$)'   # must print nothing
   ```
   Check:
   - `permissions` is minimal;
   - checkout uses `persist-credentials: false`;
   - no `pull_request_target` runs on untrusted code;
   - the Dockerfile runtime stage runs as `node`, holds production dependencies only, and contains no `COPY .env` or `ARG`/`ENV` holding a secret.
8. **CSP.** If the client starts talking to a new origin, or loads a new kind of resource, the CSP in ADR 0011 and the deployed header or meta tag must be updated in the same PR.
9. Run the additional review for the current agent runtime and merge its findings with the steps above:
   - **Claude Code:** run the built-in `/security-review` on the branch.
   - **Codex:** follow [AGENTS.md's Codex equivalents](../../../AGENTS.md#codex-equivalents). Use the available `interrogate` skill with an explicit security scope covering ADR 0011 and `.claude/rules/security.md`. If the skill or its review tooling is unavailable, perform an independent checklist review and report the unavailable tools and checks actually run. Keep findings from steps 1–8 even if the additional review cannot reproduce them. The high-severity hold below still applies.
10. Report a table of severity (high / medium / low), location, finding and fix. Post it as a PR comment with `--body-file` when the PR exists. Never merge by hand; instead:
    - If the PR is not open yet, do not open it while any **high** finding is open.
    - If the PR is open and any **high** finding is open, hold it at once: `gh issue edit <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --add-label status:blocked`. The workflow never merges a PR with that label.
    - Once every high finding is fixed (squashed into the branch's one commit and pushed with `--force-with-lease`) or accepted in an issue by the user, release the hold: remove the label and re-run the PR's latest CI run (`gh run rerun <run-id>`, the id from `gh run list --workflow ci.yml --branch <branch> --limit 1`), or push a commit.
