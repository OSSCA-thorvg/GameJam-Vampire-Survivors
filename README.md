# GameJam Vampire Survivors

A browser game in the style of Vampire Survivors, for single player and 2-player online versus play, rendered with ThorVG's `@thorvg/webcanvas`. The game simulates and renders in a Web Worker, and a small WebSocket relay server runs in Docker for versus matches.

## Current state

The toolchain is in place: a pnpm workspace with the `@vs/client`, `@vs/server` and `@vs/shared` packages, ESLint, Prettier, Vitest, a pre-commit hook and CI. No game code exists yet. Work is planned as GitHub issues in phases (`docs/roadmap.md`).

## Development

Prerequisites: Git, nvm (or fnm or volta) and Corepack, which ships with Node 24. Docker is needed from #4 on, for the server. Then, once per clone:

```sh
nvm use           # Node 24 from .nvmrc
corepack enable   # the pnpm version pinned in package.json
pnpm install      # npm and yarn are rejected; also installs the pre-commit hook
```

Everyday commands (the full list, including single-test commands, is in [`CLAUDE.md`](CLAUDE.md) § Commands):

```sh
pnpm dev            # client on http://localhost:5173, server on http://localhost:8787
pnpm check          # format:check → lint → typecheck → test → build; CI runs the same
pnpm lint / pnpm lint:fix
pnpm format / pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The pre-commit hook runs Prettier and ESLint on staged files; never bypass it with `--no-verify`. `.env.example` lists the environment variables (`VITE_SERVER_URL`, `PORT`) with their defaults.

## Where to look

- [`CLAUDE.md`](CLAUDE.md): how to start contributing (Getting started), the workflow, the rules and the skills. Every contributor develops with Claude Code.
- [`docs/roadmap.md`](docs/roadmap.md): the phases and the issues in dependency order.
- [`docs/adr/`](docs/adr/README.md): the architecture decisions every change follows.
- [`REQUIREMENTS.md`](REQUIREMENTS.md): the requirements, in Korean.
