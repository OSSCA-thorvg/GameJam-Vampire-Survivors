# 0023. Build the server image on the owner's host instead of GHCR

- Status: Accepted
- Date: 2026-11-09
- Related issues: #144; partly supersedes ADR [0017](0017-host-on-github-pages-and-a-self-hosted-server.md) (the server image's publication; the GitHub Pages client, the server URL as configuration, the host's hardening and the open domain and TLS item are retained)

## Context

- ADR 0017 had `.github/workflows/deploy.yml` build the server's `runtime` image on every push to `main` and push it to `ghcr.io/ossca-thorvg/gamejam-vampire-survivors-server` (`:sha-<commit>`, `:main`) with `packages: write`, and the owner pulled it with `deploy/server/compose.yaml`.
- The project owner decided on 2026-11-09 (#144): the server image does not need to live on GitHub. The owner builds it on their own host from a clone of the repository. GitHub keeps only the code and the GitHub Pages client.
- ADR 0010 requires the deployed server to be the same `runtime` target as development, non-root `node`, production dependencies only, a `HEALTHCHECK` on `/healthz`, and the Node version from `.nvmrc` through `NODE_VERSION`. ADR 0011 keeps workflow jobs at `permissions: contents: read` unless they document why they need more, and no host credentials in the repository.
- CI's `server image` job (`ci.yml`) already builds the `runtime` target and checks `/healthz`, health, the `node` user and the Node major on every pull request that touches the server; it is a required check of the main ruleset (ADR 0015).

## Decision

- **No registry.** `deploy.yml` publishes only the client: the `publish server image` job, the `IMAGE` env and its `packages: write` permission are removed. `deploy check` and `deploy client` are unchanged, so no job in the repository holds a write permission other than the Pages deploy's `pages: write` and `id-token: write`.
- **The owner's host builds the image.** `deploy/server/compose.yaml` has a `build:` section (`context: ../..`, `dockerfile: packages/server/Dockerfile`, `target: runtime`, `args: NODE_VERSION`) and tags the result `vs-server:local`, the same name as `pnpm server:image`. From the repository root:
  - first run: `git clone https://github.com/OSSCA-thorvg/GameJam-Vampire-Survivors.git`, `cp deploy/server/.env.example deploy/server/.env`, edit it, then `NODE_VERSION=$(cat .nvmrc) docker compose -f deploy/server/compose.yaml up -d --build`;
  - update: `git pull --ff-only` (or check out the commit to deploy) and the same `up -d --build`;
  - `NODE_VERSION` falls back to `24` in the compose file only so that `ps`, `logs` and `down` work without it; the base image stays pinned by digest (`NODE_DIGEST`), which decides the actual Node.
- **Everything else in ADR 0017's server half holds:** one container named `vs-server`, `restart: unless-stopped`, published on `127.0.0.1:8787` by default (`VS_BIND`, `VS_HOST_PORT`), read-only root filesystem, all capabilities dropped, `no-new-privileges`, `/tmp` as tmpfs, health check on `/healthz`, the `.env` settings (`ALLOWED_ORIGINS`, `TRUST_PROXY`, `LOG_LEVEL`) and the open domain and TLS item. `VS_IMAGE` is removed from `deploy/server/.env.example`.
- **The image's gate is CI's `server image` job**, unchanged: it builds the same target from the same Dockerfile on every server-touching pull request.
- **Owner step, once:** an organization owner deletes the already published package (github.com/orgs/OSSCA-thorvg/packages → `gamejam-vampire-survivors-server` → Package settings → Delete package). It is listed in `deploy/server/README.md`; no workflow or token in the repository does it.

## Alternatives considered

- **Keep publishing to GHCR** — the owner does not need the image on GitHub, and it kept a `packages: write` job and a package whose visibility had to be managed.
- **Another registry (Docker Hub, a private registry)** — a third-party account and a push credential in the repository's secrets, which ADR 0017 already ruled out for the deploy path.
- **Build in CI and attach the image as a workflow artifact** — the host would still have to download it with a GitHub token, and artifacts expire.
- **Copy only `deploy/server/` to the host and build from a downloaded archive** — a clone is simpler, gives `git pull` for updates and shows exactly which commit runs.

## Consequences

- The host needs Git, the clone and BuildKit, and each deploy takes a build instead of a pull (18 s with `--no-cache` and a cached base image on a development Mac, #144). The image is built for the host's own architecture, so ADR 0017's `linux/amd64` restriction no longer applies.
- What runs is exactly the checked-out commit (`git rev-parse HEAD` on the host); there is no `:main` tag that can drift from it.
- Nothing in the repository can push or overwrite a server image, which removes the only `packages: write` permission.
- A change to the Dockerfile, `.dockerignore` or the build context now affects production builds directly; CI's `server image` job remains their gate.
- Revisit if the server ever runs on more than one host or needs reproducible prebuilt images (then a registry with signed, digest-pinned tags would return in a superseding ADR).
