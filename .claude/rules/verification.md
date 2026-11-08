# Verification rules

Adapted from the user's `pstack` skills `blast-radius` (impact and proof levels) and `create-verification-skill` (driving the real app). The `impact-check` skill applies the first, and the `verify-game` skill (#31) the second. `issue-start` and `issue-finish` run them.

The auto-merge workflow merges a PR as soon as CI is green (ADR 0012), so all of this is done **before** the PR is opened, or the PR is opened with the `status:blocked` hold until it is.

## Scope is checked before code is written

- `issue-start` runs `impact-check` in **scope** mode. It lists:
  - what the issue changes;
  - who else consumes those things: worker messages, protocol messages, content IDs, asset IDs, pools and caps, config, and env vars;
  - the **one fact the change is safe because of**.

  This goes in the issue's start comment.

- If the scope turns out larger than the issue's plan (for example, it changes a protocol message that other issues rely on), update the issue body or split the issue before coding (`.claude/rules/issues.md`).

## Every change is run, not just read

- **A PR that changes code is verified by running it.** A documentation or config-only PR is verified by running the checks it affects (for example the CI `repo rules` steps) locally, and says so.
  - Unit tests and `pnpm check` are necessary but not sufficient.
  - Each acceptance criterion is shown with evidence from the real app, driven the way a user would through `verify-game`: the browser for the client, the Docker container for the server.
  - `verify-game` has two drivers behind the same feature map: **Claude in Chrome** (the `mcp__claude-in-chrome__*` tools: real Chrome and GPU, preferred in an interactive Claude Code session) and **Playwright** (`pnpm verify:e2e` and the feature files' specs: headless, CI, and the fallback when the extension is not installed or connected). CI's `verify` job runs the Playwright smoke journey on every PR.
- **Proof levels** (from `blast-radius`); every claim in the PR says which level it reached:
  1. said so: worthless on its own;
  2. pointed at the line: a real `file:line`;
  3. walked the failure step by step and showed it cannot happen;
  4. ran it: a test or script calling the real code that fails loudly if wrong;
  5. reproduced it in the running app.

  The safety fact from `impact-check` must reach **level 4**. User-visible acceptance criteria must reach **level 5**.

- **What counts as evidence:**
  - the user action and the resulting state, not only the final screen;
  - side effects checked too (messages sent, server room state, files);
  - screenshots plus console and worker logs for the client;
  - command output and `/healthz` or WebSocket transcripts for the server.

  Use real user paths, not test-only setters. Dev debug keys (the dev-only debug-tools module from #2) are allowed only to reach a precondition, such as fast-forwarding to 5:00. The behaviour under test is then driven normally.

- **Where evidence goes:** files under `verification/issue-<N>/` (git-ignored, never committed). The PR body summarizes them in a **Verification** section: the feature map entries driven, the proof level of each criterion, and the commands run with their key output or attached screenshots. Re-run the evidence after a rebase that changed the code under test.
- **A failing journey is reported, never weakened.** If a precondition is missing, say so, and note it in the feature's `Gotchas`.
- **Before `verify-game` existed** (until #31 merged), PRs were verified by running the app manually with the same evidence standard. Before the app exists at all (roadmap F1 and F2), level 4 is the ceiling: say which criteria could not reach level 5 and why.

## The verification map is maintained

- `.claude/skills/verify-game/features/` holds one file per user-facing feature, following the entry contract in its `README.md`. Each file says how to reach the feature, how to drive it with each driver, what proves it works, and its gotchas.
- A PR that adds or changes user-facing behaviour updates its feature file in the same PR (`docs-sync.md`). A behaviour without a map entry is not verified.
- A PR that touches a feature verifies every entry point the map lists for it, not just the convenient one.
