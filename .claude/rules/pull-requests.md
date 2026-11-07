# Pull request rules

The `issue-finish` skill applies these. Writing conventions follow `dw:commit-conventions` and `dw:gh-workflow`.

- **One PR per issue.** It is opened from the issue branch, and its body contains `Closes #N`. A PR without an issue is not allowed; create the issue first (`issue-create`).
- **Title:** `<prefix>: <imperative summary> (#N)`, in English, at most 72 characters. The `(#N)` suffix is required; tooling uses it to find the PR for an issue.
- **Body:** English, no hard wraps, passed with `--body-file`, about 250 words. Contents:
  - what changed at the behaviour level;
  - **How to verify**: exact commands or browser steps;
  - **ADRs**: the ADRs it follows, plus any it adds or supersedes;
  - `Closes #N`.

  Do not narrate the diff file by file, and do not add AI attribution.
- **Labels:** the same `type:*`, `priority:*`, `area:*` and `phase:*` as the issue, applied with `gh issue edit <PR>`.
- **Gate before merge:**
  - every acceptance criterion in the issue is demonstrably met;
  - `pnpm check` passes locally;
  - documentation is in sync per `.claude/rules/docs-sync.md`, including `CLAUDE.md`;
  - the `security-check` skill reports no open **high** finding, when the PR touches dependencies, the lockfile, the server, the protocol, Docker, CI or DOM rendering of user data (`.claude/rules/security.md`);
  - CI is green.
- **Merge:** squash-merge immediately once the gate passes (`gh pr merge --squash --delete-branch`). This project does not wait for human review. Never merge with failing or pending checks. Never bypass branch protection.
- **After merge:**
  - the issue is labelled `status:done`;
  - dependents whose dependencies are now all closed move from `status:blocked` to `status:ready`;
  - local `main` is fast-forwarded.
- A PR that introduces a decision binding later work includes its ADR (`adr-new`). A PR that contradicts an accepted ADR without superseding it must not be merged.
