# 0003. Render with @thorvg/webcanvas using the WebGL backend

- Status: Accepted
- Date: 2026-11-07

## Context

- REQUIREMENTS 10: use `@thorvg/webcanvas` from thorvg.web.
- The team wants ThorVG's GPU acceleration.
- `thorvg.unity` was evaluated as an alternative. Its web build rasterizes with ThorVG's software engine (`-Dengines=sw`) and uploads the pixels into a Unity texture, so ThorVG itself is not GPU-accelerated there, and it exposes SVG import and Lottie playback rather than a drawing API.

A benchmark (2026-11-01, Chrome 156, Apple M4 Pro, 1280x720, enemies chasing two players with grid separation plus N/2 bullets) measured median milliseconds per frame. Frame interval is capped by 60 Hz vsync, so 16.7 means "held 60 fps".

| Renderer / art                | Entities | Game logic | JS→WASM calls | `update` | `render` |  Frame interval |
| ----------------------------- | -------: | ---------: | ------------: | -------: | -------: | --------------: |
| gl / PNG picture              |     3000 |        1.4 |             0 |      0.3 |      0.2 |            16.7 |
| wg / PNG picture              |     3000 |        1.9 |             0 |      0.2 |      0.4 |            16.7 |
| sw / PNG picture              |     3000 |        1.1 |             0 |      0.3 |     17.4 | 16.7 (p95 33.4) |
| gl / one-circle shape         |     3000 |        1.3 |           0.1 |      3.4 |      0.4 |            16.7 |
| gl / SVG, 10 stroked paths    |      300 |          0 |             0 |      6.4 |      1.8 |            16.7 |
| gl / SVG, 10 stroked paths    |     1000 |        0.2 |           0.1 |     21.7 |     14.1 |            33.3 |
| gl / PNG picture, in a worker |     3000 |        1.6 |             0 |      0.3 |      0.2 |            16.7 |

Limits of that benchmark: a high-end machine, one sprite type, no animation, no real weapon logic.

## Decision

- Initialize ThorVG once with `renderer: 'gl'` (WebGL 2) in the game worker, rendering into an `OffscreenCanvas` (ADR 0004).
- Do not use WebGPU (`'wg'`) by default: it was no faster in the measurement and has narrower browser support. Switching is a one-line change and may be revisited with data.
- Do not use the `@thorvg/webcanvas/thread` build: its multithreading only helps the software renderer and it requires COOP/COEP headers.
- Create Paint objects once and reuse them from pools; per frame, only change transforms, visibility and opacity. Do not create and dispose Paints every frame.
- Clone repeated sprites with `paint.duplicate()` from a loaded master instead of re-parsing the asset.
- Call `canvas.update()` and `canvas.render()` once per rendered frame.

## Alternatives considered

- **Unity + thorvg.unity** — ThorVG is not GPU-accelerated in that path, and its API does not cover runtime drawing. It remains a possible contribution target, not this game's renderer.
- **Software renderer** — 17 ms of `render` alone at 3000 sprites; no headroom.
- **Game in another language compiled to WASM** — the game logic was about 1.5 ms per frame at 3000 entities in plain TypeScript, so there is little to gain, and the renderer is reached through the JS API anyway.

## Consequences

- `update` is CPU work even on the WebGL backend, and it grows with vector complexity: 1000 instances of a 10-path stroked SVG already miss 60 fps. ADR 0007 sets art guidelines and entity caps because of this.
- Requires WebGL 2 in a worker via `OffscreenCanvas`; the support matrix is in ADR 0004.
