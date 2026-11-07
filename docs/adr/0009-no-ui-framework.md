# 0009. No UI framework: plain TypeScript DOM for menus and overlays

- Status: Accepted
- Date: 2026-11-07

## Context

- The requester asked to avoid React and keep the web layer as light as possible (2026-11-07).
- The game itself is drawn by ThorVG in a worker (ADRs 0003 and 0004). The DOM only shows a handful of screens: title, character select, lobby (nickname, room code, ready list), level-up choice, pause, results, and the opponent status panel.

## Decision

- No UI framework and no virtual DOM: no React, Preact, Vue, Svelte or Lit. Runtime dependencies of the client are limited to `@thorvg/webcanvas`.
- Each screen is a module in `packages/client/src/main/ui/` exporting `mount(root: HTMLElement, props): Screen`, where `Screen` has `update(props)` and `unmount()`. Screens build their elements with a small typed helper, `h(tag, attrs, children)`, in `ui/dom.ts`. They never assign `innerHTML` from data, which rules out injecting user-controlled nicknames into markup.
- A tiny state machine in `src/main/app.ts` owns the current screen (`title → characterSelect → playing ⇄ levelUp/pause → results`, plus `lobby` for multiplayer) and is the only code that mounts and unmounts screens.
- Styling is plain CSS files imported through Vite, with CSS custom properties for colors, and no CSS framework.
- Keyboard-first: every screen is usable with arrow keys or WASD plus Enter and Escape, with mouse as a secondary input.

## Alternatives considered

- **React or Preact** — rejected by the requester. A handful of screens does not need reconciliation.
- **Lit / Web Components** — light, but adds a dependency and a component model for little gain here.
- **Drawing all UI in ThorVG** — avoids the DOM entirely, but text input (nickname, room code) and accessibility are much harder. The HUD is still drawn in ThorVG (ADR 0004).

## Consequences

- Small bundle and no framework learning curve. Screens must clean up their own listeners in `unmount()`.
- If the UI grows far beyond these screens, revisit this ADR rather than adding ad-hoc helpers.
