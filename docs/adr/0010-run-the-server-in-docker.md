# 0010. Run the server in Docker, in development and in deployment

- Status: Accepted
- Date: 2026-11-07

## Context

- The requester asked for the server to run with Docker, so that everyone develops against the same environment, and for this to be governed by skills and rules (2026-11-07).
- The server (ADR 0006) is a single Node + `ws` process with no database. The client is a static Vite app whose dev server needs fast HMR on the host.

## Decision

**What runs where**

| Part | Development | Deployment |
|---|---|---|
| Server (`packages/server`) | Always in Docker, through `docker compose` | The same image's `runtime` target |
| Client (`packages/client`) | On the host with `pnpm --filter client dev` (Node from `.nvmrc`), connecting to the containerized server | Static files (ADR for hosting in roadmap R2) |

**Files** (created by roadmap item F4)

- `packages/server/Dockerfile` is a multi-stage build:
  - `base`: `node:${NODE_VERSION}-alpine`. `NODE_VERSION` is a build argument filled from `.nvmrc` by the scripts; pnpm comes through Corepack, at the version in `packageManager`.
  - `dev`: installs workspace dependencies and runs `tsx watch` on the bind-mounted source.
  - `build`: compiles `shared` and `server`, then `pnpm deploy --filter server --prod /out`.
  - `runtime`: copies only `/out`, runs as the non-root `node` user, `EXPOSE 8787`, and has a `HEALTHCHECK` that requests `/healthz`.
- `.dockerignore` at the root excludes `node_modules`, `dist`, `.git`, `assets` and `docs`.
- `compose.yaml` at the root:
  - the `server` service builds the `dev` target;
  - it bind-mounts `packages/server` and `packages/shared` sources, and keeps dependencies in a named volume so the host and container `node_modules` never mix;
  - it maps `8787:8787` and reads `env_file: .env`.
- `.env.example` documents every variable (`PORT=8787`, `LOG_LEVEL`, `ALLOWED_ORIGINS`), and is the only env file committed (`.env` is git-ignored).
- Root scripts:
  - `server:up` runs `docker compose up -d --build server`;
  - `server:down`, `server:logs` and `server:sh` manage and inspect the container;
  - `server:image` builds the `runtime` target and tags it `vs-server:local`.

**Rules**

- Run, debug and test the server against the container, not a host Node process, so behaviour matches deployment. Unit tests (`pnpm --filter server test`) may run on the host, because they do not depend on the container environment.
- A change to the server's dependencies, environment variables or ports updates `Dockerfile`, `compose.yaml` and `.env.example` in the same PR.
- CI builds the `runtime` image on every PR that touches `packages/server`, `packages/shared`, `Dockerfile`, `compose.yaml` or the lockfile, and checks that `/healthz` answers inside the built container.
- The `dev-server` skill is the procedure for starting, stopping, rebuilding and troubleshooting. The rules summary is in `.claude/rules/docker.md`.

## Alternatives considered

- **Server on the host with nvm only** — `.nvmrc` pins Node, but OS packages and environment still differ between machines and from deployment.
- **Client in Docker too** — HMR through bind mounts is slow on macOS, and the client has no environment-specific dependencies beyond Node, which `.nvmrc` already pins. This can be revisited if the client gains native dependencies.
- **Dev containers (VS Code)** — ties the workflow to one editor.

## Consequences

- Docker (Docker Desktop, OrbStack or Colima) is a prerequisite for server work.
- The deployment target (R2) only needs to run one container image.
- Source changes hot-reload without a rebuild. Dependency changes need `pnpm server:up` again, which rebuilds the image.
