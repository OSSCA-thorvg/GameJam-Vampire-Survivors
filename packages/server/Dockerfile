# Game server image (ADR 0010). Build context: the repository root.
# NODE_VERSION is always passed from .nvmrc by the root scripts and CI; the default only lets the file parse.
ARG NODE_VERSION=24
# The base image is pinned by digest (ADR 0011, ADR 0017): the multi-arch index of node:24.22.1-alpine, built
# 2026-10-21 (at least 7 days old when pinned on 2026-11-09). With a digest, Docker ignores the tag, so CI checks that
# the image's Node major matches .nvmrc. Bump both together: `docker buildx imagetools inspect node:<version>-alpine`.
ARG NODE_DIGEST=sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# pnpm comes through Corepack at the version pinned in package.json's packageManager.
RUN corepack enable
WORKDIR /repo
# pnpm-workspace.yaml carries minimumReleaseAge and allowBuilds, so the supply-chain policy applies here too (ADR 0011).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
# Only the client's manifest, so the frozen lockfile's importer list matches the workspace.
COPY packages/client/package.json packages/client/

# Development: tsx watch on the source that compose.yaml bind-mounts; dependencies stay in a named volume.
FROM base AS dev
# --ignore-scripts skips the root preinstall/prepare scripts (only-allow, git hooks), which mean nothing here.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter server... --ignore-scripts
COPY tsconfig.base.json ./
CMD ["pnpm", "--filter", "server", "dev"]

# Build: compile shared and server, then deploy the server with production dependencies only to /out.
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter server... --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter server... build && pnpm deploy --legacy --filter server --prod --ignore-scripts /out

# Runtime: only /out, non-root, no build tools, .env or secrets (ADR 0011). Configuration comes from the environment.
FROM node:${NODE_VERSION}-alpine@${NODE_DIGEST} AS runtime
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "dist/index.js"]
