# Touch controls

Playing on phones and tablets by touch alone (#149, ADRs 0004 and 0009): the touch/keys input mode, the floating joystick, the Pause button, tappable screens, a page that never scrolls or zooms, sound on the first tap, and the portrait "rotate" hint.

## Sub-features

- **Input mode:** a coarse primary pointer starts in touch mode; a touch `pointerdown` switches to it, a mouse `pointerdown` or a movement key outside a text field back to keys. `touch.mode` is `'touch'` or `'keys'`, and `document.body.dataset.input` matches. Typing a nickname or room code keeps touch mode. A desktop with a mouse never sees a touch control: `touch.mode === 'keys'`, `#pause-button` and `#touch-layer` hidden, `#fullscreen` hidden.
- **Floating joystick:** while a run is played (`playing` not paused, or `versusPlaying` without a dialog) `touch.stickActive` is true. A touch anywhere on the game sets the origin (a 96 px ring and a 40 px knob appear); a drag past 14 px snaps to the nearest of 8 directions: right 60 px gives `touch.axis` `[1, 0]` and `player.x` rises (at least 200 units in 2 s), up-left gives `[-1, -1]`; release gives `[0, 0]` and the player stops. The worker's `input` message is unchanged (`dx`, `dy` in −1/0/1). A level-up or chest dialog deactivates the stick (axis `[0, 0]`).
- **Pause button:** `#pause-button` ("Pause", top right) shows only in touch mode in an unpaused single-player run (`touch.pauseButton: true`); a tap shows the Paused dialog and hides the button; Resume resumes. It is hidden in versus and on desktop.
- **Tappable screens:** the title (Start, Multiplayer, Records, and Fullscreen where `document.fullscreenEnabled`), the character select (tap a card, then Start; Back), the level-up cards, the chest overlay (a tap anywhere closes it), the pause screen, the results, the records, the multiplayer entry (the nickname and code typed with the phone keyboard; Create room, Join room, Join, Back) and the lobby (Ready, Start, Leave) all work by taps. Buttons are at least 44 px tall in touch mode; on a short landscape phone the entry and lobby buttons sit side by side and taller screens scroll inside themselves.
- **No scroll, zoom or selection:** after a swipe and a two-finger pinch over the game, `scrollX`/`scrollY` are 0, `visualViewport.scale` is 1, `body` has `user-select: none` and `touch-action: none`, and nothing is selected.
- **Sound on the first tap:** after the first tap on the title, `audio.unlocked` is true (the director also unlocks on trusted `touchend` and `click`, which iOS Safari needs).
- **Portrait hint:** in touch mode a portrait window shows `#rotate-hint` ("Rotate your device to landscape", `touch.rotateHint: true`) and pauses a single-player run (the Paused dialog, `timeS` frozen); back in landscape the hint goes and Resume continues. Versus keeps running.
- Snapshot field `touch` (main thread, `main/index.ts`): `{ mode, stickActive, axis: [dx, dy], pauseButton, rotateHint }`; also `state`, `player`, `timeS`, `characterId`, `audio.unlocked`.

## How to get to it (user POV)

Open the game on a phone or tablet held in landscape (or a Playwright touch device, below) and tap Start, a character, then Start. Drag anywhere on the game to move; tap Pause to pause. Preconditions used by the journeys: `L` (a level-up), `I` and `E` (an elite whose chest opens near the player), arrow keys to walk into that chest in WebKit (no touch drag there). The versus journey needs the server (`pnpm verify:launch --with-server`, or any server on `http://localhost:8787` that allows the client's origin).

## Driving it

### Claude in Chrome

Claude in Chrome drives a desktop Chrome with a mouse, which is keys mode; it can check the desktop side only.

1. `tabs_context_mcp` `{ createIfEmpty: true }`; `navigate` to `http://localhost:5180/`; `javascript_tool` `JSON.stringify((await window.__vsTest.waitFor((s) => s.state === 'title', 30000)).touch)` → `mode: "keys"`.
2. `find` "Start button", `left_click` it, `computer` `key` `Enter`; `javascript_tool` the `touch` field → `stickActive: false`, `pauseButton: false`; `read_page` → no "Pause" button; `screenshot`.
3. For the touch journeys use Playwright (below): the extension cannot send touch events.

### Playwright

The journeys are `e2e/touch.spec.ts`:

- `touch 1` (`mobile-chromium` only): taps into a Swift run (sound unlocked after the first tap), drags the joystick with CDP `Input.dispatchTouchEvent` right 60 px for 2 s (`[1, 0]`, `player.x` +200 or more), up-left (`[-1, -1]`), releases (`[0, 0]`, the player stays put), swipes and pinches (`page-after-swipe-and-pinch.json`), answers a level-up (`L`) with a tap, pauses and resumes with the button, and rotates to 412×915 (hint, Paused, frozen `timeS`) and back. Saves `touch-1/` screenshots and JSON.
- `touch 2` (every mobile project): taps into a run, a level-up card, Pause and Resume, portrait. Saves `touch-2-<project>/`.
- `touch 3` (every mobile project): `I`, `E`, walks into the chest with arrow pulses when needed, closes the Treasure dialog with a tap. Saves `touch-3-<project>/`.
- `touch 4` (every mobile project, skipped without a server at `VERIFY_SERVER_HTTP` or `http://localhost:8787/healthz`): two phones go through Multiplayer, Create room / Join room / Join, Ready and Start by taps; in `versusPlaying` both have the stick and no Pause button; in Chromium A's joystick moves the player down. Saves `touch-4-<project>/a|b/`.
- `touch desktop` (`chromium` only): a mouse click and Enter start a run with `touch.mode === 'keys'` and no touch control visible.

Run with `pnpm verify:e2e --project mobile-chromium` (and `--with-server` for `touch 4`), `VERIFY_MOBILE_WEBKIT=1 pnpm verify:e2e --project mobile-webkit` (after `pnpm exec playwright install webkit`), or against a running client: `VERIFY_URL=<url> VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project mobile-chromium touch`.

## Gotchas

- Playwright's WebKit has no touch drag, so the joystick is driven only in `mobile-chromium` (CDP touch events); WebKit covers the taps, the pause, the portrait hint and the first-tap sound (2026-11-10, #149).
- `mobile-webkit` is opt-in (`VERIFY_MOBILE_WEBKIT=1`) because CI installs only Chromium; `mobile-chromium` runs in CI's `verify` job (2026-11-10, #149).
- `keyboard.type` sends real key codes, so typing "Alice" used to switch to keys mode and move every control between a tap's `pointerdown` and its `click` (the click landed on the input above Join). Text fields are now ignored by the input mode; a journey that types elsewhere than a text field leaves touch mode (2026-11-10, #149).
- Screens taller than the phone scroll inside themselves; `settledTap` in the spec centres a control and waits 250 ms before tapping, since a touch on a moving scroller stops it instead of clicking (2026-11-10, #149).
- The rotate journey resizes the page (`setViewportSize` 412×915); Chromium and WebKit fire the `(orientation: portrait)` change for it (2026-11-10, #149).
