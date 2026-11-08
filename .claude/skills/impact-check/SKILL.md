---
name: impact-check
description: Check what an issue or branch could break beyond its own files, and prove the one fact it is safe because of by running real code. Scope mode runs before coding (from issue-start) to confirm the work's real boundaries; proof mode runs before the PR (from issue-finish). Adapted from the pstack blast-radius skill for this game (worker/protocol messages, content and asset IDs, pools, caps, performance budget, ADRs). Use for "작업 범위 확인", "what could this break", "impact check", or a diff you do not trust yet.
---

# impact-check

Rules: `.claude/rules/verification.md`. Listing callers is not the job; grep does that in seconds. The job is the breakage grep will not show you. Do not trust a write-up that merely sounds right: find the one or two facts the change's safety depends on, and prove them by running code.

## Where breakage hides in this project

Check each of these that the change touches:

- **Thread boundary (ADR 0004):** messages in `packages/client/src/protocol/worker-messages.ts`. Both the sender and the receiver must handle a changed shape, and nothing may cross the boundary per frame per entity.
- **Dev debug tools (#2):** `DebugCommand` kinds and the reserved key codes in `CLAUDE.md`'s table; `registerDebugKey`, `registerDebugHandler` and `registerPerfStat` callers. A call outside `if (import.meta.env.DEV)` ships debug code to production: `grep -r __vsDebug packages/client/dist` must print nothing after `pnpm --filter client build`.
- **WASM and CSP delivery (#2):** `/thorvg/thorvg.wasm` (the `copyThorvgWasm` plugin and `initThorVG`'s `locateFile`), and the preview CSP in `packages/client/vite.config.ts`, which mirrors ADR 0011 plus `worker-src blob:` for the support probe.
- **Network protocol (ADRs 0005, 0006):** `packages/shared/src/protocol.ts`, the server validators, rate limits and size limits, and the protocol version. An old client against a new server must fail cleanly.
- **Content data (ADR 0008):** IDs referenced across characters, weapons, evolutions, passives, waves and pickups, plus the debug keys that grant them.
- **Asset IDs (ADR 0007):** `assets/CATALOG.md`, `assets/manifest.json`, generated `ASSET_IDS`, and the mass-art budget.
- **Frame loop and pools (ADRs 0003, 0004):** allocation per frame, Paint creation or disposal per frame, pool sizes, entity caps, the hidden-tab loop, and the 120-step cap.
- **Determinism:** seeded RNG streams (`rng.fork`). A new random call in the wave path changes both players' schedules.
- **Rendering cost:** vector complexity, the number of Paints, and `update()` time. Compare with ADR 0003's numbers.
- **Server in Docker (ADR 0010):** env vars, ports, `.env.example`, `compose.yaml` and the `Dockerfile`; the `@vs/shared` `exports` conditions (`development` source for dev and tests, `default` compiled `dist` in the runtime image); and the CI `server image` job, which builds the `runtime` image and checks `/healthz`, health and the `node` user whenever the server, `shared`, Docker files, the lockfile or `.nvmrc` change.
- **Security (ADR 0011):** user data reaching the DOM, new dependencies, CI permissions.
- **Docs that go stale (`docs-sync.md`):** `CLAUDE.md` commands and architecture, and the verification map.
- **Workflow and CI (ADR 0012):** rules, skills and `CLAUDE.md` that reference each other by name or step number, the CI `repo rules` and `PR rules` steps that grep them, and `.github/workflows/auto-merge.yml`, which merges on green CI.

## Scope mode (before coding, from issue-start)

1. Read the issue's implementation plan and the code it will touch, including how the touched code is used today.
2. Write down three things:
   - **Changes:** the symbols, messages, data and files that will change, including behaviour the plan leaves implicit.
   - **Consumers:** for each item, every place that reads or depends on it. Follow what grep misses: JSON or message shapes, IDs used as strings, generated files, the other thread, the server.
   - **The one safety fact:** the single fact the change is safe because of, for example "the new `levelUpOffer` field is optional and the only reader is C6's screen".
3. If the consumers reach beyond the issue's scope, update the issue body (or split it) before coding.
4. Post it as the issue's start comment (`issue-start` step 6), written to a file and passed with `--body-file`. Keep it short: three headed bullet lists, no prose.

## Proof mode (before the PR, from issue-finish)

1. Re-read the diff against the scope notes. Anything changed that was not in scope gets the same consumer analysis.
2. Push the safety fact as far down the proof levels as it will cheaply go, and reach at least **level 4**: a Vitest test or a small script under `scripts/verify/` that calls the real code and fails loudly if the fact is wrong. Run it and keep its output in `verification/issue-<N>/`.
3. Rate each remaining risk by likelihood and cost. Keep the confirmed ones, and list what you checked and cleared, citing a real `file:line`. A search that finds nothing is an answer. Never invent a caller.
4. For user-visible effects, hand off to `verify-game` for level-5 proof (until it exists, run the app manually with the same evidence standard).
5. For a large or cross-cutting change, run this mode in two independent subagents, give neither the other's conclusion, and merge their findings.

## Report (goes in the PR body under "Impact")

- **What it does:** including the part that is not obvious.
- **Safety fact:** the fact, the proof level it reached, and the proof (the command and its output). Write "unproven" if it is unproven.
- **Risks:** how each would break, `file:line`, likelihood and cost, and how to check it.
- **Cleared:** what was checked and why it is fine.
