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
- **One rebased commit:** the PR branch is exactly one commit on top of the current `origin/main`, with no merge commits. Its subject is the PR title and its body the PR summary (`.claude/rules/commits.md`). After every fix or every move of `main`, rebase (`resolve-conflicts` when it conflicts), squash again and `git push --force-with-lease`. CI (`PR rules`) and the auto-merge workflow both refuse a branch that is behind `main`.
- **Using `gh`:** run it with your own account (`gh auth status`). Always pass `--json <fields>` to `gh issue view` and `gh pr view`, and pass bodies with `--body-file`. If `gh pr edit` or `gh issue edit` fails with a missing-scope error (for example `read:org`), make the same change with the REST API, which needs no extra scope:
  ```sh
  gh api -X PATCH repos/OSSCA-thorvg/GameJam-Vampire-Survivors/pulls/<PR> -F body=@/tmp/pr-body.md       # PR title (-f title=...) or body
  gh api -X POST repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N>/labels -f 'labels[]=status:blocked'   # add a label (issues and PRs)
  gh api -X DELETE repos/OSSCA-thorvg/GameJam-Vampire-Survivors/issues/<N>/labels/status:blocked              # remove a label
  ```
- **Labels:** the same `type:*`, `priority:*`, `area:*` and `phase:*` as the issue, applied when the PR is created (`gh pr create --label`), or later with `gh issue edit <PR>`.
- **Gate before merge**, all done before the PR is opened (or before its hold is released), because green CI merges it immediately:
  - every acceptance criterion in the issue is demonstrably met, at the proof level `.claude/rules/verification.md` requires (user-visible criteria run in the real app);
  - the `impact-check` safety fact reached proof level 4, and the PR body carries the **Impact** and **Verification** evidence;
  - the branch is up to date with `origin/main`, with any conflicts resolved per `.claude/rules/conflicts.md` (`resolve-conflicts`);
  - `pnpm check` passes locally;
  - documentation is in sync per `.claude/rules/docs-sync.md`, including `CLAUDE.md`;
  - the `security-check` skill reports no open **high** finding, when the PR touches dependencies, the lockfile, the server, the protocol, Docker, CI or DOM rendering of user data (`.claude/rules/security.md`); a PR that is already open while a high finding is open carries `status:blocked`;
  - CI is green.
- **Merge only through the auto-merge workflow** (`.github/workflows/auto-merge.yml`, ADR 0012). It squash-merges a PR as soon as CI succeeds on the PR's latest commit, and comments on the PR instead when CI fails. This project does not wait for human review.
  - Never run `gh pr merge` and never use the web UI merge button, even with green checks. Branch protection is unavailable on this plan, so this rule is the only thing that stops a manual merge.
  - To hold a PR, label it `status:blocked` (`gh pr create --label status:blocked`, or `gh issue edit <PR> --add-label status:blocked`). To release it, remove the label and re-run the PR's latest CI run (`gh run rerun <run-id>`, the id from `gh run list --workflow ci.yml --branch <branch> --limit 1`), or push a commit. The workflow also never merges drafts, but draft PRs need a paid plan for private repositories.
  - Fork and Dependabot PRs are never merged by the workflow; they are reviewed by hand.
- **After merge**, done by the workflow and verified by `issue-finish`:
  - the closed issue is labelled `status:done`, without `status:review` or `status:in-progress`;
  - dependents whose `## Depends on` issues are now all closed move from `status:blocked` to `status:ready`;
  - CI is dispatched on `main`.

  `issue-finish` then fast-forwards local `main`.
- A PR that introduces a decision binding later work includes its ADR (`adr-new`). A PR that contradicts an accepted ADR without superseding it must not be merged.
