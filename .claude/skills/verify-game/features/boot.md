# Boot

Loading the page starts the game worker, which initializes ThorVG with the `gl` renderer on the transferred `OffscreenCanvas` and loads the manifest assets; the title screen then appears, and Enter starts the run (the player on the tiled ground, #7, #9); browsers without the required features get a DOM message instead (#2).

## Sub-features

- **Worker ready with `gl`:** `__vsTest.snapshot()` reaches `ready: true`, `renderer: 'gl'`, then `state: 'title'` with `player: null` (no run yet); exactly one `canvas` in `#app`; the page log has `[vs] worker ready, renderer: gl` and no errors.
- **Asset loading:** `#loading` shows `Loading n/total` until `assetsReady`, then disappears; `assets` snapshot reaches `{ ready: true, loaded: 5, total: 5, font: "hud" }`, with 77 drawable placeholders. Loading is covered by the complete gallery journey in `gallery.md`.
- **Title screen (#9):** the "Start" button is focused; Enter starts a run (`state: 'playing'`) and removes the screen. The title, pause and results screens are in `run-flow.md`.
- **The run steps:** `steps` keeps rising (60 per second; it also counts on the title screen) and `timeS` (the run's simulated seconds, registered by #7, 0 outside a run) rises with it. #2's test scene and #31's `testScene` field are gone (#7).
- **Keyboard moves the player:** holding `ArrowRight` raises `player.x` (140 units per second) and leaves `player.y` unchanged. Distances, diagonals, facing, the camera and the ground are in `movement.md`.
- **Unsupported browser:** `/?forceUnsupported=<name>` (dev and e2e builds only) shows "This game needs a recent Chrome, Edge, Firefox or Safari 17+" with `<name>` in the list, and no canvas.

## How to get to it (user POV)

Open the game URL, wait for the title screen and press Enter ("Start" is focused). No precondition beyond the baseline.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, then use the group's new empty tab (or `tabs_create_mcp`); `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `computer` `screenshot` (`save_to_disk: true`).
3. `javascript_tool`: `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'title', 30000))` → `ready: true`, `renderer: "gl"`, `state: "title"`, `player: null`; `find` "Start button" → focused; `computer` `key` `Enter`; `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'playing', 5000))` → `player: { x: 0, y: 0, facingX: 1, hp: 100, maxHp: 100, invulnerable: false }`.
4. `computer` `key` `ArrowRight` with `repeat: 40`, then `javascript_tool` `JSON.stringify(await window.__vsTest.snapshot())` → `player.x` above its earlier value, `player.y` unchanged, `steps` and `timeS` higher; `screenshot`.
5. `read_console_messages` with pattern `\[vs\]|\[debug\]|error|Error` → `[vs] worker ready, renderer: gl`, no errors.
6. `navigate` to `http://localhost:5180/?forceUnsupported=webgl2-offscreen`; `read_page` → the message text and a list item `webgl2-offscreen`, no canvas; `screenshot`.
7. `screenshot`, `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-boot.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

The spec is `e2e/smoke.spec.ts` (the CI gate). Run it with `pnpm verify:e2e` (launches and cleans up itself), or against a launched client with `VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts smoke`. It saves `boot/` (`01-ready.png`, `02-title.png`, `03-stepping.png`, `04-after-arrow-right.png`, `snapshot-*.json`, `page-console.log`, `worker-console.log`) and `boot-unsupported/`.

## Gotchas

- Each extension `key` press is an instant down and up, so the player moves only a few units for 40 presses (one or two steps of input each); assert "increased", not a distance. Timed holds need Playwright's `holdKeys` (2026-11-08, #31).
- The extension's `read_console_messages` does not return worker console lines (`[worker] …`); Playwright's `worker-console.log` does (#31).
- `gif_creator` only records frames on screenshots and navigations, not key presses: take a screenshot after every action (#31).
- `fps` follows the display: about 120 in real Chrome on a 120 Hz screen, about 55–60 in headless SwiftShader (#31). Steps stay at 60 per second either way.
- Headed Chromium requests a favicon; #48 serves `/ui/favicon.svg`, so any `Failed to load resource` in `pageErrors()` is a real failure (the URL is in the log line).
