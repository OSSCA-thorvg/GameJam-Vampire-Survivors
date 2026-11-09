# 0017. Host the client on GitHub Pages and the server on a self-hosted Docker host

- Status: Superseded in part by [0023](0023-build-the-server-image-on-the-owners-host.md) (the server image is built on the owner's host, not published by `deploy.yml`; the Pages client, server URL, host hardening and domain/TLS item retained)
- Date: 2026-11-09
- Related issues: #23

## Context

- REQUIREMENTS.md #13 (multiplayer connection) and #15 (rooms by code) need a public client URL and a public game server. ADR 0006 left the hosting target open; ADR 0010 requires the deployed server to be the same `runtime` image as development; ADR 0011 fixes the production CSP, SHA-pinned actions, least-privilege workflows, a digest-pinned base image and credentials only in secret stores.
- The project owner decided on 2026-11-09 (comment on #23): the client goes to GitHub Pages; the server runs on the owner's own host, not a managed platform. CI builds the `runtime` image and pushes it to GHCR, and the owner pulls and runs it by hand with a compose file from the repository. No SSH keys or server credentials go into the repository. The domain and TLS for the server are not decided yet.
- The server keeps rooms in memory (ADR 0006), so exactly one instance may run.

## Decision

- **Client: GitHub Pages**, at `https://ossca-thorvg.github.io/GameJam-Vampire-Survivors/`.
  - `pnpm build:pages` (`vite build --mode pages`) sets Vite `base` to `/GameJam-Vampire-Survivors/`. Dev, e2e and the ordinary `pnpm build` keep `/`. Every runtime URL (manifest, art, `thorvg/thorvg.wasm`, the HUD font, the favicon) is resolved from `import.meta.env.BASE_URL` or relative to it.
  - Pages sends no custom headers, so every production build carries ADR 0011's CSP as the first `<meta http-equiv="Content-Security-Policy">` in `<head>`, without `frame-ancestors` (`packages/client/csp.ts`). It includes `worker-src 'self' blob:` for the support probe (`main/support.ts`). `vite preview` sends the same policy as a header with `frame-ancestors 'none'`.
  - `connect-src` is `'self'` plus the scheme, host and port of `VITE_SERVER_URL`, and only `'self'` when it is unset. The Pages build fails on anything but a `wss://` URL, because an https page cannot open `ws://` sockets.
- **Server URL is configuration.** `VITE_SERVER_URL` is a repository **variable** (not a secret: it ships in the bundle), read by the deploy workflow at build time. When it is unset, a production build has no server: single player works and the multiplayer entry says "Multiplayer is not available: no game server is configured for this site" and opens no socket. Dev and e2e builds still fall back to `ws://localhost:8787/ws`.
- **Server: a self-hosted Docker host running the GHCR image.**
  - `.github/workflows/deploy.yml` runs on every push to `main` and on `workflow_dispatch`: `deploy check` (the `pnpm check` gate), then `deploy client` (official Pages actions; `pages: write` and `id-token: write` only there) and `publish server image` (plain `docker`, `packages: write` only there). It builds the `runtime` target, checks `/healthz`, user `node` and the Node major, and pushes `ghcr.io/ossca-thorvg/gamejam-vampire-survivors-server:sha-<commit>` and `:main` with the job's `GITHUB_TOKEN`. The image is `linux/amd64`.
  - These jobs never run on pull requests and are not required checks of the main ruleset (ADR 0015).
  - The owner deploys by hand with `deploy/server/compose.yaml` and `deploy/server/.env` (`deploy/server/README.md`): one container named `vs-server`, `restart: unless-stopped`, published on `127.0.0.1:8787` by default, read-only root filesystem, all capabilities dropped, `no-new-privileges`, health check on `/healthz`.
  - The base image is pinned by digest in `packages/server/Dockerfile` (`NODE_DIGEST`, the multi-arch index of `node:24.22.1-alpine`), and CI checks the image's Node major against `.nvmrc`, because Docker ignores the tag when a digest is given.
- **Open item: domain and TLS.** The owner decides them later. Whatever is chosen must hold:
  - the server is reachable as `wss://<host>/ws` and `https://<host>/healthz` through a TLS-terminating reverse proxy on the same host, forwarding to `127.0.0.1:8787` with the WebSocket upgrade, the original `Origin` and `X-Forwarded-For`;
  - `TRUST_PROXY=1` behind that one proxy, `0` without it;
  - `ALLOWED_ORIGINS=https://ossca-thorvg.github.io` (the Pages origin; never empty);
  - then an admin sets the repository variable `VITE_SERVER_URL=wss://<host>/ws` and re-runs the deploy, and `pnpm --filter server exec node scripts/smoke.mjs https://<host> wss://<host>/ws https://ossca-thorvg.github.io` passes.
- **Repository settings an admin changes once:** Settings → Pages → Source: GitHub Actions; after the first publish, the GHCR package `gamejam-vampire-survivors-server` made public (or the host logs in with a `read:packages` token); later, the `VITE_SERVER_URL` variable.

## Alternatives considered

- **Cloudflare Pages for the client** — a root path and a real CSP header, but a second account and an API token in the repository's secrets; the owner chose GitHub Pages in the same organization.
- **Fly.io or Render for the server** — automatic deploys, but a third-party account, a token in the repository and, on Render's free tier, cold starts; the owner has a server.
- **Deploying to the owner's server from CI over SSH** — automatic, but puts a host credential in the repository's secrets, which the owner ruled out.
- **Hard-coding the server URL** — impossible while the domain is undecided, and it would put a host into the CSP before it exists.
- **Multi-arch images (amd64 and arm64)** — needs QEMU and buildx actions; deferred until the owner's host architecture requires it.

## Consequences

- The site can go live for single player before the server has a domain; multiplayer appears by setting one variable and re-running the deploy.
- A server deploy is manual and restarts the only instance, which drops running rooms; the owner deploys between matches. Every push to `main` still publishes an image, so `:main` may be newer than what runs.
- Pages cannot send headers: `frame-ancestors` and other header-only protections are absent on the public site. Revisit if clickjacking matters or the client moves to a host with headers.
- Bumping Node means updating both `.nvmrc` and `NODE_DIGEST`; CI fails when they disagree.
- Revisit this ADR when the domain and TLS are decided (record the host and proxy here or in a superseding ADR), if more than one server instance is ever needed (ADR 0006), or if the owner's host is not `linux/amd64`.
