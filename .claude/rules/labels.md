# Labels in this repository

Source of truth: `.github/labels.json`. Sync it with the `label-sync` skill. `status:*`, `type:*` and `priority:*` match the dw plugin's `project-labels` standard if the dw plugin is installed; the file and this page are complete without it.

## area:* (one or more; pick the ones a triager would filter by)

| Label | Covers |
|---|---|
| `area:client` | `packages/client/src/main/`: DOM UI, input capture, app flow, WebSocket client |
| `area:engine` | `packages/client/src/worker/`: game loop, ThorVG rendering, entity storage, collision |
| `area:gameplay` | Weapon behaviour, enemies, waves, pickups, balance numbers |
| `area:multiplayer` | Rooms, match flow, interference items, opponent panel, across client and server |
| `area:server` | `packages/server/` |
| `area:shared` | `packages/shared/`: protocol types and content data |
| `area:assets` | `assets/` and `assets/manifest.json` |
| `area:infra` | Workspace setup, CI, deployment |
| `area:docs` | ADRs, `docs/reference/`, `CLAUDE.md` (code-area tag; `type:docs` is the change kind) |

## phase:* (exactly one; the roadmap stage in docs/roadmap.md)

`phase:0-foundation`, `phase:1-core-loop`, `phase:2-content`, `phase:3-multiplayer`, `phase:4-release`.

## priority:* in this project

- `priority:critical`: blocks everyone, such as a broken `main` or a broken build.
- `priority:high`: on the critical path of the roadmap; other issues depend on it.
- `priority:medium`: planned work that nothing else waits on.
- `priority:low`: nice to have.
- `priority:backlog`: future considerations.
