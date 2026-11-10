# 0024. Show the opponent as picture-in-picture on touch devices

- Status: Accepted
- Date: 2026-11-10
- Related issues: #150; partly supersedes ADR [0018](0018-show-the-opponent-world-from-a-relayed-view-stream.md) (only its layout on touch devices; the equal split on desktop, the view stream, its encoding, rate and the 200 ms render delay are retained)

## Context

- REQUIREMENTS 2 (two players). ADR 0018 (user decision 2026-11-09) shows both worlds of a versus match as two equal panes, `columns` or `rows`, whichever gives the larger panes. #115 drew it; #149 made the game playable on phones and tablets with touch controls (`main/input-mode.ts`, `createInputMode(doc, win).mode === 'touch'`).
- On a phone in landscape (a Pixel 7 is 915×412 CSS pixels, an iPhone 14 844×390) two equal 1280×720 views in `columns` are each about 450×253 CSS pixels: the player's own world, the one they steer with the joystick, is too small to play.
- **User decision (2026-11-10):** on touch devices a versus match shows the player's own world full size and the opponent's world as a small picture-in-picture inset in the top-right corner, at 0.32 of the view's size. Desktop keeps ADR 0018's equal panes.
- ADR 0004: every view shows the whole fixed 1280×720 logical area, so screen size gives no advantage. ADR 0005: worlds stay separate; this is presentation only.
- ThorVG (found in #115): a scene's clipper does not move with that scene's own translate, so every clip sits on an untransformed outer frame in `root` units, and the opponent's placement is a transform of the inner `opponent` scene.

## Decision

- **Layout `pip`:** `PaneLayout` is `'single' | 'columns' | 'rows' | 'pip'`, on the main thread (`main/viewport.ts`) and in the worker messages (`init`/`resize` `layout`). `computeViewport(w, h, dpr, panes, mode)` takes a pane mode `'split' | 'pip'` (default `'split'`); with `panes` 2 and mode `'pip'` it fits one view exactly like `single`, returns layout `pip`, the full view as `panes[0]` and the inset as `panes[1]`.
- **The inset:** `PIP_SCALE` 0.32, `PIP_MARGIN` 16 and `PIP_TOP` 64 logical units: the inset's logical rect is `x = 1280 - 16 - 1280 * 0.32` (854.4), `y = 64`, `409.6 × 230.4`. The inset and its frame clear every HUD element by at least 8 units: the lowest top-right element is the kill count, whose glyphs and outline end at y = 50 at 1280×720 (`render/hud.ts` `HUD_TOP_RIGHT_BOTTOM`; the skull ends at 41, "Lv n" at 17, the XP bar at 12), and the backdrop starts at 62. The first draft's `PIP_TOP` 48 put the frame against the kill count's digits. It shows the opponent's whole 1280×720 view drawn scaled down, so it reveals nothing beyond what the split showed. It has a frame: a black backdrop at 60% opacity 2 units beyond the inset, drawn under it, and a white 2-unit stroke on its edge, drawn above it. Both shapes are created once at boot and shown only in `pip`.
- **When:** the main thread asks for `pip` while `inputMode.mode === 'touch'` and `split` otherwise. A change of input mode during a match relayouts at once, like a resize that crosses `columns`/`rows` (`main/resize.ts`). Single player is unchanged: one view in every mode.
- **Worker:** `render/panes.ts` `apply('pip', …)` clips `self` to the whole area, translates the inner `opponent` scene to the inset's origin and scales it by `PIP_SCALE`, and clips the untransformed frame to the inset. Every other layout resets the scale to 1 and hides the frame. The opponent view snaps its camera at the inset's device scale. No Paint is created by `apply`.
- **Labels:** the "YOU" label is for two equal panes only and stays hidden in `pip`. The opponent's "OPPONENT", `mm:ss` and AWAY/OUT dim draw inside the scaled scene as before. The DOM opponent panel sits directly under the inset, compact (nickname and HP), and the versus and interference banners stay on the own view.

## Alternatives considered

- **Keep the equal split on phones** — each world about a quarter of the screen; the own world is too small to steer and read.
- **A switchable full-screen opponent view** (tap to swap) — hides the own world while the player is steering; out of the user's request (dragging, resizing or swapping the inset is out of scope for #150).
- **Choose `pip` by screen size instead of input mode** — a small desktop window would lose the split the user asked for on desktop, and a large touch tablet would keep a split it cannot steer comfortably; #149 already decides touch versus keys by input mode, and the controls follow it.
- **A separate ThorVG canvas for the inset** — a second WebGL context in the worker and a second backing store; the scaled inner scene under the existing clipped frame costs nothing extra.

## Consequences

- Touch devices see their own world at full size; the opponent inset is about 0.1 of the screen area.
- The layout depends on the input mode as well as the window, so a switch between touch and keys during a match changes it immediately; the pane rects in the snapshot (`layout.panes[1]`) are the inset in `pip`.
- `PIP_*` live once in `worker/constants.ts`, read by `main/viewport.ts` (the DOM pane rects) and `worker/render/panes.ts` (the drawing), so the DOM panel and the drawn inset cannot drift apart.
- Revisit if the inset is too small to read on small phones, or if players ask to move or enlarge it; dragging, resizing and swapping are a later decision.
