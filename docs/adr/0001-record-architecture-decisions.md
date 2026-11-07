# 0001. Record architecture decisions as ADRs

- Status: Accepted
- Date: 2026-11-07

## Context

Several people (and coding agents) implement this game issue by issue. A choice made in one issue — which renderer, which thread runs the game, how assets are referenced — must hold in every later issue, and the reason for it must survive so it is not silently reversed.

## Decision

- Every decision that constrains more than the issue it was made in is recorded in `docs/adr/NNNN-kebab-title.md`, using `docs/adr/template.md`, and listed in `docs/adr/README.md`.
- ADRs are written in English.
- An accepted ADR is not edited to change its decision. A new ADR supersedes it, and the old one's status is changed to `Superseded by NNNN`.
- Issues name the ADRs they depend on; implementers read those ADRs before starting (see the `issue-start` skill).
- Use the `adr-new` skill to create one.

## Consequences

- Reviewers can reject a change that contradicts an accepted ADR without re-arguing it.
- Deviating from an ADR requires writing a superseding ADR first, which is deliberate friction.
