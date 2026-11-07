---
name: issue-create
description: Register a GitHub issue in this repository with the project's body template, including a detailed implementation plan, and the required labels (status, type, priority, phase, area). Use when the user asks to file, register, or add an issue, or when breaking planned work into issues.
---

# issue-create

Issues are written in English. Each issue is one PR's worth of work, and its **Implementation plan** section is mandatory and detailed: an implementer should be able to follow it without making design decisions. If the plan cannot be made concrete, the issue is not ready. The readiness standard in `.claude/rules/issues.md` defines "ready".

Writing rules (`.claude/rules/commits.md`; the same as `dw:commit-conventions` if the dw plugin is installed): no hard-wrapped paragraphs (one paragraph or bullet per physical line), and the body is passed with `--body-file`, never `--body`. There is no word budget for issues; the Implementation plan section is meant to be long.

## Steps

1. Run the access check from the `label-sync` skill (step 1). If labels are missing on GitHub, run `label-sync` first.
2. Search for duplicates. If a matching issue exists, show it to the user instead of creating a new one:
   ```sh
   gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --state all --search "<keywords>"
   ```
3. Collect the inputs. Find the related `REQUIREMENTS.md` items and ADRs (`docs/adr/README.md`). If the work needs a decision no ADR covers, create the ADR first with `adr-new`, or create the issue as `status:blocked` and say which decision is missing.
4. Write the body in a scratch file outside the repository (for example `/tmp/issue-body.md`), using this template. It follows the readiness standard in `.claude/rules/issues.md`, and `.github/ISSUE_TEMPLATE/task.md` mirrors it:
   ```markdown
   ## Goal

   One or two sentences: what exists after this issue that did not before.

   ## Before you start

   - Setup, once per clone: `nvm use`, `corepack enable`, `pnpm install` (plus `pnpm server:up` when the server is needed).
   - Read: `CLAUDE.md`, the ADRs below, docs/reference/gameplay.md § <section>, `assets/CATALOG.md`, the verification map files.
   - Skills: `issue-start`, `impact-check`, `verify-game` (once #31 has merged), `issue-finish`, `security-check` (when it applies).

   ## Context

   - Requirements: REQUIREMENTS.md #<n>, …
   - ADRs, each with the 1–3 constraints that bind this issue restated: [0004](docs/adr/0004-….md): …
   - User decisions that bind this issue, with their dates.
   - From earlier issues: the exact paths, exported symbols, message types and field names this issue builds on (#N).

   ## Implementation plan

   Numbered steps in build order, so each can be compiled and tested before the next. Across them, cover:

   - **Files and modules:** the paths to create or change, and what each owns.
   - **Types and data:** interfaces, data shapes, message types and constants, with field names.
   - **Algorithm and flow:** per-frame vs one-time work, which thread runs it, and edge cases.
   - **Integration:** how it plugs into existing systems (which functions call it, which messages carry it).
   - **Tests:** which unit tests to write.
   - **Security:** (required when the issue touches the server, the protocol, dependencies, Docker, CI, or renders user data in the DOM) which rules of `.claude/rules/security.md` apply and how the plan satisfies them.

   ## How to verify

   - The exact commands, browser actions or `verify-game` journeys, and the expected observations.
   - The proof level each criterion needs: 5 for user-visible behaviour, 4 for the safety fact (`.claude/rules/verification.md`).

   ## Acceptance criteria

   - [ ] Observable behaviour or test that proves it.
   - [ ] Each docs-sync target this issue touches (`CLAUDE.md` Commands or Architecture, `assets/CATALOG.md` and the manifest, the verification map feature file, `docs/reference/gameplay.md`, `.env.example`) is updated.

   ## Out of scope

   - What a reader might expect here but belongs elsewhere (#N).

   ## Depends on

   - #N (or "none")

   ## Size

   S | M | L (S under half a day, M about a day, L 2–3 days; an L says why it is not split)
   ```
   Every acceptance criterion must be checkable by running something or looking at something.
5. **Run the readiness checklist** (`.claude/rules/issues.md` § Readiness standard) against the draft, item by item: ADR constraints restated, Before you start, exact dependency artifacts, no "or", "e.g.", "TBD", "consider" or "could" left in the plan, build order, How to verify with proof levels, docs-sync criteria, portability (no machine, account or plugin assumptions, no absolute paths outside the repository), the size line, and the section order. Fix every item you can. If an item cannot be met (a decision is missing, or a dependency's artifacts are not known yet), the issue is created as `status:blocked` in step 7, and step 8 comments which item is unmet and why.
6. Check the wrapping: no paragraph or bullet is split across lines. If the dw plugin is installed, its `commit-conventions` skill ships a `validate_body.py` script that checks this; run it on the body file.
7. Pick the labels from `.github/labels.json` (meanings in `.claude/rules/labels.md`): exactly one `type:*`, one `priority:*` and one `phase:*`, at least one `area:*`, and `status:ready`. Use `status:blocked` instead while an issue under "Depends on" is still open, or when step 5 left a readiness item unmet. Create the issue:
   ```sh
   gh issue create -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --title "<imperative title>" --body-file /tmp/issue-body.md \
     --label "status:ready" --label "type:enhancement" --label "priority:high" \
     --label "phase:1-core-loop" --label "area:gameplay"
   ```
   Title: an imperative summary without a prefix and at most 72 characters, for example `Spawn enemies from the wave table`.
8. If the issue was created as `status:blocked`, comment why (`gh issue comment <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --body-file /tmp/blocked.md`): the open dependency, or the readiness item that is unmet.
9. Verify the labels with `gh issue view <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --json labels -q '[.labels[].name]'`, then report the URL. When creating several issues that depend on each other, create them in dependency order so "Depends on" can cite real numbers, and record the numbers in `docs/roadmap.md`.
