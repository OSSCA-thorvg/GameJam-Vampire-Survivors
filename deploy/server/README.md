# Running the game server in production

The client is on GitHub Pages ([ADR 0017](../../docs/adr/0017-host-on-github-pages-and-a-self-hosted-server.md)); the game server runs on the owner's own host, which builds the `runtime` image from a clone of this repository ([ADR 0023](../../docs/adr/0023-build-the-server-image-on-the-owners-host.md)). No registry is involved: GitHub keeps only the code and the Pages client. Deploys are manual: nothing in the repository holds SSH keys or host credentials.

## Requirements

- Git, and Docker with Compose v2 and BuildKit (the default builder). The image is built for the host's own architecture.
- Exactly **one** running instance: rooms live in memory (ADR 0006).
- For the public site, a reverse proxy on the same host that terminates TLS: the Pages site is `https`, so the browser only opens `wss://` sockets.

## First run

Clone the repository on the host; every command below runs from its root. The build context is the whole clone, so the folder alone is not enough.

```sh
git clone https://github.com/OSSCA-thorvg/GameJam-Vampire-Survivors.git && cd GameJam-Vampire-Survivors
cp deploy/server/.env.example deploy/server/.env      # then edit it (below). Never commit .env.
NODE_VERSION=$(cat .nvmrc) docker compose -f deploy/server/compose.yaml up -d --build
docker compose -f deploy/server/compose.yaml ps       # STATUS shows (healthy) after a few seconds
curl -fsS http://127.0.0.1:8787/healthz               # ok
```

The build produces `vs-server:local`, the same `runtime` target that CI's `server image` job checks on every pull request (non-root `node`, production dependencies only, `HEALTHCHECK` on `/healthz`); `NODE_VERSION` comes from `.nvmrc` and the base image is pinned by digest in `packages/server/Dockerfile`.

## Settings (`.env`)

| Variable          | Production value                 | Why                                                                                         |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `VS_BIND`         | `127.0.0.1`                      | Only the reverse proxy on the same host reaches the container.                              |
| `VS_HOST_PORT`    | `8787`                           | The host port the proxy forwards to.                                                        |
| `ALLOWED_ORIGINS` | `https://ossca-thorvg.github.io` | The WebSocket accepts upgrades only from the Pages origin (ADR 0011). Never leave it empty. |
| `TRUST_PROXY`     | `1` behind the proxy, else `0`   | Rate limits then use the right-most `X-Forwarded-For` entry, which the proxy sets.          |
| `LOG_LEVEL`       | `info`                           | `debug` adds per-message types; bodies, nicknames and IPs are never logged.                 |

## Behind a reverse proxy (TLS)

The domain and TLS setup are still open (ADR 0017). Whatever proxy is chosen must:

- serve `https://<host>/healthz` and upgrade `wss://<host>/ws` to `http://127.0.0.1:8787` (pass `Upgrade` and `Connection` headers, keep the original `Origin`, and set `X-Forwarded-For`);
- keep idle WebSockets open for at least 60 s (the server pings every 15 s).

Caddy, for example, does all of this with `reverse_proxy 127.0.0.1:8787` in a site block for the host name.

Then an admin sets the repository variable `VITE_SERVER_URL` to `wss://<host>/ws` and re-runs the deploy workflow (`gh workflow run deploy.yml`), so the Pages build points at the server and its CSP allows it. Until then, the site runs single player and the multiplayer entry says no server is configured.

## Check the deployment

From a clone of the repository, against the public URLs:

```sh
pnpm --filter server exec node scripts/smoke.mjs https://<host> wss://<host>/ws https://ossca-thorvg.github.io
```

It checks `/healthz`, has two clients create and join a room, and confirms an upgrade from a foreign `Origin` is refused.

## Update, logs, stop

```sh
git pull --ff-only                                                          # the commit to deploy (or git checkout <commit>)
NODE_VERSION=$(cat .nvmrc) docker compose -f deploy/server/compose.yaml up -d --build   # rebuild, same settings; the running room state is lost
docker compose -f deploy/server/compose.yaml logs -f server
docker compose -f deploy/server/compose.yaml down
```

A deploy restarts the only instance, so players in a room are disconnected: deploy when no match is running.

## Owner step, once

Until #144 (ADR 0023), `deploy.yml` pushed the image to GitHub Container Registry. Nothing publishes or reads it any more. An organization owner deletes the old package once: github.com/orgs/OSSCA-thorvg/packages → `gamejam-vampire-survivors-server` → Package settings → Delete package.
