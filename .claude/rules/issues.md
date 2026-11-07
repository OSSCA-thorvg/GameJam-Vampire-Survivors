# Issue rules

The `issue-create`, `issue-start` and `issue-finish` skills apply these. Label meanings are in `labels.md`.

- **Every piece of work is an issue first.** No branch, commit or PR exists without one.
- **Language and title:** English. The title is an imperative summary of at most 72 characters, with no prefix.
- **Body template:** Goal, Context (REQUIREMENTS items, ADRs, gameplay reference section), **Implementation plan**, Acceptance criteria, Out of scope, Depends on.
- **The implementation plan is mandatory and detailed:** files and modules, types with field names, the algorithm and flow including which thread runs it, integration points, and tests. An implementer must not need to make design decisions. A plan that needs a new binding decision is preceded by an ADR, or the issue waits as `status:blocked`.
- **Acceptance criteria are verifiable** by a test, a command or a visible browser behaviour. "Works well" is not a criterion.
- **Size:** one squash-mergeable PR. If the plan spans unrelated systems, split the issue.
- **Labels:** exactly one each of `status:*`, `type:*`, `priority:*` and `phase:*`, plus at least one `area:*`, from `.github/labels.json` only.
- **Status flow:**
  - `ready` → `in-progress` (`issue-start`, with an assignee);
  - `in-progress` → `review` (PR opened);
  - `review` → `done` (merged and closed).

  `blocked` while a dependency is open or a decision is pending, with a comment saying why. Abandoned work goes back to `ready` with a comment.
- **Dependencies** are listed as `#N` under "Depends on". Do not start an issue while any of them is open.
- **Plan changes:** when implementation reveals that the plan was wrong, update the issue body (or add a comment saying what changed and why) before the PR. Later issues are written against what was merged, not the old plan.
- **Roadmap:** `docs/roadmap.md` maps roadmap IDs to issue numbers. Update it when issues are added, split or dropped.
