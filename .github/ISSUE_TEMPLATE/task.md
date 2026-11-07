---
name: Task
about: One PR's worth of work, written to the readiness standard in .claude/rules/issues.md
title: ''
labels: ''
assignees: ''
---

<!-- English, no hard-wrapped paragraphs. Keep the section order. Before marking it status:ready, run the readiness checklist in .claude/rules/issues.md; the issue-create skill does this for you. -->

## Goal

One or two sentences: what exists after this issue that did not before.

## Before you start

- Setup, once per clone: `nvm use`, `corepack enable`, `pnpm install` (plus `pnpm server:up` when the server is needed).
- Read: `CLAUDE.md`, the ADRs below, the `docs/reference/gameplay.md` section, `assets/CATALOG.md`, the verification map files.
- Skills: `issue-start`, `impact-check`, `verify-game` (once #31 has merged), `issue-finish`, `security-check` (when it applies).

## Context

- Requirements: REQUIREMENTS.md #<n>
- ADRs, each with the 1–3 constraints that bind this issue restated inline.
- User decisions that bind this issue, with their dates.
- From earlier issues: the exact paths, exported symbols, message types and field names this issue builds on (#N).

## Implementation plan

1. Numbered steps in build order, each compilable and testable before the next: files and modules, types with field names, algorithm and flow (which thread runs it), integration points, tests, and security (when the issue touches the server, protocol, dependencies, Docker, CI or DOM rendering of user data). No undecided choices.

## How to verify

- Exact commands, browser actions or `verify-game` journeys, and the expected observations.
- Proof level per criterion: 5 for user-visible behaviour, 4 for the safety fact (`.claude/rules/verification.md`).

## Acceptance criteria

- [ ] Observable behaviour or test that proves it.
- [ ] Docs-sync targets this issue touches are updated (`.claude/rules/docs-sync.md`).

## Out of scope

- What a reader might expect here but belongs elsewhere (#N).

## Depends on

- #N (or "none")

## Size

S | M | L
