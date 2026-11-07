# Docker rules (ADR 0010)

- The server runs in Docker, in development and in deployment. Start it with `pnpm server:up` (`docker compose up -d --build server`), not `node` or `tsx` on the host. Procedures: the `dev-server` skill.
- The client runs on the host (`nvm use`, `pnpm --filter client dev`) and talks to the containerized server at `VITE_SERVER_URL=ws://localhost:8787/ws`.
- Server unit tests may run on the host (`pnpm --filter server test`). Integration and manual testing go against the container.
- Changing server dependencies, environment variables or ports updates `packages/server/Dockerfile`, `compose.yaml` and `.env.example` in the same PR.
- `.env` is never committed. `.env.example` lists every variable with a safe default and a one-line comment.
- The image's `runtime` target:
  - runs as the non-root `node` user;
  - contains only production dependencies (`pnpm deploy --prod`);
  - keeps its `HEALTHCHECK` on `/healthz`.
- The Node version comes from `.nvmrc` through the `NODE_VERSION` build argument. Never hard-code a different version in the Dockerfile.
- Do not install `node_modules` from the host into the container or the reverse. Dependencies live in the named volume declared in `compose.yaml`.
- CI must build the `runtime` image and pass the in-container `/healthz` check for any PR touching the server, `shared`, Docker files or the lockfile.
