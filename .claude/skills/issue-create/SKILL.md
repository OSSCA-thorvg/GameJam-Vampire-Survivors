---
name: issue-create
description: Register a GitHub issue in this repository with the project's body template, including a detailed implementation plan, and the required labels (status, type, priority, phase, area). Use when the user asks to file, register, or add an issue, or when breaking planned work into issues.
---

# issue-create

Issues are written in English. Each issue is one PR's worth of work, and its **Implementation plan** section is mandatory and detailed: an implementer should be able to follow it without making design decisions. If the plan cannot be made concrete, the issue is not ready.

Writing rules follow `dw:commit-conventions`: no hard-wrapped paragraphs (one paragraph or bullet per physical line), and the body is passed with `--body-file`, never `--body`. Its word budget does not apply to the Implementation plan section, which is meant to be long.

## Steps

1. Run the access check from the `label-sync` skill (step 1). If labels are missing on GitHub, run `label-sync` first.
2. Search for duplicates. If a matching issue exists, show it to the user instead of creating a new one:
   ```sh
   gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --state all --search "<keywords>"
   ```
3. Collect the inputs. Find the related `REQUIREMENTS.md` items and ADRs (`docs/adr/README.md`). If the work needs a decision no ADR covers, create the ADR first with `adr-new`, or create the issue as `status:blocked` and say which decision is missing.
4. Write the body in a scratch file outside the repository, using this template:
   ```markdown
   ## Goal
   One or two sentences: what exists after this issue that did not before.

   ## Context
   - Requirements: REQUIREMENTS.md #<n>, …
   - ADRs: 0004, 0007, …  (paths under docs/adr/)
   - Reference: docs/reference/gameplay.md § <section> (gameplay issues)

   ## Implementation plan
   - **Files and modules:** the paths to create or change, and what each owns.
   - **Types and data:** interfaces, data shapes, message types and constants, with field names.
   - **Algorithm and flow:** the steps in order, including per-frame vs one-time work, which thread runs it, and edge cases.
   - **Integration:** how it plugs into existing systems (which functions call it, which messages carry it).
   - **Tests:** which unit tests to write, and what to check manually in the browser.
   - **Security:** (required when the issue touches the server, the protocol, dependencies, Docker, CI, or renders user data in the DOM) which rules of `.claude/rules/security.md` apply and how the plan satisfies them.

   ## Acceptance criteria
   - [ ] Observable behaviour or test that proves it.

   ## Out of scope
   - What a reader might expect here but belongs elsewhere (#N).

   ## Depends on
   - #N (or "none")
   ```
   Every acceptance criterion must be checkable by running something or looking at something.
5. If the `dw` plugin is installed, validate the wrapping:
   ```sh
   python3 "$HOME/.claude/plugins/marketplaces/lablup-marketplace/plugins/dw/skills/commit-conventions/scripts/validate_body.py" /tmp/issue-body.md
   ```
6. Pick the labels from `.github/labels.json` (meanings in `.claude/rules/labels.md`): exactly one `type:*`, one `priority:*` and one `phase:*`, at least one `area:*`, and `status:ready`. Use `status:blocked` instead while an issue under "Depends on" is still open.
7. Create the issue:
   ```sh
   gh issue create -R OSSCA-thorvg/GameJam-Vampire-Survivors \
     --title "<imperative title>" --body-file /tmp/issue-body.md \
     --label "status:ready" --label "type:enhancement" --label "priority:high" \
     --label "phase:1-core-loop" --label "area:gameplay"
   ```
   Title: an imperative summary without a prefix and at most 72 characters, for example `Spawn enemies from the wave table`.
8. Verify the labels with `gh issue view <N> --json labels -q '[.labels[].name]'`, then report the URL. When creating several issues that depend on each other, create them in dependency order so "Depends on" can cite real numbers, and record the numbers in `docs/roadmap.md`.
