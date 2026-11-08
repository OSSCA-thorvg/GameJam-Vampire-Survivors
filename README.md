# GameJam Vampire Survivors

A browser game in the style of Vampire Survivors, for single player and 2-player online versus play, rendered with ThorVG's `@thorvg/webcanvas`. The game simulates and renders in a Web Worker, and a small WebSocket relay server runs in Docker for versus matches.

## Current state

The toolchain is in place: a pnpm workspace with the `@vs/client`, `@vs/server` and `@vs/shared` packages, ESLint, Prettier, Vitest, a pre-commit hook and CI. The client boots ThorVG (WebGL) in a game worker on an `OffscreenCanvas` and runs the fixed-step loop, where the player walks in eight directions over a scrolling tiled ground with a centred camera while enemies spawn from a per-minute wave table just off-screen and chase him, hurting him on contact until he dies; the server runs rooms, match start, status relay, interference routing and the match result over the protocol in `packages/shared/src/protocol.ts`; from the title's Multiplayer button two players pick a character, enter a nickname, meet in a lobby by a 6-character room code, ready up and see the host's countdown (the versus match itself comes next). The manifest asset gallery and the worker's entity stores, spatial grid and reusable paint pools are available; `/?stress=3000` in development exercises pool reuse. A single-player round trip works: a title screen, a character select with four characters (Warden, Ember, Swift and Aurelia, each with its own starting weapon and stats), the run with a ThorVG HUD (HP bar, `mm:ss` timer, kill counter), a pause overlay on Escape or a hidden tab, and a results screen with Retry and Title. The player starts with the Whip and can gain the other seven weapons (Magic Wand, Knife, Axe, Cross, King Bible, Fire Wand and Garlic) from level-ups, each up to level 8 (`G` grants the next one in development builds); weapons fire on their own cooldowns, knock enemies back, make them flash and kill them, and the kill counter rises. Killed enemies drop experience gems that fly to the player when he comes near; a full XP bar along the top pauses the run and offers up to three new or upgraded weapons and passive items (a fourth with luck, a heal when nothing is left); the eight passives raise damage, area, cooldown, projectile speed, duration, max HP, recovery and luck. Bosses and elite enemies drop treasure chests; opening one pauses the run and shows 1, 3 or 5 rewards, and from 5:00 a maxed weapon with its paired passive evolves into one of eight evolved weapons. Bosses never get left behind. The single stage is complete: a 15-minute wave table over six enemies with elites, swarms and two timed bosses; at 15:00 the screen clears and Death appears, and the results screen says "Stage cleared" or "Game over" with the character and each weapon's damage. Work is planned as GitHub issues in phases (`docs/roadmap.md`).

The asset manifest loader caches drawable masters and registers the HUD font by ID. `pnpm assets:sync` generates the catalog IDs; `/?gallery` in development shows labelled assets and magenta missing-art placeholders. The final84-ID pack (#76) includes81 generated pixel PNGs, two native image-backed Lottie effects and the preserved licensed HUD font; `V` in the gallery previews mass art drifting at game speed.

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
