# Pull request rules

The `issue-finish` skill applies these. Writing conventions are those of `commits.md` (they match the dw plugin's `commit-conventions` and `gh-workflow` if the dw plugin is installed, but nothing here needs it).

- **One PR per issue.** It is opened from the issue branch, and its body contains `Closes #N`. A PR without an issue is not allowed; create the issue first (`issue-create`).
- **Title:** `<prefix>: <imperative summary>`, in English, at most 72 characters, with **no** `(#N)` suffix, for example `feat: Spawn enemies from the wave table`. GitHub appends ` (#<PR>)` to the squash commit's subject itself, so a suffix in the title produced subjects like `… (#28) (#29)`. The issue link comes from `Closes #N` in the body. CI (`PR rules`) rejects a title that does not match `^(feat|fix|update|refactor|test|docs|chore): .+`, that ends in `(#N)`, or that is longer than 72 characters.
- **Body:** English, no hard wraps, passed with `--body-file`, with a summary of about 250 words; the Impact, Verification and Conflicts sections come on top of it and stay as short as their evidence allows. Contents:
  - what changed at the behaviour level;
  - **How to verify**: exact commands or browser steps;
  - **Impact**: the `impact-check` proof-mode report: the one safety fact with its proof level and proof, the risks, and what was cleared (`.claude/rules/verification.md`);
  - **Verification**: each acceptance criterion with the proof level it reached and its evidence from running the real app (commands with key output, or screenshots);
  - **Conflicts**: the files that conflicted with `main` and how each was resolved, or "none" (`.claude/rules/conflicts.md`);
  - **ADRs**: the ADRs it follows, plus any it adds or supersedes;
  - `Closes #N`.

  Do not narrate the diff file by file, and do not add AI attribution.

- **One rebased commit:** the PR branch is exactly one commit on top of the current `origin/main`, with no merge commits. Its subject is the PR title and its body the PR summary (`.claude/rules/commits.md`). After every fix or every move of `main`, rebase (`resolve-conflicts` when it conflicts), squash again and `git push --force-with-lease`. CI (`PR rules`) and the `main` ruleset (strict up-to-date checks, linear history) both refuse a branch that is behind `main`.
- **Using `gh`:** run it with your own account (`gh auth status`). Always pass `--json <fields>` to `gh issue view` and `gh pr view`, and pass bodies with `--body-file`. If `gh pr edit` or `gh issue edit` fails with a missing-scope error (for example `read:org`), make the same change with the REST API, which needs no extra scope:
  ```sh
  gh api -X PATCH repos/OSSCA-thorvg/GameJam-Vampire-Survivors/pulls/<PR> -F body=@/tmp/pr-body.md       # PR title (-f title=...) or body
  gh api -X POST repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N>/labels -f 'labels[]=status:blocked'   # add a label (issues and PRs)
  gh api -X DELETE repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N>/labels/status:blocked              # remove a label
  ```
- **Labels:** the same `type:*`, `priority:*`, `area:*` and `phase:*` as the issue, applied when the PR is created (`gh pr create --label`), or later with `gh issue edit <PR>`.
- **One closing keyword:** the only closing keyword in the body is the final `Closes #N` line. GitHub links `Closes|Fixes|Resolves #N` anywhere in the body, even inside backticks, and closes that issue on merge (PR #38 closed #2 this way). Never write a closing keyword followed by another issue number; rephrase, for example "the closing line for issue 2". CI fails a body that closes more than one issue.
- **CI enforces the evidence sections:** the `PR rules` job fails unless the body has non-empty `## Impact` and `## Verification` sections. The template's HTML-comment placeholders do not count, so an unfilled template fails.
- **Gate before merge**, all done before auto-merge is enabled (or before a hold is released), because with auto-merge on, green CI merges the PR immediately:
  - every acceptance criterion in the issue is demonstrably met, at the proof level `.claude/rules/verification.md` requires (user-visible criteria run in the real app);
  - the `impact-check` safety fact reached proof level 4, and the PR body carries the **Impact** and **Verification** evidence;
  - the branch is up to date with `origin/main`, with any conflicts resolved per `.claude/rules/conflicts.md` (`resolve-conflicts`);
  - `pnpm check` passes locally;
  - documentation is in sync per `.claude/rules/docs-sync.md`, including `CLAUDE.md`;
  - the `security-check` skill reports no open **high** finding, when the PR touches dependencies, the lockfile, the server, the protocol, Docker, CI or DOM rendering of user data (`.claude/rules/security.md`); a PR that is already open while a high finding is open has auto-merge off and carries `status:blocked`;
  - CI is green.
- **Merge only through native auto-merge, under the `main` ruleset** (ADR 0015). The ruleset (`.github/rulesets/main.json`) requires a PR, the CI checks `pnpm check`, `verify`, `repo rules`, `server image` and `PR rules` green on a branch that is up to date with `main`, linear history and squash merges; it forbids force-pushes to and deletion of `main`, and has no bypass actors, so nobody, admins included, can get around it. This project does not wait for human review.
  - `issue-finish` enables auto-merge with `gh pr merge <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --auto --squash` once every gate above is met; GitHub then squash-merges the PR as soon as the ruleset is satisfied. That is the only merge command anyone runs. If `gh` fails with a missing-scope error, use the `enablePullRequestAutoMerge` GraphQL mutation shown in `issue-finish`.
  - Never merge immediately (`gh pr merge` without `--auto`) and never use the web UI merge button, even with green checks. The ruleset refuses a red or stale PR anyway.
  - **Hold** = auto-merge off. A PR without auto-merge never merges; turn it off on an open PR with `gh pr merge <PR> -R OSSCA-thorvg/GameJam-Vampire-Survivors --disable-auto`, and release the hold by enabling it again. The `status:blocked` label on a PR stays as a visible marker of the hold, but does not stop a merge by itself.
  - A force-push can disable auto-merge: after each one, check `gh pr view <PR> --json autoMergeRequest` and enable it again if it is `null` and the PR is not held.
  - `.github/workflows/pr-feedback.yml` comments once per commit when CI fails on a PR, or passes on a branch that is behind `main`. It never merges.
  - Fork and Dependabot PRs never get auto-merge; they are reviewed and merged by hand, through the same ruleset.
  - Renaming or removing a CI job changes a required check: update `.github/rulesets/main.json` in the same PR (`scripts/github/check-ruleset.mjs` in `repo rules` fails otherwise), and a maintainer re-runs `sh scripts/github/apply-ruleset.sh` after it merges.
- **After merge**, done by `.github/workflows/post-merge.yml` and verified by `issue-finish`:
  - the closed issue is labelled `status:done`, without `status:review` or `status:in-progress`;
  - dependents whose `## Depends on` issues are now all closed move from `status:blocked` to `status:ready`;
  - the push to `main` runs CI there (native auto-merge merges as a user, so no dispatch is needed).

  `issue-finish` then fast-forwards local `main`.

- A PR that introduces a decision binding later work includes its ADR (`adr-new`). A PR that contradicts an accepted ADR without superseding it must not be merged.
