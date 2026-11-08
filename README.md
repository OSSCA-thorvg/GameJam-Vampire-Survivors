# GameJam Vampire Survivors

A browser game in the style of Vampire Survivors, for single player and 2-player online versus play, rendered with ThorVG's `@thorvg/webcanvas`. The game simulates and renders in a Web Worker, and a small WebSocket relay server runs in Docker for versus matches.

## Current state

The toolchain is in place: a pnpm workspace with the `@vs/client`, `@vs/server` and `@vs/shared` packages, ESLint, Prettier, Vitest, a pre-commit hook and CI. The client boots ThorVG (WebGL) in a game worker on an `OffscreenCanvas` and runs the fixed-step loop on a test scene; the server runs rooms, match start, status relay, interference routing and the match result over the protocol in `packages/shared/src/protocol.ts`, with no client UI for it yet. The manifest asset gallery and the worker's entity stores, spatial grid and reusable paint pools are available; `/?stress=3000` in development exercises pool reuse. No gameplay exists yet. Work is planned as GitHub issues in phases (`docs/roadmap.md`).

The asset manifest loader caches drawable masters and registers the HUD font by ID. `pnpm assets:sync` generates the catalog IDs; `/?gallery` in development shows labelled assets and magenta missing-art placeholders. Every catalog ID has rough, original starter art (#5); `V` in the gallery previews mass art drifting at game speed.

## Development

Prerequisites: Git, nvm (or fnm or volta), Corepack, which ships with Node 24, and Docker (Docker Desktop, OrbStack or Colima, running) for the server. Then, once per clone:

```sh
nvm use           # Node 24 from .nvmrc
corepack enable   # the pnpm version pinned in package.json
pnpm install      # npm and yarn are rejected; also installs the pre-commit hook
cp .env.example .env
```

Everyday commands (the full list, including single-test commands, is in [`CLAUDE.md`](CLAUDE.md) § Commands):

```sh
pnpm server:up      # server in Docker on http://localhost:8787 (ws://localhost:8787/ws), hot-reloading
pnpm dev            # client only, on http://localhost:5173
pnpm server:logs / server:down
pnpm check          # format:check → lint → typecheck → test → verify CLI and ruleset tests → build → test:build; CI runs the same
pnpm lint / pnpm lint:fix
pnpm format / pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:build     # check client build artifacts; run pnpm build first
```

The pre-commit hook runs Prettier and ESLint on staged files; never bypass it with `--no-verify`. `main` is protected by a GitHub ruleset that nobody can bypass ([ADR 0015](docs/adr/0015-protect-main-with-a-ruleset-and-native-auto-merge.md), `.github/rulesets/main.json`): every change lands as one squash-merged PR, and GitHub's native auto-merge, enabled by the `issue-finish` skill, merges it once the five CI checks pass on a branch that is up to date with `main`. The server always runs in Docker (ADR 0010); the `dev-server` skill in `.claude/skills/` covers rebuilding, the runtime image and troubleshooting. `.env.example` lists the environment variables (`VITE_SERVER_URL`, `PORT`, `LOG_LEVEL`, `ALLOWED_ORIGINS`, `TRUST_PROXY`) with their defaults.

## Where to look

- [`AGENTS.md`](AGENTS.md): the Codex contributor guide, stage checks, and equivalents for Claude Code tools.
- [`CLAUDE.md`](CLAUDE.md): how to start contributing (Getting started), the shared workflow, rules, and skills for Claude Code and Codex.
- [`docs/roadmap.md`](docs/roadmap.md): the phases and the issues in dependency order.
- [`docs/adr/`](docs/adr/README.md): the architecture decisions every change follows.
- [`REQUIREMENTS.md`](REQUIREMENTS.md): the requirements, in Korean.
