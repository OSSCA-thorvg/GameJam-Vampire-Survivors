# 0002. TypeScript pnpm monorepo with ESLint and Prettier

- Status: Accepted
- Date: 2026-11-07

## Context

- REQUIREMENTS 16: develop in TypeScript.
- Multiplayer needs a server (ADR 0006), and the client and server must agree on message shapes and game content (characters, weapons, interference items).
- The requester asked for ESLint and Prettier to be used throughout development (2026-11-07).

## Decision

**Layout.** One repository, pnpm workspaces, TypeScript `strict` everywhere:

```
packages/
  client/   Vite app, no UI framework (ADR 0009).
            src/main/   = main thread (DOM UI, input, networking)
            src/worker/ = game worker (ADR 0004)
  server/   Node + ws relay server (ADR 0006)
  shared/   Protocol message types, content data and constants used by both
assets/     Swappable game art + manifest.json (ADR 0007); served by the client
docs/       ADRs, roadmap, gameplay reference
```

- Vite builds the client, with native module-worker support. `tsx` runs the server in development. Vitest runs the tests in every package.
- `shared` contains no DOM, worker or Node-specific code, so all three runtimes can import it.
- Baseline versions at decision time: Node 24, pnpm 11, TypeScript 6.0 (7.x is newer, but `typescript-eslint` supports only < 6.1 at decision time; upgrade when it does), Vite 8, ws 8, `@thorvg/webcanvas` 1.1.3.

**Toolchain pinning** (the requester asked for Node version management and pnpm only, 2026-11-07)

- Supply-chain settings in `pnpm-workspace.yaml` (`minimumReleaseAge`, `allowBuilds`), `pnpm audit` and SHA-pinned actions are defined in ADR 0011.

- Node: `.nvmrc` pins the major version, `24`. Run `nvm use` (or fnm or volta, which read the same file) before working. CI reads `.nvmrc` through `actions/setup-node`'s `node-version-file`.
- pnpm is the only package manager:
  - root `package.json` sets `"packageManager": "pnpm@<exact version>"`, and Corepack (`corepack enable`) provides that exact pnpm;
  - `"engines": { "node": ">=24 <25", "pnpm": ">=11" }`, with `engineStrict: true` in `pnpm-workspace.yaml`, makes installs on the wrong versions fail (pnpm 11 ignores `.npmrc` settings other than auth and registry, found in #1; `.npmrc` keeps `engine-strict=true` for npm);
  - a `"preinstall": "npx only-allow pnpm"` script makes `npm install` and `yarn` fail;
  - `pnpm-lock.yaml` is committed, while `package-lock.json` and `yarn.lock` are git-ignored.

**Code quality**

- ESLint uses one flat config, `eslint.config.js`, at the root: `@eslint/js` recommended plus `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked`, with type information from the workspace `tsconfig`. Its last entry is `eslint-config-prettier`, so ESLint never reports formatting.
- Project rules:
  - `no-console` is an error, except `warn` and `error`.
  - `@typescript-eslint/no-floating-promises` is an error.
  - `import type` is used for type-only imports (`consistent-type-imports`).
  - No `any` without an `eslint-disable` comment that gives the reason.
- Prettier owns formatting through one root `.prettierrc.json`: `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`. A `.prettierignore` covers build output and `assets/`.
- Root scripts: `lint`, `lint:fix`, `format`, `format:check`, `typecheck` (`tsc -b`), `test`, `build`, and `check`, which runs `format:check`, `lint`, `typecheck`, `test` and `build` in order.
- **A pre-commit hook always runs Prettier and ESLint before a commit is created** (requested 2026-11-07):
  - `simple-git-hooks` installs `.git/hooks/pre-commit` automatically from the root `"prepare": "simple-git-hooks"` script, so every `pnpm install` registers it with no manual step.
  - The hook runs `lint-staged` on staged files: `prettier --write`, then `eslint --fix --max-warnings=0` for `*.{ts,js,mjs}`; `prettier --write` only for `*.{json,md,css,html,yml}`.
  - Any remaining ESLint error or warning aborts the commit.
  - Committing with `--no-verify` or `HUSKY=0`-style bypasses is forbidden for people and agents. CI's `pnpm check` is the backstop if a hook was skipped.
- CI (`.github/workflows/ci.yml`) runs on every PR and every push to `main`, with three jobs:
  - `pnpm check` (format, lint, typecheck, test, build), which starts running automatically once `package.json` exists;
  - `repo rules`: `labels.json` is valid and every ADR is indexed;
  - `PR rules`: the PR title is `<prefix>: …` with no `(#N)` suffix (changed by #32; GitHub appends the PR number to the squash commit), the body contains `Closes #N`, the branch is `<prefix>/issue-<N>-<slug>`, and commit subjects are prefixed and carry no AI attribution.

  A PR is merged only when all three pass (see the `issue-finish` skill). All three should be required status checks in `main`'s branch protection.

## Alternatives considered

- **Separate repositories for client and server** — protocol types would drift; one jam team does not need the overhead.
- **npm/yarn workspaces** — workable; pnpm chosen for strict dependency isolation and speed.
- **Biome instead of ESLint + Prettier** — faster with a single tool, but the requester asked for ESLint and Prettier, and `typescript-eslint`'s type-aware rules (floating promises) matter here.
- **Husky** — heavier than `simple-git-hooks` for a single hook.

## Consequences

- A protocol change is one commit touching `shared`, `server` and `client`, and type errors show every place that must follow.
- Type-aware linting is slower than plain linting; it is acceptable at this size.
- Formatting is never a review topic: `format:check` fails CI instead.
