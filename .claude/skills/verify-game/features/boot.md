# Boot

Loading the page starts the game worker, which initializes ThorVG with the `gl` renderer on the transferred `OffscreenCanvas`, plays the 7-second "Powered by ThorVG" splash (#126) while it loads the manifest assets; the title screen then appears, and Enter starts the run (the player on the tiled ground, #7, #9); browsers without the required features get a DOM message instead (#2).

## Sub-features

- **Worker ready with `gl`:** `__vsTest.snapshot()` reaches `ready: true`, `renderer: 'gl'`, then `state: 'title'` with `player: null` (no run yet); exactly one `canvas` in `#app`; the page log has `[vs] worker ready, renderer: gl` and no errors.
- **Splash (#126, ADR 0020):** the worker loads `ui.splash` first and plays it centred in the 1280×720 view on black, frames 0–209 at 30 fps, while the other assets load (`splash.state: 'playing'` while `assets.loaded < assets.total`). `#loading` is hidden (`loading.visible: false`) and `state` stays `'booting'`; Enter, Escape, Space and clicks change nothing. After 7 simulated seconds `splash.state` is `'holding'` at `frame: 209`; `ready` follows only once the assets are ready too, then `splash.state: 'done'` and the title. When loading is slower, frame 209 stays with `#loading` (`Loading n/86`, class `splash-hold`, `loading.held: true`) centred under the ThorVG wordmark with its top edge at logical y 610 (`canvasTop + canvasHeight × 610 / 720`). The e2e build skips it unless `?splash=full` (`splash.state: 'skipped'`, `#loading` at the old top-left spot, `loading.held: false`); the dev build plays it unless `?splash=skip`; production always plays it. `?gallery` and `?stress` never play it. A missing or invalid `ui/splash.json` logs `[splash] ui.splash unavailable; skipping` once in the worker, lists `ui.splash` in `assets.placeholders` and still reaches the title.
- **Asset loading:** `#loading` shows `Loading n/total` until `assetsReady`, then disappears; `assets` snapshot reaches `{ ready: true, loaded: 5, total: 5, font: "hud" }`, with 77 drawable placeholders. Loading is covered by the complete gallery journey in `gallery.md`. The worker neither fetches nor counts the 19 audio entries (`sfx.*`, `music.*`, #128, ADR 0021): the progress total stays 86 (`Loading n/86`) and no `audio/` request is made during boot.
- **Title screen (#9):** the "Start" button is focused; Enter starts a run (`state: 'playing'`) and removes the screen. The title, pause and results screens are in `run-flow.md`.
- **The run steps:** `steps` keeps rising (60 per second; it also counts on the title screen) and `timeS` (the run's simulated seconds, registered by #7, 0 outside a run) rises with it. #2's test scene and #31's `testScene` field are gone (#7).
- **Keyboard moves the player:** holding `ArrowRight` raises `player.x` (133 units per second for the default Warden: `BASE_MOVE_SPEED` 140 × 0.95, #14) and leaves `player.y` unchanged. Distances, diagonals, facing, the camera and the ground are in `movement.md`.
- **Runtime worker error (#123):** an uncaught error thrown in the worker after `ready` keeps the current screen mounted (`state` unchanged), logs `[vs] game worker runtime error: <message> at <file>:<line>:<col>` and shows `#runtime-error` (role `alert`, top centre, outside the canvas) with "Something went wrong in the game. Reload to start again.", the message in `.runtime-error-detail`, and Reload and Dismiss buttons; repeats keep one notice with `(<n> errors)`, Dismiss removes it, and `runtimeErrors` counts the reports. An error before `ready` still replaces the page with "The game could not start.".
- **Silent splash (#129):** the splash plays no sound and no music; a key pressed during it already unlocks audio (`audio.unlocked: true`) but `audio.music` stays `null` and `audio.played` empty until the title starts `music.title` (`audio.md`).
- **Unsupported browser:** `/?forceUnsupported=<name>` (dev and e2e builds only) shows "This game needs a recent Chrome, Edge, Firefox or Safari 17+" with `<name>` in the list, and no canvas.

## How to get to it (user POV)

Open the game URL, wait for the title screen and press Enter ("Start" is focused). No precondition beyond the baseline.

## Driving it

### Claude in Chrome

Splash (#126): `navigate` to `http://localhost:5180/?splash=full`; `computer` `screenshot` at once and about every 2 s (the animation); `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).splash)` → `state: "playing"`, rising `frame`; `computer` `key` `Enter` → still `state: "booting"`; `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'title', 30000))` → `splash: { state: "done", frame: 209, … }`.

1. `tabs_context_mcp` `{ createIfEmpty: true }`, then use the group's new empty tab (or `tabs_create_mcp`); `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `computer` `screenshot` (`save_to_disk: true`).
3. `javascript_tool`: `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'title', 30000))` → `ready: true`, `renderer: "gl"`, `state: "title"`, `player: null`; `find` "Start button" → focused; `computer` `key` `Enter` twice (Start, then the default Warden on the character select, #14); `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'playing', 5000))` → `player: { x: 0, y: 0, facingX: 1, hp: 120, maxHp: 120, invulnerable: false }`.
4. `computer` `key` `ArrowRight` with `repeat: 40`, then `javascript_tool` `JSON.stringify(await window.__vsTest.snapshot())` → `player.x` above its earlier value, `player.y` unchanged, `steps` and `timeS` higher; `screenshot`.
5. `read_console_messages` with pattern `\[vs\]|\[debug\]|error|Error` → `[vs] worker ready, renderer: gl`, no errors.
6. `navigate` to `http://localhost:5180/?forceUnsupported=webgl2-offscreen`; `read_page` → the message text and a list item `webgl2-offscreen`, no canvas; `screenshot`.
7. `screenshot`, `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-boot.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

The spec is `e2e/smoke.spec.ts` (the CI gate), including the runtime worker error journey (#123): after `startRun(page)` it runs `page.workers()[0].evaluate(() => { setTimeout(() => { throw new Error('runtime probe'); }, 0); })`, expects `#runtime-error` with `runtime probe`, `state: 'playing'`, `runtimeErrors: 1`, `timeS` still rising 2 s later (the error was outside the loop), then clicks Dismiss and expects the notice gone. Run it with `pnpm verify:e2e` (launches and cleans up itself), or against a launched client with `VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts smoke`. It saves `boot/` (`01-ready.png`, `02-title.png`, `03-stepping.png`, `04-after-arrow-right.png`, `snapshot-*.json`, `page-console.log`, `worker-console.log`), `boot-unsupported/` and `boot-runtime-error/` (`01-playing-before-error.png`, `02-notice-shown.png`, `03-dismissed.png`, the snapshots and logs).

The splash journeys are `e2e/splash.spec.ts` (chromium project): full play on `/?splash=full` (screenshots at 0, 2.3, 3.7 and 5 s and at the end, input ignored, the title after at least 6.8 s of wall time), the hold (delays `enemies/bat.json` by 10 s: frame 209, `Loading n/86` centred under the logo, then the title) and the e2e default skip (top-left loading text). It saves `splash-full/`, `splash-hold/` and `splash-skipped/`.

The audio decode journey is `e2e/audio-decode.spec.ts` (#128, ADR 0021; the chromium project, so CI runs it): it fetches the manifest from the page, decodes every `mp3` entry with `new OfflineAudioContext(1, 1, 44100).decodeAudioData` and expects `length === samples` at 44100 Hz. `VERIFY_AUDIO_ENGINES=1` adds the headless `audio-firefox` and `audio-webkit` projects, which run only this spec (`pnpm exec playwright install firefox webkit` first). It saves `audio-decode-<project>/decoded.json`.

## Gotchas

- The runtime-error journey answers level-ups (`answerLevelUps`) and waits for `state === 'playing'` instead of asserting it at one instant: its run lasts long enough to reach the first level-up, which made it fail in CI on PR #137 (#138).
- Each extension `key` press is an instant down and up, so the player moves only a few units for 40 presses (one or two steps of input each); assert "increased", not a distance. Timed holds need Playwright's `holdKeys` (2026-11-08, #31).
- The extension's `read_console_messages` does not return worker console lines (`[worker] …`); Playwright's `worker-console.log` does (#31).
- `gif_creator` only records frames on screenshots and navigations, not key presses: take a screenshot after every action (#31).
- `fps` follows the display: about 120 in real Chrome on a 120 Hz screen, about 55–60 in headless SwiftShader (#31). Steps stay at 60 per second either way.
- Headed Chromium requests a favicon; #48 serves `/ui/favicon.svg`, so any `Failed to load resource` in `pageErrors()` is a real failure (the URL is in the log line).
- The runtime worker error journey has no Claude in Chrome variant: only Playwright can evaluate code inside the worker (`page.workers()`). An error thrown from `worker.evaluate` has an empty filename, so its log line ends in `at :<line>:<col>`; Playwright also lists it as a `[pageerror]` (#123).
- The e2e build skips the splash by default so other journeys start at once; pass `?splash=full` to see it. The e2e server is a Vite dev server (`import.meta.env.DEV` is true), so the main thread decides by `MODE === 'e2e'` first (#126).
- A hidden tab pauses the splash with the loop (the default `'pause'` policy) while loading continues; it finishes its remaining time once the tab is visible (#126, user decision 7). While the other assets decode on the worker, frames are long and the loop's 5-step cap slows the splash clock, so 7 simulated seconds can take 8–9 s of wall time; assert `elapsedS`, not wall time (#126).
- The hold journey delays `enemies/bat.json`, not a PNG: since #117 the enemies are Lottie JSON files (#126).
- Playwright's WebKit build (macOS, 2026-11-09) decodes 5 of the 19 MP3s (`sfx.hitGarlic`, `sfx.gemPickup`, `sfx.levelUp`, `sfx.playerDeath`, `sfx.interferenceSend`) 1037–1152 samples longer than `samples`: the start is aligned and the extra tail is silence (at most 0.00055), and both music loops decode exactly. So `audio-webkit` fails on those five; playback (#129) takes its lengths and loop points from the manifest's `samples`, never from `AudioBuffer.length` (#128).
