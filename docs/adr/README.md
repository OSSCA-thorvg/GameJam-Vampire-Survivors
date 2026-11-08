# Architecture Decision Records

Read the ADRs an issue references before implementing it. See [0001](0001-record-architecture-decisions.md) for the rules, and create new ones from [template.md](template.md) with the `adr-new` skill.

| #                                                               | Decision                                                             | Status   |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)                   | Record architecture decisions as ADRs                                | Accepted |
| [0002](0002-typescript-pnpm-monorepo.md)                        | TypeScript pnpm monorepo: client, server, shared; ESLint + Prettier  | Accepted |
| [0003](0003-render-with-thorvg-webcanvas-webgl.md)              | Render with @thorvg/webcanvas, WebGL backend                         | Accepted |
| [0004](0004-run-game-in-dedicated-web-worker.md)                | Simulation and rendering in a dedicated Web Worker                   | Accepted |
| [0005](0005-multiplayer-separate-worlds-with-interference.md)   | Separate worlds per player, interference items, last survivor wins   | Accepted |
| [0006](0006-websocket-relay-server.md)                          | WebSocket relay server for rooms and match events                    | Accepted |
| [0007](0007-vector-first-swappable-asset-manifest.md)           | Vector-first art behind a swappable asset manifest                   | Accepted |
| [0008](0008-data-driven-content-and-scope.md)                   | Data-driven content and content scope                                | Accepted |
| [0009](0009-no-ui-framework.md)                                 | No UI framework: plain TypeScript DOM for menus and overlays         | Accepted |
| [0010](0010-run-the-server-in-docker.md)                        | Run the server in Docker in development and deployment               | Accepted |
| [0011](0011-security-baseline.md)                               | Security baseline: supply chain, server, client, containers, secrets | Accepted |
| [0012](0012-merge-only-through-the-auto-merge-workflow.md)      | Merge only through the auto-merge workflow, on green CI              | Accepted |
| [0013](0013-bundle-a-hud-font-subset.md)                        | Bundle a HUD font subset (printable ASCII) for ThorVG text           | Accepted |
| [0014](0014-disconnected-players-lose-at-the-match-deadline.md) | Players disconnected at the match deadline lose                      | Accepted |
