# Security rules (ADR 0011)

Run the `security-check` skill before opening a PR that touches any of these:
- dependencies, `pnpm-lock.yaml` or `pnpm-workspace.yaml`;
- `packages/server` or `packages/shared/src/protocol.ts`;
- Docker files or `.github/workflows`;
- code that puts user data into the DOM.

A high-severity finding blocks the merge.

## Dependencies

- Never lower or remove `minimumReleaseAge: 10080`. Bypass only through `minimumReleaseAgeExclude`, with a reason comment and the approving issue, and remove the entry after 7 days.
- New entries in `allowBuilds` default to `false`. `true` needs a reason comment and a PR explanation.
- Every new dependency is justified in the PR body: why it is needed, age, weekly downloads, maintainers and dependency count. Prefer no new dependency. The client's runtime dependencies stay limited to `@thorvg/webcanvas`.
- Commit `pnpm-lock.yaml`. Never hand-edit it, and never use `--no-frozen-lockfile` in CI.
- `pnpm audit --audit-level=high` must pass, or the advisory is accepted in an issue with a reason.

## CI

- Pin every `uses:` to a 40-character commit SHA with a `# vX.Y.Z` comment.
- Keep `permissions: contents: read` unless a job documents why it needs more.
- `actions/checkout` runs with `persist-credentials: false`.
- Never echo secrets. Never run `pull_request_target` workflows on untrusted code.

## Server

- Check the size (at most 4 KiB) before parsing, parse in a `try`, and validate against the protocol schema. On a violation, close the connection with 1008.
- Rate-limit per connection (20 messages per second sustained, burst 40), allow at most 10 connections per IP, and allow-list `Origin` through `ALLOWED_ORIGINS`.
- Room codes come from `crypto.randomInt`. After 10 failed joins in 60 seconds, lock the IP out for 60 seconds.
- Nicknames: NFC, trimmed, 1–12 characters, with no control, bidi or zero-width characters.
- Log message types and sizes, never message bodies or IPs beyond rate-limit bookkeeping.

## Client

- Render user data with `textContent` or `h()` only. No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` or string `setTimeout`.
- Keep the production CSP from ADR 0011 in sync with every origin the client talks to.
- No secrets in client code or `VITE_*` variables.

## Containers and secrets

- The runtime image runs as `node` (non-root) with production dependencies only, and no secrets or `.env` baked in.
- Never commit `.env`. Keep secrets in GitHub Actions secrets or the host's secret store, never in issues, PRs, logs or commits.
