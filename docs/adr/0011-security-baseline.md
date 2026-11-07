# 0011. Security baseline: supply chain, server, client, containers and secrets

- Status: Accepted
- Date: 2026-11-07
- Related issues: F1, F4, M1, M2, R2 (`docs/roadmap.md`)

## Context

- The requester asked for protection against supply-chain attacks by installing only packages published at least one week ago, and for security to be enforced through skills and rules (2026-11-07).
- The game has a public WebSocket server (ADR 0006), a static client that renders user-supplied nicknames (ADR 0009), a Docker image (ADR 0010) and CI that runs third-party actions.
- Verified on 2026-11-07 with pnpm 11.1.2:
  - `minimumReleaseAge: 10080` in `pnpm-workspace.yaml` makes resolution skip versions younger than 7 days (`vite@^8` resolved to 8.3.5, skipping 8.3.6, which was 2 days old).
  - pnpm 11 reads the build-script allow-list from `allowBuilds`; `onlyBuiltDependencies` is ignored.
  - An install whose dependency wants to run an unlisted lifecycle script exits with `ERR_PNPM_IGNORED_BUILDS`.
  - `esbuild` works with its postinstall disabled.

## Decision

### Supply chain

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, so only versions published at least 7 days ago are installed.
- `minimumReleaseAgeExclude` is the only bypass. Each entry carries a comment with the reason and the approving issue or ADR, and is removed once the version is older than 7 days.
- Dependency lifecycle scripts are blocked: `allowBuilds` lists every package that wants a script, and new entries default to `false`. Setting `true` needs a reason comment and a PR that explains why the package cannot work without its script.
- `pnpm-lock.yaml` is committed. CI installs with `pnpm install --frozen-lockfile`, so a PR cannot change resolved versions without a lockfile diff.
- Adding a dependency requires a justification in the PR body: why the platform or existing code is not enough, and the package's age, weekly downloads, maintainers and its own dependency count (`npm view <pkg> time maintainers dependencies`). Prefer no new dependency. The client's runtime dependency budget is `@thorvg/webcanvas` only (ADR 0009).
- CI runs `pnpm audit --audit-level=high` once `package.json` exists. A high or critical advisory fails the build until it is fixed or explicitly accepted in an issue.
- GitHub Actions:
  - every `uses:` is pinned to a full 40-character commit SHA with the version in a trailing comment, and CI rejects unpinned actions;
  - workflows run with `permissions: contents: read` unless a job documents why it needs more;
  - `actions/checkout` runs with `persist-credentials: false`.
- Dependabot updates GitHub Actions weekly. It is not enabled for npm, because its PRs would propose versions younger than `minimumReleaseAge` and fail install. npm updates are made deliberately with `pnpm update` and land through the normal issue/PR flow.

### Server (ADR 0006)

- Every incoming WebSocket message is size-checked before parsing (at most 4 KiB; `ws` `maxPayload: 4096`), parsed in a `try`, and validated against the `shared/src/protocol.ts` schema. Unknown `type`s, extra fields or wrong types close the connection with code 1008.
- Each connection is rate-limited with a token bucket: 20 messages per second sustained, a burst of 40. Exceeding it closes the connection. Status messages are additionally capped at 4 Hz (ADR 0006).
- Connections are refused during the upgrade when the `Origin` header is not in the `ALLOWED_ORIGINS` environment variable, which is a comma-separated list. In production, this list must not be empty.
- At most 10 concurrent connections per client IP.
- Room codes:
  - they come from `crypto.randomInt` over a 31-character alphabet with 6 characters, about 887 million codes;
  - after 10 failed join attempts in 60 seconds, an IP is locked out of joining for 60 seconds;
  - error messages do not reveal whether a code exists for a different reason than "not joinable".
- Nicknames are normalized (NFC), trimmed, limited to 1–12 characters, and rejected if they contain control characters, bidi overrides or zero-width characters. The server stores and relays the normalized value only.
- The server never trusts client-reported results beyond what ADR 0005 accepts. It does not log message bodies, only types and sizes.

### Client (ADR 0009)

- User-controlled text (nicknames, room codes, server errors) is rendered with `textContent` or `h()`, never `innerHTML`, `insertAdjacentHTML` or `document.write`. `eval`, `new Function` and string `setTimeout` are banned. ESLint enforces these with `no-eval`, `no-implied-eval`, `no-new-func` and a `no-restricted-properties` rule for `innerHTML`, `outerHTML` and `insertAdjacentHTML`.
- The production build ships this Content Security Policy, as a response header where the host supports it and otherwise as a `<meta>` tag minus `frame-ancestors`:
  ```
  default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' wss://<server-host>;
  img-src 'self' data: blob:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'
  ```
  `'wasm-unsafe-eval'` is required to compile ThorVG's WASM. ThorVG is built with `-sDYNAMIC_EXECUTION=0`, so `'unsafe-eval'` should not be needed. F2 verifies this in a production build, and R2 verifies it on the deployed site. The Vite dev server does not apply the CSP.
- The client holds no secrets. Anything under `VITE_*` is public by definition.

### Containers (ADR 0010)

- The runtime image runs as the non-root `node` user, contains only production dependencies, and has no build tools, `.env` files or secrets baked in. Configuration comes from environment variables at run time.
- Base images use the official `node:<major>-alpine`. A digest pin is added in R2 for the deployed image.

### Secrets

- `.env` files are never committed (`.gitignore`); `.env.example` holds safe defaults only.
- Deployment credentials live only in GitHub Actions secrets or the host's secret store. They are never stored in the repository, in issue or PR text, or in logs.

### Enforcement

- `.claude/rules/security.md` is the checklist.
- The `security-check` skill runs before opening any PR that touches dependencies, the lockfile, `pnpm-workspace.yaml`, the server, the protocol, Docker files, CI workflows, or DOM rendering of user data. A high-severity finding blocks the merge.

## Alternatives considered

- **No release-age delay, relying on `pnpm audit`** — audits only catch known advisories; the delay also covers the window before a malicious release is reported.
- **A longer delay (14–30 days)** — safer, but slows security fixes. Urgent fixes can still be pulled in through `minimumReleaseAgeExclude`.
- **Allowing lifecycle scripts by default** — pnpm 11's blocking default is safer, and the one known script user, esbuild, works without its script.
- **Dependabot or Renovate for npm** — their PRs conflict with `minimumReleaseAge` unless configured with a matching delay. They can be revisited with Renovate's `minimumReleaseAge` if manual updates lag.
- **Tag-pinned actions (`@v7`)** — tags are mutable; SHA pins are not.

## Consequences

- New package versions arrive at least a week late. Urgent fixes need an explicit, documented exclusion.
- Installing a dependency that wants a lifecycle script fails until someone decides `true` or `false` in `allowBuilds`.
- Actions must be bumped by SHA. Dependabot automates that.
- The CSP must be updated in the same PR whenever the client gains a new origin, such as a different server host.
