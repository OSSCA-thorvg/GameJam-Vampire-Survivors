# Boot

Loading the page starts the game worker, which initializes ThorVG with the `gl` renderer on the transferred `OffscreenCanvas` and animates the test scene; browsers without the required features get a DOM message instead (#2).

## Sub-features

- **Worker ready with `gl`:** `__vsTest.snapshot()` reaches `ready: true`, `renderer: 'gl'`, `state: 'running'`; exactly one `canvas` in `#app`; the page log has `[vs] worker ready, renderer: gl` and no errors.
- **Test scene animates:** `steps` keeps rising (60 per second) and `testScene.angleDeg` changes (90 degrees per second). Registered field: `testScene` (`{ angleDeg, dotX, dotY }`, removed by #7).
- **Keyboard moves the dot:** holding `ArrowRight` raises `testScene.dotX` (200 units per second) and leaves `dotY` unchanged.
- **Unsupported browser:** `/?forceUnsupported=<name>` (dev and e2e builds only) shows "This game needs a recent Chrome, Edge, Firefox or Safari 17+" with `<name>` in the list, and no canvas.

## How to get to it (user POV)

Open the game URL. The game starts by itself (no title screen until #9). No precondition beyond the baseline.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, then use the group's new empty tab (or `tabs_create_mcp`); `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `computer` `screenshot` (`save_to_disk: true`).
3. `javascript_tool`: `JSON.stringify(await window.__vsTest.waitFor((s) => s.ready, 30000))` → `ready: true`, `renderer: "gl"`, `state: "running"`, a `testScene` object.
4. `computer` `key` `ArrowRight` with `repeat: 40`, then `javascript_tool` `JSON.stringify(await window.__vsTest.snapshot())` → `testScene.dotX` above its earlier value, `dotY` unchanged, `steps` and `angleDeg` changed; `screenshot`.
5. `read_console_messages` with pattern `\[vs\]|\[debug\]|error|Error` → `[vs] worker ready, renderer: gl`, no errors.
6. `navigate` to `http://localhost:5180/?forceUnsupported=webgl2-offscreen`; `read_page` → the message text and a list item `webgl2-offscreen`, no canvas; `screenshot`.
7. `screenshot`, `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-boot.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

The spec is `e2e/smoke.spec.ts` (the CI gate). Run it with `pnpm verify:e2e` (launches and cleans up itself), or against a launched client with `VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts smoke`. It saves `boot/` (`01-ready.png`, `02-animating.png`, `03-after-arrow-right.png`, `snapshot-*.json`, `page-console.log`, `worker-console.log`) and `boot-unsupported/`.

## Gotchas

- Each extension `key` press is an instant down and up, so the dot moves only about 3 units for 40 presses (one or two steps of input each); assert "increased", not a distance. Timed holds need Playwright's `holdKeys` (2026-11-08, #31).
- The extension's `read_console_messages` does not return worker console lines (`[worker] …`); Playwright's `worker-console.log` does (#31).
- `gif_creator` only records frames on screenshots and navigations, not key presses: take a screenshot after every action (#31).
- `fps` follows the display: about 120 in real Chrome on a 120 Hz screen, about 55–60 in headless SwiftShader (#31). Steps stay at 60 per second either way.
- Headed Chromium requests a favicon; #48 serves `/ui/favicon.svg`, so any `Failed to load resource` in `pageErrors()` is a real failure (the URL is in the log line).
