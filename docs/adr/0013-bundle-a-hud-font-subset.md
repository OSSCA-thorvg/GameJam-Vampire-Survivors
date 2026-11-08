# 0013. Bundle a HUD font subset for ThorVG text

- Status: Accepted
- Date: 2026-11-08
- Related issues: #46 (found in #2, PR 43); used by #9, #17, #20

## Context

- The HUD is drawn by ThorVG in the game worker (ADRs 0003, 0004). Its timer is `MM:SS` (#9, #17, #20), and the perf overlay wants labels such as `steps/s`.
- `@thorvg/webcanvas` 1.1.3 registers a built-in font as `'default'` during init. #2 found that it draws only letters, digits, space and `( ) + - . =`: `:`, `/`, `%` and the other punctuation render as gaps.
- ADR 0009 keeps Korean text and every nickname in the DOM, so ThorVG text needs printable ASCII only.
- ADR 0011 requires every file that enters the build to be vetted, with its source and license recorded. ADR 0007 lists assets by logical ID in `assets/CATALOG.md`.
- User decision (2026-11-08): bundle a small font subset rather than drawing the missing glyphs by hand or moving the timer to the DOM.

## Decision

- **Font:** Noto Sans Mono Regular, SIL Open Font License 1.1. Monospaced digits keep the timer from jittering as it counts.
- **Source:** `github.com/google/fonts` at commit `097bc1b8c04c3224087c2ae95f7a923859b778cf`, file `ofl/notosansmono/NotoSansMono[wdth,wght].ttf` (SHA-256 `2cb2adb378a8f574213e23df697050b83c54c27df465a2015552740b2769a081`). The repository ships only the variable font, so the Regular instance (`wght` 400, `wdth` 100) is cut from it.
- **Subset:** printable ASCII `U+0020`–`U+007E` only (95 characters plus `.notdef`), with the layout tables (`GSUB`, `GPOS`, `GDEF`), `STAT` and hinting removed, and the copyright and license name records kept. The output is `assets/fonts/hud.ttf`, 9400 bytes (SHA-256 `dc8bbbd58c5b5404ec1eb392b6aedeb81904869b1009ec9b1ba056e4cb310dd0`).
- **Size budget:** under 15 KB. A larger subset needs a new decision.
- **Provenance:** `assets/fonts/LICENSE-NotoSansMono.txt` holds the source commit, the SHA-256 of the source, the OFL text and the subset, and the OFL text itself. Vite's `publicDir` ships it next to the font.
- **Build:** `scripts/make-hud-font.sh` downloads the source at the pinned commit, checks its SHA-256, and runs fonttools 4.68.0 (`fonttools varLib.instancer`, then `pyftsubset`) with the exact flags in its header. fonttools is a contributor tool (`pipx install fonttools==4.68.0`), not a project dependency. `SOURCE_DATE_EPOCH` makes the output byte-for-byte reproducible. The output is committed; nothing runs at build time.
- **Asset ID:** `font.hud` in `assets/CATALOG.md` (a new `font.<name>` namespace). Until the manifest exists (#3), the worker fetches the fixed path `fonts/hud.ttf` under the asset base URL; #3 moves the lookup to `assets/manifest.json`.
- **Loading:** `initThorVG` (`packages/client/src/worker/render/thorvg.ts`), after `ThorVG.init`, fetches the font and calls `TVG.Font.load('hud', bytes, { type: 'ttf' })` once, then sets the exported live binding `HUD_FONT` to `'hud'`. If the fetch or the load fails, it logs one `console.warn`, leaves `HUD_FONT` as `'default'` and boot continues. Every ThorVG `Text` uses `text.font(HUD_FONT)`, read after `initThorVG` resolves.
- **CSP:** the font is same-origin and fetched by the worker with `fetch`, so ADR 0011's `connect-src 'self'` covers it; `font-src` is not involved because no CSS loads it. No CSP change.

## Alternatives considered

- **Draw the colon and other missing glyphs by hand** as ThorVG shapes next to the text — works for `:` alone, but every new label needing `/`, `%` or other punctuation would need more hand-made glyphs and layout code.
- **Move the timer to the DOM** — splits the HUD across two threads and adds a per-second message from the worker, against ADR 0004's rule that the worker draws the HUD.
- **Keep the built-in `'default'` font** — cannot draw `MM:SS`, `/` or `%`.
- **The full Noto Sans Mono, or a Latin-1 subset** — the full variable font is 1.7 MB; ThorVG text is ASCII by ADR 0009, so anything beyond printable ASCII is dead weight.
- **Load from the fontsource CDN** (`TVG.Font.load(name)` without data) — a third-party origin, which ADR 0011's CSP and supply-chain rules exclude.

## Consequences

- `:`, `/`, `%` and every other printable ASCII character render in ThorVG text, and digits have a fixed advance width (600 units), so counters do not jitter.
- Boot makes one more same-origin request (9.4 KB) before the worker posts `ready`.
- A non-ASCII character in ThorVG text still renders as a gap; Korean text stays in the DOM (ADR 0009).
- Changing the font, its subset or its budget means re-running the script, updating the SHA-256s and the size in `assets/fonts/LICENSE-NotoSansMono.txt` and here, and revisiting this ADR.
- If ThorVG's `Font.load` starts needing layout tables (for example for kerning), the subset flags must keep them, at a cost in size.
