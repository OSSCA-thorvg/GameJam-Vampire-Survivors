# Repository Guidelines

## Project structure and commands

`packages/client/src/main/` owns DOM UI; `packages/client/src/worker/` owns simulation and ThorVG rendering. `packages/shared/src/` holds portable types and data; `packages/server/src/` runs in Docker. Art lives in `assets/` with `CATALOG.md` and `manifest.json`; architecture and scope live in `docs/adr/`, `docs/roadmap.md`, and `REQUIREMENTS.md`.

Use Node 24: `nvm use`, `corepack enable`, `pnpm install`.

- `pnpm assets:sync`: regenerate shared asset IDs/sizes after catalog edits.
- `pnpm dev`: client on :5173. `pnpm server:up`: Docker server on :8787.
- `pnpm check`: format, lint, typecheck, Vitest, verification harness tests, build, then `test:build`.
- `pnpm format`, `pnpm lint:fix`: fixes. `pnpm test`: unit suites. `pnpm test:build`: requires built artifacts.
- `pnpm verify:e2e --issue <N>`: browser smoke/native hidden-tab tests and cleanup (`--project chromium` selects headless smoke).

Add asset IDs to `assets/CATALOG.md`, run `pnpm assets:sync`, then add the file (style guide and naming rule in `assets/README.md`) and manifest entry; `/?gallery` in development previews drawable IDs and anchors, and `V` there previews mass art at game speed. Fonts remain non-drawable manifest entries with their source/license records.

Use two spaces, single quotes, semicolons, strict TypeScript, ESLint, and Prettier. Name colocated Vitest tests `*.test.ts`.

## Required stage checks

Read `CLAUDE.md` first. Before each applicable stage, read `.claude/rules/<rule>.md` and `.claude/skills/<skill>/SKILL.md` named below, then execute their steps. User/session instructions take precedence.

| Stage                 | Rules                                  | Skills                                                |
| --------------------- | -------------------------------------- | ----------------------------------------------------- |
| Triage or follow-ups  | issues, labels                         | issue-create; label-sync when labels change           |
| Start                 | issues, verification                   | issue-start; impact-check, scope mode                 |
| Architecture decision | issues, docs-sync                      | adr-new                                               |
| Implement             | security, docker, docs-sync            | security-check when triggered; dev-server for servers |
| Verify behavior       | verification, docs-sync                | verify-game; impact-check, proof mode                 |
| Commit                | commits                                | commit                                                |
| Rebase                | conflicts                              | resolve-conflicts                                     |
| Finish                | pull-requests, verification, docs-sync | issue-finish                                          |

After checking prerequisites and issue ownership, assign the issue and set `status:in-progress` on GitHub before creating its worktree, installing dependencies, and implementing (user directive, 2026-11-08).

Read the whole issue thread before starting and before the PR. Check prerequisites and their actual artifacts on `origin/main`. Record executed checks and evidence in `verification/issue-<N>/`. Ask about blocking decisions; route other findings through the follow-up procedure.

## Codex equivalents

Read named Codex skills from the session catalog. They supplement the shared procedures.

- Slash skills mean reading and executing their `SKILL.md` with tools.
- Delegate implementation/reviews to Codex workers and research to explorers, following `CLAUDE.md`; isolate independent issues in worktrees. Report session restrictions and any direct-review fallback.
- Claude Code `/security-review`: run `security-check` steps 1–8, then use `interrogate` with a security brief covering ADR 0011 and `.claude/rules/security.md`. Preserve findings from both reviews, complete step 10, and retain the high-severity merge hold. If unavailable, perform an independent checklist review and disclose tool limitations.
- Claude in Chrome: use `verify-game`'s Playwright driver and its `features/` map. Follow launch, doctor, real input, snapshots, evidence, and cleanup. Preserve existing browser sessions.
- Use `blast-radius` alongside `impact-check`, and `verification-mastery` before completion claims. If unavailable, execute the shared checks and report the missing skill.

## Commit and delivery

Use issue branches such as `update/issue-54-codex-workflow-guidance`. English imperative subjects use a permitted prefix, such as `docs:`, within 72 characters. Keep one rebased commit; pass hooks. Use the PR template, evidence sections, and one closing line. Merge only through auto-merge; verify completion labels and main CI.

## User constraints

Use `fvm` for Flutter commands. Preserve users' CDP browser sessions. Use `figma-mcp-go` for Figma and inspect with `get_node`, `get_nodes_info`, or `get_screenshot`.
