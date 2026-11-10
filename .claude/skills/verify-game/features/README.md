# verify-game feature map

One file per user-facing feature. A PR that adds or changes user-facing behaviour, its entry points or its preconditions updates the feature's file in the same PR (`.claude/rules/docs-sync.md`); a behaviour without an entry here is not verified. The procedure (launch, doctor, drivers, evidence, cleanup) is in `../SKILL.md`.

| File                           | Feature                                                                                                                 | Since |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----- |
| `boot.md`                      | page load, worker start, ThorVG `gl`, the title screen, unsupported browsers                                            | #2    |
| `hidden-tab.md`                | the hidden-tab background policies `'pause'` and `'simulate'`                                                           | #2    |
| `debug-tools.md`               | the dev-only perf overlay and fast-forward, and their absence in builds                                                 | #2    |
| `room-server.md`               | the WebSocket room server: rooms, ready, match start, result, limits                                                    | #18   |
| `gallery.md`                   | drawable catalog gallery, anchors, loading, replacements and font fallback                                              | #3    |
| `movement.md`                  | 8-direction movement, facing, stopping, the centred camera and the ground                                               | #7    |
| `enemies.md`                   | wave spawning off-screen, chase, separation, relocation and the enemy cap                                               | #8    |
| `run-flow.md`                  | title, pause on Escape or hidden tab, results, retry, keyboard-only screens                                             | #9    |
| `player-health.md`             | contact damage, invulnerability and blink, death, the ThorVG HUD                                                        | #9    |
| `weapons.md`                   | the Whip, the Magic Wand (`G`), hits, flash, knockback, kills, the cap                                                  | #10   |
| `xp-gems.md`                   | gem drops and tiers, the magnet, collection, the XP bar, the merge gem                                                  | #11   |
| `level-up.md`                  | the level-up dialog, frozen run, choices, the heal card, the `L` key                                                    | #11   |
| `passives.md`                  | passive cards, the stat block, Candelabrador, Spinach, Pummarola, slots, `P`                                            | #12   |
| `character-select.md`          | the four characters, keyboard and mouse choice, starting weapons and stats, Retry keeps the character                   | #14   |
| `chests-and-evolutions.md`     | treasure chests, the reward overlay, the 8 evolutions, the `E` key                                                      | #15   |
| `bosses-and-elites.md`         | bosses (`B`), the boss tether, elites with their marker and chest                                                       | #15   |
| `light-sources-and-pickups.md` | braziers around the player, breaking them, the five pickups, `K`, level gates                                           | #16   |
| `lobby.md`                     | Multiplayer: nickname, create or join by code, errors, ready, host Start, countdown, connection loss                    | #19   |
| `stage-and-finale.md`          | the wave table, timed events, the 15:00 clear, Death, the results with weapon damage, `I`                               | #17   |
| `versus-match.md`              | versus play: same seed, opponent panel, status rate, death, disconnect, AFK, 15:00, Rematch                             | #20   |
| `interference.md`              | versus interference pickups: drop rules, Swarm, Gem Thief, Elite Call, banners, the server cap, `J`                     | #21   |
| `deployed-site.md`             | the GitHub Pages build: base path, CSP meta, single player, the multiplayer entry with or without a server, `smoke.mjs` | #23   |
| `motion.md`                    | native actor/effect motion, markers, active playback and measured resource budgets                                      | #84   |
| `audio.md`                     | sound effects and music: autoplay unlock, music per screen, cues, ducking, voice caps, mute and volume, hidden tab      | #129  |
| `records.md`                   | personal records: New best! badges, best time and Cleared on the cards, the Records screen, reset, `vs.records`         | #143  |
| `inventory-hud.md`             | owned weapons and passive levels, reward changes, reset, and the first scheduled chest carrier                          | #156  |
| `touch-controls.md`            | phones and tablets: input mode, floating joystick, Pause button, tappable screens, no scroll/zoom, rotate hint          | #149  |

## Baseline preconditions

- `pnpm verify:launch` succeeded and `pnpm verify:doctor` prints only `ok` lines (the served revision is `HEAD`).
- The page is the recorded `client.url` (`http://localhost:5180/`, or your `VERIFY_PORT`; see the skill's Launch), loaded fresh for each journey; `__vsTest.snapshot()` reports `ready: true` and `renderer: 'gl'` before anything is driven.
- No server unless the feature says so (then `pnpm verify:launch --with-server`; the first server journey is `room-server.md`, #18).

## Driving conventions

- Two drivers, same journeys: **Claude in Chrome** (interactive sessions, real Chrome and GPU) and **Playwright** (headless smoke with SwiftShader, a headed native hidden-tab fixture, CI under Xvfb, and the fallback when the extension is not connected). The hidden fixture owns a newly launched browser process/profile and uses `noDefaults` on its existing context; it never attaches to a user browser. Select it with `--project hidden-tab`, and select ordinary smoke with `--project chromium`. `../SKILL.md` § Drive has the rules for both.
- Input is real keyboard input: `computer` `key` (extension), `page.keyboard` or `holdKeys` (Playwright). Screens from #9 on are found by ARIA role and name.
- State comes only from `window.__vsTest.snapshot()` / `waitFor` (dev and e2e builds). The bridge only reads; nothing sets gameplay state.
- Debug keys (`CLAUDE.md` table) and `__vsDebug.post` only reach preconditions; say which ones a journey used.
- Wait on snapshot predicates (`waitForSnapshot`, `__vsTest.waitFor`), not fixed sleeps, except where a feature measures time.
- Since #11 a run pauses on every level-up (`state: 'levelUp'`) until a card is chosen. A journey that plays a run for more than a few seconds and is not about level-ups calls `answerLevelUps(page)` (`e2e/helpers.ts`) right after starting the run, which presses `1` on each dialog; with Claude in Chrome, press `1` whenever the dialog shows.

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

- Since #11 the first level-up comes after about 7–8 s standing still at minute 0. Journeys written before #11 that wait for time or death stalled on the dialog (enemies 1, player-health 3, run-flow 2, weapons 1 and 4); they now call `answerLevelUps`. The movement seam check counted the XP bar along the top edge as a seam and now skips that band (2026-11-08, #11).
- Since #148 (lower contact damage, 0.6 s invulnerability and the built-in PowerUp equivalent in `BASE_STATS`: Warden 140 HP, 2 armor, 0.2 HP/s recovery) a Warden standing still dies in about 1–2 minutes, sometimes over 3 (balance probe, seeds 1–30: 39–206 s of game time) instead of about 15 s. Journeys that reach the results by standing still wait longer; player-health 3, run-flow 2 and stage 3 now wait up to 300 s per death. Journeys with shorter waits (records, character-select) may need the same if they time out (2026-11-10, #148).
- Since #148 level-ups come more often and can land between any two steps of a journey: before a keyboard-driven step that expects `'playing'` (Escape, a debug key, a menu), call `settlePlaying(page, { avoidNewWeapons })` from `e2e/helpers.ts`, which answers level-ups and chests until `'playing'` holds for two polls, instead of a longer wait; `e2e/audio.spec.ts` (`pressSettled`) also retries such a step once when a dialog interrupted it (2026-11-10, #148).
- `verify:launch --with-server` was proven in #31 both ways (2026-11-08): reusing a server already answering `/healthz` (left running by cleanup) and starting the `vs-verify` compose project (`docker compose -p vs-verify down` by cleanup). It needs `.env` (`cp .env.example .env`); keep it until cleanup has run, since `compose down` reads it too. `down` keeps the `vs-verify-server` image and the `vs-verify_server_node_modules` volume as a cache.
- A server started with `pnpm server:up` uses the same host port 8787, so `--with-server` reuses it instead of starting `vs-verify`, and cleanup never stops it.
- Since #161 launches on different `VERIFY_PORT`s share one `vs-verify` server: only the launch that started it owns it, cleanup stops it only when the owner leaves last, and an earlier owner's cleanup hands ownership to the lowest remaining port (`SKILL.md` § Launch and § Cleanup). A port that never runs its cleanup keeps the server up.
