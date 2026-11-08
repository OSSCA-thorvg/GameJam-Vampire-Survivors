# Issue rules

The `issue-create`, `issue-start` and `issue-finish` skills apply these. Label meanings are in `labels.md`.

- **Every piece of work is an issue first.** No branch, commit or PR exists without one.
- **Language and title:** English. The title is an imperative summary of at most 72 characters, with no prefix.
- **Body template:** Goal, Before you start, Context, Implementation plan, How to verify, Acceptance criteria, Out of scope, Depends on, Size (the full template is in `issue-create`, and `.github/ISSUE_TEMPLATE/task.md` mirrors it for issues filed from the web UI).
- **The implementation plan is mandatory and detailed:** files and modules, types with field names, the algorithm and flow including which thread runs it, integration points, and tests. An implementer must not need to make design decisions. A plan that needs a new binding decision is preceded by an ADR, or the issue waits as `status:blocked`.
- **Acceptance criteria are verifiable** by a test, a command or a visible browser behaviour. "Works well" is not a criterion.
- **Size:** one squash-mergeable PR, stated as `Size: S | M | L`. If the plan spans unrelated systems, split the issue.
- **Readiness:** an issue is `status:ready` only when it meets the readiness standard below.
- **Labels:** exactly one each of `status:*`, `type:*`, `priority:*` and `phase:*`, plus at least one `area:*`, from `.github/labels.json` only.
- **Status flow:**
  - `ready` → `in-progress` (`issue-start`, the only entry point: assignee, worktree, and a start comment with the `<!-- issue-start -->` marker, which CI checks);
  - `in-progress` → `review` (PR opened);
  - `review` → `done` (merged and closed).

  `blocked` while a dependency is open or a decision is pending, with a comment saying why. Abandoned work goes back to `ready` with a comment.

- **Dependencies** are listed as `#N` under "Depends on".
  - The prerequisite gate in `issue-start` is mandatory. Do not start an issue while any of them is open, or while an artifact they promised is missing on `main`. In that case, stop, comment, and set `status:blocked`.
  - Never work around a missing prerequisite by implementing it inside another issue.
  - CI enforces the same rule on PRs: the `PR rules` job fails while the linked issue has an open dependency.
- **Read the whole thread:** whoever implements an issue reads the body and every comment before starting, and again before the PR. A comment that revises the plan overrides the body.
- **Plan changes:** when implementation reveals that the plan was wrong, update the issue body (or add a comment saying what changed and why) before the PR. Later issues are written against what was merged, not the old plan.
- **Roadmap:** `docs/roadmap.md` maps roadmap IDs to issue numbers. Update it when issues are added, split or dropped.

## Problems found during implementation

Triage every problem noticed while implementing an issue before the PR is opened:

- **Blocking, or needs a user decision:** stop and ask the user. Record the answer in the issue, or in an ADR if it binds later work (`adr-new`).
- **Not needed for this issue's acceptance criteria, and not urgent:** create a follow-up issue with `issue-create`:
  - it meets the readiness standard below;
  - it cites the issue and PR where the problem was found;
  - its priority reflects the impact;
  - it is `status:ready` or `status:blocked` per its dependencies.

  Do not widen the current PR to fix it.

- **Already covered by another open issue:** comment on that issue with the finding and the PR link, instead of creating a duplicate.

The PR lists what was created or commented on under `## Follow-ups`, as plain `#N` references, never after a closing keyword (`pull-requests.md`).

## Readiness standard

Contributors use Claude Code or Codex with their own GitHub account, possibly without the `dw` plugin, in a fresh session with no memory of this project's history. An issue is `status:ready` only when a fresh session in a fresh clone, following `issue-start` (Codex uses the adapters in [AGENTS.md](../../AGENTS.md)), can finish it to an auto-merged PR without asking a single question. `issue-create` runs this checklist before creating an issue; an item that cannot be met makes the issue `status:blocked`, with a comment naming the item.

1. **ADR constraints are restated inline.** For every ADR cited, the 1–3 constraints that matter for this issue are restated in the issue with the ADR link, and so are the user decisions that bind it (time limit, win rules, evolution gate, and so on).
2. **A "Before you start" section** comes right after Goal and lists:
   - the setup commands to run once: `nvm use`, `corepack enable`, `pnpm install`, plus `pnpm server:up` if the server is needed;
   - what to read: ADRs, `docs/reference/gameplay.md` sections, `assets/CATALOG.md`, verification map files;
   - which skills to use: `issue-start`, `impact-check`, `verify-game`, `issue-finish`, and `security-check` when it applies.
3. **Dependency artifacts are named exactly:** paths, exported symbols, message types and field names from earlier issues, matching what those issues' plans say they create. When they do not match, fix the later issue.
4. **No undecided choices remain.** The implementation plan contains no "or", "e.g.", "TBD", "consider" or "could": one option is picked, consistent with the ADRs. Gameplay numbers are concrete and labelled "initial value, tune against footage".
5. **The plan is in build order,** so each step can be compiled and tested before the next.
6. **A "How to verify" section** comes before Acceptance criteria: the exact commands, the browser actions or `verify-game` feature-map journeys, the expected observations, and the proof level each criterion needs: level 5 for user-visible behaviour and level 4 for the safety fact (`verification.md`). Debug keys from #2 may be used only to reach preconditions.
7. **Docs-sync items are acceptance criteria.** Each `docs-sync.md` target the issue touches is listed as a criterion: `CLAUDE.md` Commands and Architecture, `assets/CATALOG.md` and the manifest, the verification map feature file, `docs/reference/gameplay.md` observations, `.env.example`.
8. **Nothing depends on a particular machine, account or plugin:** `gh` runs with the contributor's own account, `dw`-plugin tools are optional ("if the dw plugin is installed"), and there are no absolute paths outside the repository.
9. **A size line:** `Size: S | M | L` (S is under half a day, M about a day, L 2–3 days). An L issue says why it is not split.
10. **Format:** the section order is Goal, Before you start, Context, Implementation plan, How to verify, Acceptance criteria, Out of scope, Depends on, Size. English, no hard-wrapped paragraphs, and `#N` references that match the issue's actual dependencies.
