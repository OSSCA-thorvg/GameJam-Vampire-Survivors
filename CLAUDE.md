# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser game in the style of Vampire Survivors, for single player and 2-player online versus play, rendered with ThorVG's `@thorvg/webcanvas`. Requirements are in `REQUIREMENTS.md`, written in Korean; ADRs cite its items by number. Every architectural choice is an ADR in `docs/adr/`. Read `docs/adr/README.md` first.

Current state: documentation and planning only. No code exists yet. Work is planned as GitHub issues in phases (`docs/roadmap.md`).

## Workflow (mandatory)

- **Delegate to subagents by default** (requested by the user):
  - Implement each issue in a subagent, briefed with the issue body, the ADRs it cites and this file.
  - Run independent issues (for example, parallel roadmap tracks) in parallel subagents, each in its own git worktree.
  - Delegate research, reviews and the `security-check` pass the same way.
  - The main session plans, briefs, verifies the subagent's result against the acceptance criteria, and runs `issue-finish`.
  - Only trivial lookups and single-file edits stay in the main session.

- **Never write code without an issue.** Run the `issue-start` skill before implementing. It moves the issue to `status:in-progress`, creates the branch, and makes you read the cited ADRs.
- **Finish with `issue-finish`.** It verifies the acceptance criteria, runs `pnpm check`, opens the PR, squash-merges it as soon as checks pass, and marks the issue `status:done`.
- Rules live in `.claude/rules/`:
  - `issues.md`
  - `commits.md`
  - `pull-requests.md`
  - `labels.md`
  - `security.md`
  - `docker.md`

  Read the matching file before creating an issue, committing (use the `commit` skill), or opening a PR.
- New issues go through `issue-create`; each needs a detailed **Implementation plan** section. Labels come from `.github/labels.json`, synced with `label-sync`; their meanings are in `.claude/rules/labels.md`.
- A decision that binds later work gets an ADR through `adr-new` in the same PR. Do not contradict an accepted ADR. Supersede it.
- These skills follow the conventions of the user's `dw` plugin (`dw:project-labels`, `dw:branch-conventions`, `dw:commit-conventions`, `dw:gh-workflow`), so `dw` skills such as `/dw:impl` and `/dw:ship` also work here. The project skills above take precedence where they differ (for example, merging immediately).
- Commit, PR and issue text is written in English with a `feat:`/`fix:`/`update:`/`refactor:`/`test:`/`docs:`/`chore:` subject. Paragraphs are not hard-wrapped, and bodies are passed with `--body-file`. Do not add AI attribution or `Co-Authored-By` trailers.
- The pre-commit hook (ADR 0002) runs Prettier and ESLint on staged files, and must pass. Never commit with `--no-verify`. If the hook fails, fix the code and commit again.
- **Security (ADR 0011):**
  - Follow `.claude/rules/security.md`.
  - Packages install only versions at least 7 days old (`minimumReleaseAge`), and dependency build scripts are blocked unless listed in `allowBuilds`.
  - Run the `security-check` skill before PRs touching dependencies, the server, the protocol, Docker, CI or user-data rendering.
- Stage files by path. Never use `git add -A`, `git add .`, `git stash` or `git clean` on the user's working tree.
- Always pass `--json <fields>` to `gh issue view` and `gh pr view`. Change labels with `gh issue edit`, which also works on PRs.
- GitHub repo: `OSSCA-thorvg/GameJam-Vampire-Survivors`. If `gh` reports the repo is not found, the active `gh` account lacks access. Ask the user to `gh auth switch` or `gh auth login`.

## Commands

The toolchain is created by the monorepo setup issue (roadmap item F1). Until then, these commands do not exist. Do not invent others.

```sh
nvm use                 # Node version from .nvmrc (24)
corepack enable         # provides the pnpm version pinned in package.json
pnpm install            # npm and yarn are blocked; use pnpm only
pnpm dev                # client (Vite) on the host; the server runs in Docker (pnpm server:up)
pnpm --filter client dev
pnpm server:up / server:logs / server:down   # server in Docker (ADR 0010, dev-server skill)
pnpm check              # format:check → lint → typecheck → test → build; must pass before merge
pnpm lint / pnpm lint:fix
pnpm format / pnpm format:check
pnpm typecheck
pnpm test                                   # all packages (Vitest)
pnpm --filter shared test -- src/content    # one package, one path
pnpm --filter client exec vitest run -t "spawns enemies"   # single test by name
pnpm build
```

## Architecture

Read the ADR for the full reasoning.

- **Monorepo (ADR 0002):**
  - `packages/client` is the Vite app with no UI framework (ADR 0009);
  - `packages/server` is the Node + `ws` relay;
  - `packages/shared` holds protocol types and content data, with no DOM, worker or Node APIs;
  - `assets/` holds the art and `manifest.json`.
- **Threads (ADR 0004):** the main thread (`client/src/main/`) owns the DOM UI, keyboard capture and the WebSocket. A dedicated module worker (`client/src/worker/`) owns the simulation and all ThorVG rendering, including the HUD, on an `OffscreenCanvas` transferred at startup. The two talk only through the typed messages in `client/src/protocol/worker-messages.ts`. Nothing in the worker may touch the DOM; nothing on the main thread may touch the canvas.
- **Rendering (ADR 0003):**
  - Initialize ThorVG once with `renderer: 'gl'`.
  - Paints are created once and pooled, cloned with `duplicate()` from a loaded master. Per frame, only transforms, visibility and opacity change, followed by one `canvas.update()` and one `canvas.render()`.
  - Never create or dispose Paints per frame.
  - Do not use the `/thread` build.
- **Simulation (ADR 0004):**
  - Fixed 60 Hz step with an accumulator, at most 5 steps per frame.
  - Typed-array struct-of-arrays plus a uniform-grid spatial hash.
  - No per-entity allocation in the frame loop.
  - All randomness comes from the seeded PRNG.
- **Multiplayer (ADRs 0005, 0006):**
  - Each player simulates their own world, and worlds are never synchronized.
  - The server handles rooms (6-character codes, nicknames), match start (seed), status relay (at most 4 Hz), interference routing and the result. The last survivor wins.
  - Protocol types live in `shared/src/protocol.ts`, and the server validates every message.
- **Content (ADR 0008):** characters, weapons, passives, evolutions, enemies, waves and pickups are data in `shared/src/content/`. Systems interpret the data; each weapon's behaviour is chosen by its `pattern` field. The scope is fixed in ADR 0008: 8 weapons with evolutions, 8 passives, 3 characters, 1 stage, and no gold, unlocks, relics, shops or arcanas.
- **Assets (ADR 0007):**
  - Code refers to logical IDs such as `enemy.bat`, resolved through `assets/manifest.json`. Never use file paths.
  - Vector first. Entities shown in large numbers have at most 4 paths, no strokes and no gradients, within the entity caps in the ADR.
  - Missing assets render as a magenta placeholder.
  - Only original or licensed art; nothing copied from the original game.
  - `assets/CATALOG.md` lists every asset ID and its status. Add a row there before using a new ID.

## Gameplay fidelity

Before implementing or tuning gameplay, read the matching section of `docs/reference/gameplay.md` and compare with footage of the original game, linked there. When text and footage disagree, footage wins. Record new observations, with their source, in that file in the same PR. Facts marked **[unverified]** must be checked before you rely on them.
