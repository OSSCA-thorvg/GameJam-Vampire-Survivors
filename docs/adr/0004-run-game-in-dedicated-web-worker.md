# 0004. Run simulation and rendering in a dedicated Web Worker

- Status: Accepted
- Date: 2026-11-07

## Context

- REQUIREMENTS 12 asks to "use a service worker so the game does not occupy the browser's main thread". A service worker is a network proxy and cannot run a game loop or draw to a canvas. The intent — keep the main thread free — is met by a dedicated Web Worker. The requester confirmed this interpretation on 2026-11-07.
- The benchmark in ADR 0003 ran the same load inside a worker with an `OffscreenCanvas` and WebGL renderer at 60 fps.

## Decision

Thread split:

| Main thread (`packages/client/src/main/`)                                                     | Game worker (`packages/client/src/worker/`)                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| DOM UI: title, character select, lobby (nickname, room code), level-up choice, pause, results | Fixed-timestep simulation of the local player's world                                         |
| Keyboard input capture                                                                        | ThorVG initialization and all rendering, including the in-game HUD (HP, XP bar, timer, level) |
| WebSocket connection (ADR 0006)                                                               | Asset loading from the manifest (ADR 0007)                                                    |

- The canvas is transferred with `canvas.transferControlToOffscreen()`. The main thread never touches it again.
- Main → worker and worker → main messages are a typed discriminated union defined in `packages/client/src/protocol/worker-messages.ts`. Input is sent as the current pressed-direction state on change, not per frame.
- Simulation runs at a fixed 60 Hz step with an accumulator that measures elapsed time with `performance.now()`.
  - **Visible tab:** the worker's `requestAnimationFrame` drives it, running at most 5 steps per frame, then rendering once.
  - **Hidden tab:** browsers stop `requestAnimationFrame`, but the game must keep running, because a versus opponent's world does not stop (decided 2026-11-07). The main thread reports `visibilitychange` to the worker, which switches to a `setTimeout`-driven loop that only simulates. The step cap rises to 120 steps per tick, so throttled timers (down to about 1 Hz) still catch up to real time. Rendering is skipped until the tab is visible again.
  - **Single player:** hiding the tab pauses the game instead (the same as pressing Escape).
- The game always shows a fixed 1280×720 logical view, scaled to fit and letterboxed, so window size gives no advantage in versus play.
- The worker pauses the simulation while the level-up choice is open. In multiplayer the opponent's world keeps running.
- Entity state uses typed-array struct-of-arrays plus a uniform-grid spatial hash. Gameplay code must not allocate per entity per frame.
- Randomness comes from a seeded PRNG passed in at game start, never `Math.random()`, so runs can be reproduced in tests.
- A service worker for asset caching is out of scope. It can be added later without affecting this split.

## Alternatives considered

- **Everything on the main thread** — measured equally fast, but violates REQUIREMENTS 12 and lets DOM work cause frame hitches.
- **Simulation in a worker, rendering on the main thread** — sends every entity position across threads each frame and leaves rendering on the main thread.

## Consequences

- Requires `OffscreenCanvas` with WebGL in workers and module workers: current Chrome, Edge, Firefox, and Safari 17 or newer. Older browsers get a clear unsupported message instead of a fallback.
- DOM UI cannot read game state directly. Everything the UI shows must be sent as worker messages, which keeps the boundary explicit.
- Debugging rendering happens in the worker's DevTools context.
