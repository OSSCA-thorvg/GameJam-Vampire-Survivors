# Documentation sync rules

Documentation is updated in the **same PR** as the change that makes it stale. A PR that leaves any of these out of date is not ready to merge. The `issue-finish` skill checks this before opening the PR, and CI checks that `CLAUDE.md` mentions every rule and skill.

| When this changes | Update |
|---|---|
| A script in `package.json`, a tool, or how to run, test or build something | `CLAUDE.md` § Commands, with the exact commands, including how to run a single test |
| Package layout, threads, rendering, simulation, protocol, content or asset conventions | `CLAUDE.md` § Architecture (a summary that points to the ADR) |
| An ADR is added or superseded | `docs/adr/README.md`, and the `CLAUDE.md` summary if the decision changes a rule stated there |
| A rule file in `.claude/rules/` or a skill in `.claude/skills/` is added, renamed or removed | `CLAUDE.md` § Workflow (rules list) or § Skills |
| Workflow, label, branch, commit or PR conventions | the matching `.claude/rules/*.md`, the skills that apply them, and `CLAUDE.md` § Workflow |
| The project's state (for example, the first code lands, or a phase completes) | `CLAUDE.md` § Project "Current state" line |
| Issues are added, split, dropped or renumbered | `docs/roadmap.md` |
| An asset ID is added or its art is replaced | `assets/CATALOG.md` (the status column) and `assets/manifest.json` |
| A gameplay behaviour is observed or verified against the original | `docs/reference/gameplay.md`, with the source |
| A server environment variable or port | `.env.example`, `compose.yaml`, and `CLAUDE.md` § Commands if usage changes |
| A user-facing feature is added or its behaviour, entry points or preconditions change | its file in the verification map, `.claude/skills/verify-game/features/` (once `verify-game` exists; `.claude/rules/verification.md`) |
| A file kind gains a fixed conflict resolution, or a generated file, lockfile or index-like doc is added | the table in `.claude/rules/conflicts.md`, and `resolve-conflicts` if the procedure changes |
| A new kind of consumer or hidden coupling (a new message channel, ID namespace, generated file or CI check) | the "Where breakage hides" list in `.claude/skills/impact-check/SKILL.md` |

## How to keep CLAUDE.md useful

- `CLAUDE.md` summarizes and points to the source of truth (ADRs, rules, skills). It does not duplicate their full text.
- Commands must be real: never list a command before the PR that creates it is merged. Remove commands that no longer exist.
- Keep it short. If a section grows into a reference, move the detail into a rule or an ADR and link to it.
- When you notice `CLAUDE.md` is wrong while working on an unrelated issue, fix it in that PR and mention it in the PR body.
