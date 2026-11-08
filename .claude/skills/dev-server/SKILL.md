---
name: dev-server
description: Start, stop, rebuild, inspect and troubleshoot the game server in Docker (docker compose), and run the client against it. Use whenever the server must run for development or testing ("서버 띄워줘", "start the server", "server logs", "rebuild the server image"), or when server dependencies, env vars or ports change.
---

# dev-server

Rules: `.claude/rules/docker.md`. Decision: `docs/adr/0010-run-the-server-in-docker.md`. Files: `packages/server/Dockerfile` (stages `base`, `dev`, `build`, `runtime`), `compose.yaml` (service `server`, named volume `server_node_modules`), `.dockerignore`, `.env.example`. Never run the server with `node` or `tsx` on the host.

## Prerequisites

```sh
docker info >/dev/null && echo docker-ok    # Docker Desktop, OrbStack or Colima must be running
test -f .env || cp .env.example .env         # local env, never committed
```

## Common tasks

| Task                       | Command                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Start, building if needed  | `pnpm server:up`                                                                    |
| Follow logs                | `pnpm server:logs`                                                                  |
| Health check               | `curl -fsS http://localhost:8787/healthz`                                           |
| Status and health          | `docker compose ps`                                                                 |
| WebSocket check            | `pnpm --filter server exec node scripts/ws-hello.mjs http://localhost:5173`         |
| Shell inside the container | `pnpm server:sh`                                                                    |
| Stop                       | `pnpm server:down`                                                                  |
| Build the deployable image | `pnpm server:image` (target `runtime`, tag `vs-server:local`)                       |
| Run the client against it  | `nvm use && pnpm --filter client dev` with `VITE_SERVER_URL=ws://localhost:8787/ws` |

Source edits in `packages/server/src` and `packages/shared/src` hot-reload inside the container (`tsx watch --conditions=development` on the bind-mounted source). After changing dependencies or the lockfile, run `pnpm server:up` again so the image and its dependency volume are rebuilt.

## After changing dependencies, env vars or ports

1. Update `packages/server/Dockerfile`, `compose.yaml` and `.env.example` together.
2. Rebuild and verify both targets:
   ```sh
   pnpm server:up && curl -fsS http://localhost:8787/healthz
   pnpm server:image && docker run --rm -d -p 18787:8787 --name vs-smoke vs-server:local \
     && sleep 3 && curl -fsS http://localhost:18787/healthz; docker rm -f vs-smoke
   docker run --rm vs-server:local id -un    # must print "node", not root
   ```

## Troubleshooting

- **Port 8787 is in use:** run `lsof -i :8787` and stop the other process. Do not change the port in only one file.
- **Dependency errors after a pull:** run `docker compose down -v server` to drop the dependency volume, then `pnpm server:up`.
- **Unhealthy container:** run `docker compose ps` and `pnpm server:logs`. The health check calls `/healthz`.
- **WebSocket upgrade rejected with 403:** the page's `Origin` is not in `ALLOWED_ORIGINS` in `.env`. Add it there (comma-separated) and run `pnpm server:up` again.
- **The server exits with `config_invalid`:** `LOG_LEVEL` must be `info` or `debug`, and `PORT` an integer.
- **A different Node version is wanted:** change `.nvmrc` in a PR. The image follows it through `NODE_VERSION`.
