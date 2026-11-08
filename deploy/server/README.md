# Running the game server in production

The client is on GitHub Pages; the game server runs on the owner's own host from the image that `.github/workflows/deploy.yml` publishes to GHCR on every push to `main` ([ADR 0017](../../docs/adr/0017-host-on-github-pages-and-a-self-hosted-server.md)). Deploys are manual: nothing in the repository holds SSH keys or host credentials.

## Requirements

- Docker with Compose v2 on a `linux/amd64` host (the published image is amd64 only).
- Exactly **one** running instance: rooms live in memory (ADR 0006).
- For the public site, a reverse proxy on the same host that terminates TLS: the Pages site is `https`, so the browser only opens `wss://` sockets.

## First run

Copy only this folder (`compose.yaml` and `.env.example`) to the host, then:

```sh
cp .env.example .env              # once; edit it (below). Never commit .env.
docker compose pull               # the image is public once its GHCR package is public; otherwise `docker login ghcr.io` with a read:packages token
docker compose up -d
docker compose ps                 # STATUS shows (healthy) after a few seconds
curl -fsS http://127.0.0.1:8787/healthz   # ok
```

## Settings (`.env`)

| Variable          | Production value                 | Why                                                                                         |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `VS_IMAGE`        | `...-server:sha-<commit>`        | Pin the commit you deploy; `:main` follows the latest push to `main`.                       |
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
docker compose pull && docker compose up -d   # new image, same settings; the running room state is lost
docker compose logs -f server
docker compose down
```

A deploy restarts the only instance, so players in a room are disconnected: deploy when no match is running.
