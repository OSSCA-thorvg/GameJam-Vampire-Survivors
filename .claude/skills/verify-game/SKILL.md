---
name: verify-game
description: Launch the real game, drive it the way a player does (Claude in Chrome when the extension is connected, Playwright otherwise) and keep screenshots, console logs and state snapshots as evidence. Use to prove a user-visible acceptance criterion at proof level 5, to run the feature map in `.claude/skills/verify-game/features/`, or for "verify in the game", "level 5", "run it in the browser", "게임에서 확인", "실제로 돌려봐".
---

# verify-game

Proof standards: `.claude/rules/verification.md`. User-visible acceptance criteria need **level 5** (reproduced in the running game); the safety fact from `impact-check` needs level 4. Evidence is screenshots plus page and worker console logs plus snapshot JSON, kept in the git-ignored `verification/issue-<N>/`. Dev debug keys (#2) may only reach a precondition; the behaviour under test is driven with real input.

The feature map is `features/`: one file per user-facing feature, read `features/README.md` first. Drive every entry point the map lists for the feature you changed, not just the convenient one.

## Launch

Once per clone: `nvm use`, `corepack enable`, `pnpm install`, `pnpm exec playwright install chromium` (the browser is never downloaded by an install script).

```sh
pnpm verify:launch                 # client in --mode e2e on http://localhost:5180 (fixed port)
pnpm verify:launch --with-server   # also the Docker server on :8787 (reuses a running one; needs .env)
```

- It records what it started in `verification/.run/` (`client.json`: `pid`, `port`, `url`, `rev`, `startedAt`; `server.json`: `reused`, `project`).
- It is ready only when `window.__vsTest.snapshot()` reports `ready: true` and `renderer: 'gl'` (checked in headless Chromium), within 30 s; otherwise it prints the Vite log tail and exits 1.
- Port 5180 busy: it exits 1 with "port 5180 is in use: run `pnpm verify:cleanup` or free it". It never moves to another port, and never touches the user's `pnpm dev` on 5173.

## Doctor

```sh
pnpm verify:doctor
```

Read-only. One `ok`/`fail` line per check: `client.json` exists, the URL answers, the PID is alive, `__vsTest` answers with `ready` and `gl`, `buildRev` equals `git rev-parse HEAD` (a mismatch is a stale server: cleanup, then launch again), and `/healthz` when a server is recorded. Do not drive anything until every line is `ok`.

## Drive

Pick the driver, then follow the feature file's **Driving it** section for that driver.

**1. Claude in Chrome (preferred in an interactive Claude Code session).** Real Chrome, real GPU WebGL.

- Load the tools in ONE ToolSearch call: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__gif_creator,mcp__claude-in-chrome__tabs_close_mcp`.
- **Detection:** call `tabs_context_mcp` (with `createIfEmpty: true`) first. If the tools are missing, or the call errors because the extension is not installed or connected, say so and use the Playwright driver. Stop after 2–3 failed extension calls; never keep retrying.
- Always work in a NEW tab (`tabs_create_mcp`, or the empty tab of the group `tabs_context_mcp` just created); never reuse the user's tabs. `navigate` it to the `url` from `client.json`.
- Input: real key presses with `computer` `key` (`ArrowRight`, `` ` ``, `]`; `repeat` for several presses). It cannot hold a key for a duration (see Gotchas in the feature files).
- State: `javascript_tool` with `JSON.stringify(await window.__vsTest.snapshot())`, or `await window.__vsTest.waitFor((s) => s.ready, 30000)`. The bridge exists in dev and e2e builds only.
- Console: `read_console_messages` with a `pattern` (for example `\[vs\]|\[debug\]|\[worker\]|error`). It returns page messages only; worker console lines are not included.
- Evidence: `gif_creator` `start_recording`, a `computer` `screenshot` right after, the actions with a screenshot after each (screenshots become the frames), a final screenshot, `stop_recording`, then `export` with `download: true` and a meaningful name such as `issue-<N>-<feature>.gif`. Save screenshots with `save_to_disk` and copy them, the GIF (from the browser's download folder) and a short notes file with the snapshots into `verification/issue-<N>/<feature>/`.
- Never trigger `alert`, `confirm` or `prompt` (they block the extension). Close every tab you opened with `tabs_close_mcp` before Cleanup.

**2. Playwright (headless smoke, headed native visibility, and CI).** Chromium; ordinary headless runs use SwiftShader for WebGL 2 (`--use-angle=swiftshader --enable-unsafe-swiftshader`), and `VERIFY_HEADED=1` runs that smoke project headed. The `hidden-tab` project always runs headed with its own fresh process/profile and the public `noDefaults` CDP connection, as documented in `features/hidden-tab.md`; it never attaches to a user browser.

- `pnpm verify:e2e` launches, runs both `chromium` smoke and headed `hidden-tab` projects, and always cleans up. `--issue <N>` picks the evidence folder, `--with-server` reaches launch, and remaining arguments reach Playwright unchanged. Use `--project chromium` for ordinary smoke and `--project hidden-tab` for native visibility. On Linux, install Chromium with `pnpm exec playwright install --with-deps chromium`, then use `xvfb-run -a pnpm verify:e2e` (also the CI command).
- A feature-map journey: save the spec from the feature file as `verification/issue-<N>/journeys/<feature>.spec.ts` (it imports `../../../e2e/helpers`), then, with the client launched:
  ```sh
  VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> \
    pnpm exec playwright test -c e2e/playwright.config.ts [<feature>]
  ```
  The config reads the URL from `client.json` when `VERIFY_URL` is unset.
- Helpers (`e2e/helpers.ts`): `openGame(page)`, `startRun(page)` (title, Enter, `playing`; #9), `snapshot(page)`, `waitForSnapshot(page, predicate, ms)`, `holdKeys(page, keys, ms)` (real `keyboard.down`/`up`), `startEvidence(page, journey)` (page and worker console, numbered screenshots, JSON), `pageErrors(ev)`.
- DOM: ARIA roles and names (`getByRole`) for screens (ADR 0009, from #9 on); until then, `#app` text. The canvas belongs to the worker (ADR 0004): never assert on canvas pixels through the DOM, read `__vsTest` instead.

**Both drivers:** state is read only through `__vsTest` (it never sets gameplay state); gameplay is driven only with real keyboard input. Debug keys and `__vsDebug.post` only reach preconditions, and the report says which were used.

## Evidence

- Folder: `verification/issue-<N>/` (`<N>` from `--issue <N>`, else `issue-(\d+)` in the branch name, else `verification/adhoc/`), one subfolder per journey.
- Per journey: screenshots before and after each action, `page-console.log`, `worker-console.log` (Playwright) or the filtered console read (extension), snapshot JSON, a GIF for extension runs, and a Playwright trace on failure (`playwright-output/`).
- Report per criterion: the feature-map journey, the driver, the proof level reached, the key snapshot values, and the evidence paths. A journey that fails, or cannot be driven, is reported as such, never weakened; record the reason in the feature's `Gotchas`.

## Cleanup

```sh
pnpm verify:cleanup
```

Stops only the process group recorded in `client.json` (never by name), runs `docker compose -p vs-verify down` only if `server.json` says `reused: false`, deletes `verification/.run/`, and leaves every evidence folder in place. Close the Claude in Chrome tabs you opened first.

## Helpers

| What                     | Where                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test bridge, main thread | `packages/client/src/main/test-bridge.ts`: `window.__vsTest`, `registerMainSnapshotField(name, read)`                                                 |
| Test bridge, worker      | `packages/client/src/worker/test-bridge.ts`: `registerSnapshotField(name, read)`                                                                      |
| Snapshot types           | `packages/client/src/protocol/worker-messages.ts`: `WorkerSnapshot`, `GameSnapshot`                                                                   |
| Scripts                  | `scripts/verify/`: `launch.mjs`, `doctor.mjs`, `cleanup.mjs`, `e2e.mjs`, `check-prod-bundle.mjs`, `lib.mjs`                                           |
| Playwright               | `e2e/playwright.config.ts`, `e2e/helpers.ts`, `e2e/smoke.spec.ts`, `e2e/hidden-tab.spec.ts`, `e2e/helpers/native-test.ts`, `e2e/helpers/hide-page.ts` |
| Production guard         | `pnpm build` runs `check-prod-bundle.mjs`: no `__vsTest`, `__vsDebug`, `testSnapshot`, `togglePerfOverlay`                                            |

A new feature registers its snapshot fields by name (never edit the bridges) and adds or updates its file in `features/` in the same PR (`.claude/rules/docs-sync.md`).
