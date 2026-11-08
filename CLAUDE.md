# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The rules and project skills in `.claude/` are shared with Codex. Codex starts with [`AGENTS.md`](AGENTS.md), which maps work stages to these files and supplies equivalents for Claude Code-only commands and tools. Those adapters preserve the shared checks and merge gates.

Keep this file current: any PR that changes commands, architecture, workflow, rules or skills updates it in the same PR (`.claude/rules/docs-sync.md`). CI fails if a rule or skill is not mentioned here.

## Getting started

For a new contributor in a fresh clone. Nothing here depends on a particular machine, account or plugin.

- **Prerequisites:** Git, nvm, Docker (Docker Desktop, OrbStack or Colima, running), the GitHub CLI `gh` logged in with your own account that has access to `OSSCA-thorvg/GameJam-Vampire-Survivors` (`gh auth status`, then `gh repo view OSSCA-thorvg/GameJam-Vampire-Survivors --json nameWithOwner`), and Claude Code. The `dw` plugin is optional.
- **First session:** `nvm use`, `corepack enable`, then `pnpm install`. The install also registers the pre-commit hook (`.git/hooks/pre-commit`), so there is no manual hook setup.
- **Pick work:** `gh issue list -R OSSCA-thorvg/GameJam-Vampire-Survivors --label status:ready`. Every `status:ready` issue meets the readiness standard (`.claude/rules/issues.md`): it says what to set up, read and run, so you can start without asking. `docs/roadmap.md` shows the order.
- **The loop:** `/issue-start #N` → implement → `/issue-finish`. The auto-merge workflow merges the PR when CI passes.
- **When blocked:** comment on the issue saying what is missing, and label it `status:blocked` (`gh issue edit <N> -R OSSCA-thorvg/GameJam-Vampire-Survivors --remove-label status:in-progress --add-label status:blocked`).

## Project

A browser game in the style of Vampire Survivors, for single player and 2-player online versus play, rendered with ThorVG's `@thorvg/webcanvas`. Requirements are in `REQUIREMENTS.md`, written in Korean; ADRs cite its items by number. Every architectural choice is an ADR in `docs/adr/`. Read `docs/adr/README.md` first.

Current state: the toolchain exists (pnpm workspace with `@vs/client`, `@vs/server` and `@vs/shared`, lint, format, tests, the pre-commit hook and CI's `pnpm check`), and the client boots: the main thread transfers the canvas to the game worker, which runs ThorVG (`gl`) and the fixed-step loop on a test scene (#2). No gameplay yet. Work is planned as GitHub issues in phases (`docs/roadmap.md`).

## Workflow (mandatory)

- **Problems found while implementing:**
  - Ask the user right away if the problem blocks the issue or needs a decision.
  - Otherwise, create a follow-up issue to the readiness standard (or comment on the existing issue that covers it), list it under `## Follow-ups` in the PR, and finish the current issue without widening it (`.claude/rules/issues.md`).
- **Prerequisite gate:** before starting an issue, `issue-start` checks its "Depends on" issues. If any is open, or an artifact it promised is missing on `main`, stop, comment, and set `status:blocked`. CI also fails a PR whose issue still has open dependencies.
- **Delegate to subagents by default** (requested by the user):
  - Implement each issue in a subagent, briefed with the issue body **and all its comments**, the ADRs it cites, and this file. Comments can change the plan, so the brief tells the subagent to read the thread in full and to re-read it before finishing.
  - Run independent issues (for example, parallel roadmap tracks) in parallel subagents, each briefed with the worktree path that `issue-start` created for its issue.
  - Delegate research, reviews and the `security-check` pass the same way.
  - The main session plans, briefs, verifies the subagent's result against the acceptance criteria, and runs `issue-finish`.
  - Only trivial lookups and single-file edits stay in the main session.

- **Every issue starts with `/issue-start #N`, and only with it** (requested by the user). It runs the prerequisite gate, sets the assignee and `status:in-progress`, creates the issue's own worktree at `.claude/worktrees/issue-<N>` (all work happens there), checks the scope, and posts the start comment with the `<!-- issue-start -->` marker. CI rejects a PR whose issue lacks an assignee or that marker. Do not start issues with `/dw:impl`, `/dw:ship` or a branch in the main checkout. The procedure lives in the skill; this file does not restate it.
- **Check the scope first, and run what you write (`.claude/rules/verification.md`).** `issue-start` runs `impact-check` in scope mode: what changes, who consumes it, and the one fact the change is safe because of. Every code change is then run in the real app (the browser for the client, the Docker container for the server), not just read or unit-tested. `issue-finish` runs `impact-check` in proof mode (safety fact proven by running code, level 4) and drives user-visible criteria in the running game (level 5) with `verify-game` (Claude in Chrome when the extension is connected, Playwright otherwise; CI's `verify` job runs the Playwright smoke journey). Evidence stays in the git-ignored `verification/` folder and is summarized in the PR's **Impact** and **Verification** sections.
- **Resolve conflicts by rebasing (`.claude/rules/conflicts.md`).** When `main` moved or a PR conflicts, run `resolve-conflicts`: back up, rebase onto `origin/main`, keep both sides' intent, check functional compatibility, propagate `main`'s improvements, squash back to one commit and `git push --force-with-lease`. The PR body records it under **Conflicts**.
- **Finish with `issue-finish`.** It verifies the acceptance criteria, runs `pnpm check`, brings a stale branch up to date and opens the PR. The auto-merge workflow then squash-merges it as soon as CI passes and marks the issue `status:done`; `issue-finish` waits for the merge and verifies the result.
- Rules live in `.claude/rules/`:
  - `issues.md`
  - `commits.md`
  - `pull-requests.md`
  - `labels.md`
  - `security.md`
  - `docker.md`
  - `verification.md`: scope checks before coding, running every change, proof levels and evidence
  - `conflicts.md`: rebasing onto `main` and the fixed resolutions per file kind
  - `docs-sync.md`: which docs to update with which change, including this file

  Read the matching file before creating an issue, committing (use the `commit` skill), or opening a PR.

- New issues go through `issue-create`; each needs a detailed **Implementation plan** section. Labels come from `.github/labels.json`, synced with `label-sync`; their meanings are in `.claude/rules/labels.md`.
- A decision that binds later work gets an ADR through `adr-new` in the same PR. Do not contradict an accepted ADR. Supersede it.
- The project's rules and skills are complete on their own; the `dw` plugin is not needed. Its label, branch, commit and `gh` conventions are restated in `.claude/rules/labels.md`, `commits.md` and `pull-requests.md`. Even if the dw plugin is installed, do not use its workflow skills (`/dw:impl`, `/dw:ship`, `/dw:epic-impl` and similar) for this repository's issues: issue work starts only with `issue-start` and merges only through the auto-merge workflow.
- Commit, PR and issue text is written in English with a `feat:`/`fix:`/`update:`/`refactor:`/`test:`/`docs:`/`chore:` subject. PR titles carry no `(#N)` suffix: GitHub appends the PR number to the squash commit, and the issue link is `Closes #N` in the body. Paragraphs are not hard-wrapped, and bodies are passed with `--body-file`. Do not add AI attribution or `Co-Authored-By` trailers.
- The pre-commit hook (ADR 0002) runs Prettier and ESLint on staged files, and must pass. Never commit with `--no-verify`. If the hook fails, fix the code and commit again.
- **Security (ADR 0011):**
  - Follow `.claude/rules/security.md`.
  - Packages install only versions at least 7 days old (`minimumReleaseAge`), and dependency build scripts are blocked unless listed in `allowBuilds`.
  - Run the `security-check` skill before PRs touching dependencies, the server, the protocol, Docker, CI or user-data rendering.
- **Linear history (ADR 0012):** a PR branch is one commit rebased onto the current `origin/main`, with the PR title as subject; squash merges only. Work-in-progress commits are fine locally; squash before pushing and after every fix, then `git push --force-with-lease` (never plain `--force`, never on `main`). Never create merge commits: each clone sets `pull.rebase true` and `merge.ff only` (`issue-start`). CI rejects a branch with more than one commit or behind `main`.
- Stage files by path. Never use `git add -A`, `git add .`, `git stash` or `git clean` on the user's working tree.
- Always pass `--json <fields>` to `gh issue view` and `gh pr view`. Change labels with `gh issue edit`, which also works on PRs.
- GitHub repo: `OSSCA-thorvg/GameJam-Vampire-Survivors` (private). Each contributor runs `gh` with their own account that has access to the repo (`gh auth status`). If `gh` reports the repo is not found (404 or "Could not resolve"), the active account lacks access: stop and ask the user. Do not switch accounts or borrow credentials. If `gh pr edit` or `gh issue edit` fails with a missing-scope error (such as `read:org`), make the same change with `gh api` REST calls (`gh api -X PATCH repos/OSSCA-thorvg/GameJam-Vampire-Survivors/pulls/<PR> -f title=...`, or `.../issues/<N>/labels`); `.claude/rules/pull-requests.md` § Using `gh` lists them.
- Issues use the template in `issue-create` (mirrored in `.github/ISSUE_TEMPLATE/task.md`); PRs use `.github/pull_request_template.md`.
- **Merging (ADR 0012):** branch protection and native auto-merge are unavailable on this plan, so `.github/workflows/auto-merge.yml` is the merge gate. It squash-merges a PR only when CI succeeds on its latest commit, comments on the PR when CI fails, then labels the issue `status:done`, unblocks dependents and runs CI on `main`. Never run `gh pr merge` or use the web UI merge button. Label a PR `status:blocked` to hold it (`.claude/rules/pull-requests.md`).

## Skills

The project skills in `.claude/skills/`:

| Skill               | Use it to                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue-create`      | file an issue with a detailed implementation plan and labels                                                                                                                                                                         |
| `issue-start`       | begin an issue: `status:in-progress`, assignee, branch, read the ADRs, check the scope with `impact-check`                                                                                                                           |
| `impact-check`      | find what a change could break beyond its files: scope mode before coding, proof mode (safety fact proven by running code) before the PR                                                                                             |
| `commit`            | commit on an issue branch with the project's message rules                                                                                                                                                                           |
| `issue-finish`      | verify by running the real app, prove the impact, run the docs sync and security checks, bring a stale branch up to date, open the PR, wait for the auto-merge workflow to merge it on green CI, verify `status:done` and unblocking |
| `resolve-conflicts` | rebase a stale or conflicting branch onto `main`, resolve per `conflicts.md`, squash back to one commit and force-push with lease                                                                                                    |
| `adr-new`           | record or supersede a decision                                                                                                                                                                                                       |
| `label-sync`        | sync GitHub labels from `.github/labels.json`                                                                                                                                                                                        |
| `dev-server`        | run, rebuild and troubleshoot the server in Docker                                                                                                                                                                                   |
| `security-check`    | do the supply-chain and security pass before a PR                                                                                                                                                                                    |
| `verify-game`       | launch the game on :5180, drive the feature map in `features/` with Claude in Chrome or Playwright, keep evidence in `verification/issue-<N>/`, clean up                                                                             |

## Commands

Created by #1 (roadmap F1), #4 (the server in Docker), #46, #47 and #31 (`verify:*`). Every command below is real. A later issue adds `pnpm assets:sync` (#3); do not use it before it merges, and do not invent others. `npm install` and `yarn` are rejected by the `preinstall` check, and Node or pnpm versions outside `engines` fail the install (`engineStrict` in `pnpm-workspace.yaml`).

```sh
nvm use                 # Node version from .nvmrc (24)
corepack enable         # provides the pnpm version pinned in package.json
pnpm install            # npm and yarn are blocked; use pnpm only
pnpm dev                # client only (Vite on :5173); the server runs in Docker
pnpm --filter client dev
cp .env.example .env    # once; compose.yaml reads .env (never committed)
pnpm server:up          # dev server in Docker on :8787, hot-reloading src (ADR 0010, dev-server skill)
pnpm server:logs / server:sh / server:down   # follow logs, shell inside the container, stop and remove it
pnpm server:image       # build the runtime image vs-server:local (non-root, production dependencies only)
pnpm --filter server test                   # server unit tests on the host (allowed by .claude/rules/docker.md)
pnpm --filter server exec node scripts/ws-hello.mjs http://localhost:5173   # WebSocket check against :8787/ws
pnpm --filter client build && pnpm --filter client exec vite preview   # production build on :4173 under the ADR 0011 CSP
pnpm check              # format:check → lint → typecheck → test → build → test:build; must pass before merge
pnpm lint / pnpm lint:fix
pnpm format / pnpm format:check
pnpm typecheck
pnpm test                                   # all packages (Vitest)
pnpm --filter shared test -- src/content    # one package, one path
pnpm --filter client exec vitest run -t "spawns enemies"   # single test by name
pnpm --filter client exec vitest run src/worker/loop.test.ts   # one client test file
pnpm build                                  # also runs scripts/verify/check-prod-bundle.mjs (no dev-only code in dist)
pnpm exec playwright install chromium       # once per clone: the browser for verify-game (never an install script)
pnpm verify:launch      # client in --mode e2e on :5180, ready when __vsTest reports gl (--with-server adds Docker :8787)
pnpm verify:doctor      # read-only checks of the launched run (pid, URL, __vsTest, buildRev == HEAD)
pnpm verify:e2e         # launch, Playwright e2e/ (headless; VERIFY_HEADED=1 for the real GPU), cleanup, always
pnpm verify:cleanup     # stop only what verify:launch recorded, keep verification/ evidence
VERIFY_JOURNEYS=verification/issue-<N>/journeys pnpm exec playwright test -c e2e/playwright.config.ts   # feature-map journeys
sh scripts/make-hud-font.sh   # rebuild assets/fonts/hud.ttf (ADR 0013); needs fonttools 4.68.0 (pipx install fonttools==4.68.0), not a project dependency
pnpm test:build         # check the client dist after building: only the worker's canonical WASM ships
pnpm --filter client test:build   # run only src/build.test.ts; requires a current client build
```

## Architecture

Read the ADR for the full reasoning.

- **Monorepo (ADR 0002):**
  - `packages/client` (`@vs/client`) is the Vite app with no UI framework (ADR 0009); its only runtime dependency is `@thorvg/webcanvas` (ADR 0011). `src/main` and `src/worker` are type-checked against DOM and WebWorker libs by separate tsconfigs (`tsconfig.main.json`, `tsconfig.worker.json`);
  - `packages/server` (`@vs/server`) is the Node + `ws` relay, run in Docker (ADR 0010: `packages/server/Dockerfile`, `compose.yaml`); `GET /healthz` answers `ok`, WebSocket upgrades on `/ws` are accepted only from `ALLOWED_ORIGINS`, and `src/config.ts` reads `PORT` (8787), `LOG_LEVEL` and `ALLOWED_ORIGINS` (`.env.example`); `src/log.ts` writes JSON lines, never message bodies;
  - `packages/shared` (`@vs/shared`) holds protocol types and content data, with no DOM, worker or Node APIs; TypeScript, Vitest, the server's dev container (`development` condition) and the client (a Vite alias) read `src/index.ts`, while the runtime image runs the compiled `dist` (`default` condition);
  - the root `tsconfig.json` references every package, so `tsc -b` checks them all; `eslint.config.js`, `.prettierrc.json` and `vitest.config.ts` (projects `packages/*`) live at the root;
  - `assets/` holds the art and `manifest.json`.
  - The browser favicon is `assets/ui/favicon.svg` (`ui.favicon`, cataloged as a placeholder), linked from `client/index.html` and served through Vite's `publicDir` in dev and production.
- **Threads (ADR 0004):** the main thread (`client/src/main/`) owns the DOM UI, keyboard capture and the WebSocket. A dedicated module worker (`client/src/worker/`) owns the simulation and all ThorVG rendering, including the HUD, on an `OffscreenCanvas` transferred at startup. The two talk only through the typed messages in `client/src/protocol/worker-messages.ts`. Nothing in the worker may touch the DOM; nothing on the main thread may touch the canvas.
- **Rendering (ADR 0003):**
  - Initialize ThorVG once with `renderer: 'gl'`.
  - Paints are created once and pooled, cloned with `duplicate()` from a loaded master. Per frame, only transforms, visibility and opacity change, followed by one `canvas.update()` and one `canvas.render()`.
  - Never create or dispose Paints per frame.
  - Do not use the `/thread` build.
  - `worker/render/thorvg.ts` `initThorVG` returns `{ TVG, canvas, root }`; later layers go under the scaled `root` scene. `thorvg.wasm` is served from `/thorvg/thorvg.wasm` by the `copyThorvgWasm` plugin in `vite.config.ts`.
  - Every ThorVG `Text` uses `text.font(HUD_FONT)`, read after `initThorVG` resolves (ADR 0013). `initThorVG` fetches `fonts/hud.ttf` (`assets/fonts/hud.ttf`, asset ID `font.hud`: Noto Sans Mono Regular subset to printable ASCII `U+0020`–`U+007E`, OFL, under 15 KB) and registers it as `'hud'`; if that fails it logs one warning and `HUD_FONT` stays `'default'`, the built-in font, which lacks `:`, `/`, `%` and most punctuation. ThorVG text stays printable ASCII (numbers, English labels); Korean text and every nickname are DOM text set with `textContent` (ADR 0009). Rebuild the subset only with `scripts/make-hud-font.sh`.
  - Production builds remove only the unused `assets/thorvg-*.wasm` copy through `removeDuplicateThorvgWasm`. `src/build.test.ts` checks the real output with `vitest.build.config.ts` after `pnpm build`; ordinary unit tests exclude it through `vitest.config.ts`.
- **Simulation (ADR 0004):**
  - Fixed 60 Hz step with an accumulator, at most 5 steps per frame.
  - In a hidden tab, a `setTimeout` loop keeps simulating without rendering (cap of 120 steps per tick). In single player, hiding the tab pauses the game instead.
  - The view is a fixed 1280×720 logical area, letterboxed.
  - Typed-array struct-of-arrays plus a uniform-grid spatial hash.
  - No per-entity allocation in the frame loop.
  - All randomness comes from the seeded PRNG: `createRng(seed)` in `shared/src/random.ts` (mulberry32; `next`, `range`, `int`, `pick`), with `rng.fork(label)` giving each system its own stream. Never `Math.random()`.
  - `worker/loop.ts` `createLoop` implements the step, the hidden-tab policy (`setBackgroundPolicy('pause' | 'simulate')`, default `'pause'`) and `fastForward`; constants are in `worker/constants.ts`. It never runs more than `MAX_STEPS` per visible frame and never renders while hidden (`loop.test.ts`).
- **Thread messages (ADR 0004):** `client/src/protocol/worker-messages.ts` holds `MainToWorker`, `WorkerToMain` and `DebugCommand`. Every `switch` on a message `type` or `kind` is exhaustive and ends in `assertNever` (`protocol/assert-never.ts`). Browsers missing `transferControlToOffscreen`, WebGL 2 on `OffscreenCanvas` or module workers get a DOM message instead of the game (`main/support.ts`; `?forceUnsupported=<name>` in dev).
- **Dev-only debug tools:** `main/debug.ts` (`installDebugTools`, `registerDebugKey(code, command)`, `globalThis.__vsDebug.post(message)` and `__vsDebug.stats`) and `worker/debug.ts` (`registerDebugHandler(kind, fn)`, `dispatchDebug`, `registerPerfStat(label, read)`, the perf overlay). Every call into them is wrapped in `if (import.meta.env.DEV) { … }` and they have no top-level side effects, so production builds drop them (`pnpm build` fails through `scripts/verify/check-prod-bundle.mjs` if `togglePerfOverlay` or `__vsDebug` reaches the bundle). Add a debug command by adding its `DebugCommand` kind, calling `registerDebugKey` and `registerDebugHandler`, and adding a row here; never edit a switch. A new key must not reuse a code below or a gameplay key (arrows, `KeyW`/`KeyA`/`KeyS`/`KeyD`, `Enter`, `Escape`, `Tab`, `Digit1`–`Digit3`). Debug keys only reach preconditions in verification (`.claude/rules/verification.md`).

  | Key (`code`)   | `DebugCommand` kind  | Owner                  | Purpose                                 |
  | -------------- | -------------------- | ---------------------- | --------------------------------------- |
  | `Backquote`    | `togglePerfOverlay`  | #2 (#6, #22 add lines) | perf overlay                            |
  | `BracketRight` | `fastForward`        | #2                     | 60 s of steps                           |
  | `KeyV`         | `galleryPreview`     | #5                     | gallery speed preview (`?gallery` only) |
  | `KeyG`         | `grantWeapon`        | #10                    | next weapon                             |
  | `KeyL`         | `levelUp`            | #11                    | XP to the next level                    |
  | `KeyP`         | `grantPassive`       | #12                    | next passive                            |
  | `KeyE`         | `forceEvolution`     | #15                    | evolution preconditions                 |
  | `KeyB`         | `spawnBoss`          | #15                    | spawn `reaper5`                         |
  | `KeyK`         | `spawnPickup`        | #16                    | next pickup                             |
  | `KeyI`         | `toggleInvulnerable` | #17                    | toggle invulnerability                  |
  | `KeyJ`         | `spawnInterference`  | #21                    | next interference pickup (versus only)  |

- **Test bridge (#31, dev and e2e builds):** `main/test-bridge.ts` exposes `window.__vsTest` (`snapshot()`, `waitFor(predicate, ms)`), which asks the worker over the `testSnapshot` messages (`TestSnapshotRequest`/`TestSnapshotReply`, filtered out before both exhaustive switches) and returns a flat `GameSnapshot` (`WorkerSnapshot` plus `ready`, `buildRev`, `state`). It only reads. Later issues add fields by name with `registerSnapshotField(name, read)` (`worker/test-bridge.ts`) or `registerMainSnapshotField` (main thread), never by editing the bridges. Calls are wrapped in `if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')`; `verify:launch` serves `--mode e2e`. `__VS_BUILD_REV__` (`vite.config.ts`, `protocol/env.d.ts`) is the git revision at server start. Playwright lives in `e2e/` (root tsconfig reference, so `tsc -b` and ESLint cover it), the scripts in `scripts/verify/`.
- **Multiplayer (ADRs 0005, 0006):**
  - Each player simulates their own world, and worlds are never synchronized.
  - The server handles rooms (6-character codes, nicknames), match start (seed), status relay (at most 4 Hz), interference routing and the result. WebSocket upgrades happen only on `/ws`.
  - The last survivor wins:
    - when several players die within 100 ms (server time), it is a draw;
    - a tab hidden for 30 seconds forfeits;
    - at the time limit the match ends and kills decide it, with no Death.
  - Protocol types live in `shared/src/protocol.ts`, and the server validates every message.
- **Content (ADR 0008):** characters, weapons, passives, evolutions, enemies, waves and pickups are data in `shared/src/content/`. Systems interpret the data; each weapon's behaviour is chosen by its `pattern` field. The scope is fixed in ADR 0008: 8 weapons with evolutions, 8 passives, 3 characters, 1 stage, and no gold, unlocks, relics, shops or arcanas.
- **Assets (ADR 0007):**
  - Code refers to logical IDs such as `enemy.bat`, resolved through `assets/manifest.json`. Never use file paths.
  - Vector first. Entities shown in large numbers have at most 4 paths, no strokes and no gradients, within the entity caps in the ADR.
  - Missing assets render as a magenta placeholder.
  - Only original or licensed art; nothing copied from the original game.
  - `assets/CATALOG.md` lists every asset ID and its status. Add a row there before using a new ID.

## Gameplay fidelity

Before implementing or tuning gameplay, read the matching section of `docs/reference/gameplay.md` and compare with footage of the original game, linked there. When text and footage disagree, footage wins. Record new observations, with their source, in that file in the same PR. Facts marked **[unverified]** must be checked before you rely on them.
