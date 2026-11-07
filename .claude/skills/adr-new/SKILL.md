---
name: adr-new
description: Write a new Architecture Decision Record in docs/adr/ from the template, register it in the index, and mark any ADR it supersedes. Use whenever a choice is made that later issues must follow (library, protocol, data format, threading, art rules), or when changing an accepted decision.
---

# adr-new

Rules are in `docs/adr/0001-record-architecture-decisions.md`.

## Steps

1. Check `docs/adr/README.md` for an existing ADR on the topic. If one exists and the decision is changing, this is a supersede (step 5).
2. Take the next number: the highest `NNNN` in `docs/adr/` plus one, zero-padded to 4 digits.
3. Copy `docs/adr/template.md` to `docs/adr/NNNN-<kebab-case-title>.md` and fill every section in English:
   - **Context:** cite `REQUIREMENTS.md` items, measurements with their conditions, and the user's decision with its date.
   - **Decision:** concrete enough to implement from (names, paths, numbers, limits).
   - **Alternatives considered:** each with the reason it lost.
   - **Consequences:** include what to revisit if an assumption proves wrong.
   - Status `Accepted` when the user has made or approved the decision; otherwise `Proposed`, and ask the user.
4. Add a row to the table in `docs/adr/README.md`.
5. When superseding, set the old ADR's status line to `Superseded by [NNNN](NNNN-….md)` and update its row in the README. Do not change the old ADR's decision text.
6. Cite the new ADR in the issue or PR that prompted it, and update `CLAUDE.md` if the decision changes a rule summarized there.
