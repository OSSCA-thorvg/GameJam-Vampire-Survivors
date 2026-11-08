# verify-game feature map

One file per user-facing feature. A PR that adds or changes user-facing behaviour, its entry points or its preconditions updates the feature's file in the same PR (`.claude/rules/docs-sync.md`); a behaviour without an entry here is not verified. The procedure (launch, doctor, drivers, evidence, cleanup) is in `../SKILL.md`.

| File             | Feature                                                                 | Since |
| ---------------- | ----------------------------------------------------------------------- | ----- |
| `boot.md`        | page load, worker start, ThorVG `gl`, test scene, unsupported browsers  | #2    |
| `hidden-tab.md`  | the hidden-tab background policies `'pause'` and `'simulate'`           | #2    |
| `debug-tools.md` | the dev-only perf overlay and fast-forward, and their absence in builds | #2    |

## Baseline preconditions

- `pnpm verify:launch` succeeded and `pnpm verify:doctor` prints only `ok` lines (the served revision is `HEAD`).
- The page is `client.json`'s `url` (`http://localhost:5180/`), loaded fresh for each journey; `__vsTest.snapshot()` reports `ready: true` and `renderer: 'gl'` before anything is driven.
- No server unless the feature says so (then `pnpm verify:launch --with-server`; the first server journey arrives with #19).

## Driving conventions

- Two drivers, same journeys: **Claude in Chrome** (interactive sessions, real Chrome and GPU) and **Playwright** (headless smoke with SwiftShader, a headed native hidden-tab fixture, CI under Xvfb, and the fallback when the extension is not connected). The hidden fixture owns a newly launched browser process/profile and uses `noDefaults` on its existing context; it never attaches to a user browser. Select it with `--project hidden-tab`, and select ordinary smoke with `--project chromium`. `../SKILL.md` § Drive has the rules for both.
- Input is real keyboard input: `computer` `key` (extension), `page.keyboard` or `holdKeys` (Playwright). Screens from #9 on are found by ARIA role and name.
- State comes only from `window.__vsTest.snapshot()` / `waitFor` (dev and e2e builds). The bridge only reads; nothing sets gameplay state.
- Debug keys (`CLAUDE.md` table) and `__vsDebug.post` only reach preconditions; say which ones a journey used.
- Wait on snapshot predicates (`waitForSnapshot`, `__vsTest.waitFor`), not fixed sleeps, except where a feature measures time.

## Reporting

- Per criterion: the feature file and journey, the driver, the proof level (`.claude/rules/verification.md`), the key snapshot values, and the evidence paths under `verification/issue-<N>/`.
- A journey that fails or cannot be driven is reported as failed or skipped with the reason, never weakened or silently dropped. Skipped journeys and partial proof (for example level 4 instead of 5) are listed explicitly in the PR's Verification section, and the reason goes into the feature's `Gotchas`.

## Feature entry contract

Every feature file starts with `# <Feature name>` and one sentence on what it is, then has exactly these four H2 sections, in this order:

1. `## Sub-features`: the behaviours to check, each with its expected observation (snapshot fields and values, DOM text, visible change).
2. `## How to get to it (user POV)`: what a player does to reach it from a fresh page load, and any precondition (with the debug key or server it needs).
3. `## Driving it`: two subsections, `### Claude in Chrome` (the tool calls in order) and `### Playwright` (a complete spec that imports `../../../e2e/helpers`, saved to `verification/issue-<N>/journeys/<feature>.spec.ts` to run). Both check the same observations.
4. `## Gotchas`: what is flaky, slow, driver-specific or unprovable, with the date and the issue that found it.

Snapshot fields a feature relies on are registered by name with `registerSnapshotField` (worker) or `registerMainSnapshotField` (main thread) and listed in its `Sub-features`.

## Gotchas

- `verify:launch --with-server` was proven in #31 both ways (2026-11-08): reusing a server already answering `/healthz` (left running by cleanup) and starting the `vs-verify` compose project (`docker compose -p vs-verify down` by cleanup). It needs `.env` (`cp .env.example .env`); keep it until cleanup has run, since `compose down` reads it too. `down` keeps the `vs-verify-server` image and the `vs-verify_server_node_modules` volume as a cache.
- A server started with `pnpm server:up` uses the same host port 8787, so `--with-server` reuses it instead of starting `vs-verify`.
