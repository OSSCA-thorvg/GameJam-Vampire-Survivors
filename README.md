# GameJam Vampire Survivors

Survive 15 minutes against ever larger hordes while your weapons fire on their own: a Vampire Survivors-style browser game for one player, or two in online versus, drawn with ThorVG.

**[Play in your browser](https://ossca-thorvg.github.io/GameJam-Vampire-Survivors/)**: single player works online now; versus runs locally until the game server is public.

| Title screen                               | A run at 3:00                                                    |
| ------------------------------------------ | ---------------------------------------------------------------- |
| ![The title screen](docs/images/title.png) | ![A single-player run at 3:16 with the HUD](docs/images/run.png) |

![A versus match in split view: your world on the left, the opponent's on the right](docs/images/versus.png)

## Features

- **Single player:** pick a character, survive the 15-minute stage, and see your result with each weapon's damage.
- **4 characters:** Warden, Ember, Swift and Aurelia, each with a starting weapon and stats of their own.
- **8 weapons and 8 passives:** the Whip, Magic Wand, Knife, Axe, Cross, King Bible, Fire Wand and Garlic each go to level 8, and from 5:00 a treasure chest evolves a maxed weapon with its paired passive into one of 8 evolved weapons.
- **One 15-minute stage:** 15 waves over six enemies, elites and swarms, bosses at 5:00 and 10:00, and Death at 15:00.
- **2-player versus:** meet by a 6-character room code; each player plays their own world from a shared seed, sends Swarm, Gem Thief and Elite Call interference into the other's, and watches both worlds side by side in a split view.
- **ThorVG rendering:** `@thorvg/webcanvas` (WebGL) draws the world and the HUD in a Web Worker on an `OffscreenCanvas`, so the page stays responsive.
- **Performance overlay:** open any build with `?perf` for a live frame-timing overlay.

## How to play

| Action                 | Keys                                   |
| ---------------------- | -------------------------------------- |
| Move                   | Arrow keys or `W` `A` `S` `D`          |
| Pause and resume       | `Escape` (single player)               |
| Navigate menus         | Arrow keys (or `W`/`S`), `Enter` picks |
| Pick a level-up choice | `1`–`3`, or arrows and `Enter`         |

- Survive until 15:00. Weapons attack on their own; you only move.
- Killed enemies drop experience gems. Collect them to level up and pick a new or upgraded weapon or passive item.
- In versus, outlive your opponent. If both are alive at 15:00, the one with more kills wins.

## Current state

- A 7-second "Powered by ThorVG" splash plays first while the assets load; the title follows once both are done.
- The full single-player loop: title, character select, the run with its HUD, pause, level-ups, chests and results with Retry.
- The complete stage: 15 waves, elites, two bosses and Death at 15:00.
- All 8 weapons with their 8 evolutions, and all 8 passives.
- Animated pixel art for every actor and effect (native Lottie playback).
- Versus matches against the WebSocket server: lobby, countdown, interference items, split view, Win/Lose/Draw and Rematch.
- The client is published to GitHub Pages; the server image is on GHCR but has no public domain yet.

Planned work: [`docs/roadmap.md`](docs/roadmap.md).

## Run it locally

You need Git, nvm, Docker (for the versus server) and Node 24 from `.nvmrc`. Once per clone:

```sh
nvm use               # Node 24 from .nvmrc
corepack enable       # the pnpm version pinned in package.json
pnpm install          # npm and yarn are rejected; also installs the pre-commit hook
cp .env.example .env
```

Then:

```sh
pnpm server:up        # the versus server in Docker on :8787
pnpm dev              # the client on http://localhost:5173
pnpm check            # format, lint, typecheck, tests and build; CI runs the same
pnpm build
```

Full command list: [`CLAUDE.md`](CLAUDE.md) § Commands.

## Deploy

[ADR 0017](docs/adr/0017-host-on-github-pages-and-a-self-hosted-server.md) records the hosting.

- Every push to `main` builds the client and publishes it to GitHub Pages.
- The same workflow pushes the server image to GHCR; the owner runs it on their own host with [`deploy/server/compose.yaml`](deploy/server/README.md).
- Once the server has a domain and TLS, the repository variable `VITE_SERVER_URL` turns on versus in the Pages build.

## Contributing

- Start with [`CLAUDE.md`](CLAUDE.md) § Getting started, or [`AGENTS.md`](AGENTS.md) if you use Codex.
- Every change is a GitHub issue first: `issue-start`, implement, then `issue-finish`, which opens one squash-merged PR.
- `main` is protected by a ruleset that nobody can bypass ([ADR 0015](docs/adr/0015-protect-main-with-a-ruleset-and-native-auto-merge.md)).

Where to look:

- [`AGENTS.md`](AGENTS.md): the Codex contributor guide, stage checks, and equivalents for Claude Code tools.
- [`CLAUDE.md`](CLAUDE.md): how to start contributing (Getting started), the shared workflow, rules, and skills for Claude Code and Codex.
- [`docs/roadmap.md`](docs/roadmap.md): the phases and the issues in dependency order.
- [`docs/adr/`](docs/adr/README.md): the architecture decisions every change follows.
- [`REQUIREMENTS.md`](REQUIREMENTS.md): the requirements, in Korean.

## Credits

- Rendering: [ThorVG](https://github.com/thorvg/thorvg) through `@thorvg/webcanvas`.
- HUD font: Noto Sans Mono, under the SIL Open Font License ([ADR 0013](docs/adr/0013-bundle-a-hud-font-subset.md)).
- Art: see [`assets/README.md`](assets/README.md#sources-and-licenses) § Sources and licenses.
