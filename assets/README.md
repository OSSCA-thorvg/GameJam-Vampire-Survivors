# Game assets

Game code uses catalog IDs such as `enemy.bat`, never asset file paths. `manifest.json` maps IDs to replaceable files served from this directory (ADR 0007).

To replace art, replace its file, then reload the page. To switch format, edit its manifest `file` and `format` together. Drawable formats are SVG, Lottie JSON, PNG and WebP. Keep `size` in logical world units and `anchor` in normalized coordinates. Raster entries accept `filter: "nearest"` or `"bilinear"`; Lottie entries accept `loop` (default true). Replacement needs no game-code change or development-server restart.

To add an ID:

1. Add its row to `CATALOG.md` with status `needed`.
2. Run `pnpm assets:sync` to regenerate the committed IDs and sizes.
3. Add its original or licensed file and manifest entry.
4. Change the catalog status to `placeholder` or `final`.
5. Run `pnpm check` and verify `/?gallery` in a development/e2e build.

Missing drawable files show a magenta square with a dark diagonal and report their ID once. Missing catalog entries are grouped in one warning while art is still needed. The gallery skips fonts, labels every drawable ID, marks anchors with white crosses and pans with arrow keys.

Mass art (enemies, projectiles and gems) has at most four SVG paths, no strokes and no gradients. Use Lottie for a few players, bosses or effects; heavy animation use needs the measurements tracked in #22. Masters are cached once; static instances duplicate them. Each Lottie instance owns independent playback from cached JSON.

## Sources and licenses

`enemies/bat.svg`, `ui/placeholder.svg` and `fx/level-up.json` are original project placeholder art created for #3. `ui/favicon.svg` is the existing original red-gem icon from #48. Nothing is copied from Vampire Survivors.

`font.hud` is the existing Noto Sans Mono Regular subset (9400 bytes), licensed under SIL OFL 1.1. Its manifest format is `ttf`; fonts have no drawable size or anchor and cannot be instantiated by AssetLibrary. The worker registers it as `hud`; a missing or invalid font, including a missing-file HTML response with status 200, warns once and uses ThorVG's built-in `default` font.

[fonts/LICENSE-NotoSansMono.txt](fonts/LICENSE-NotoSansMono.txt) records the upstream repository, pinned commit, source and subset SHA-256s, modifications and full license. Keep it beside the font. Preserve printable ASCII and the under-15-KB budget from ADR 0013. Rebuild only with `sh scripts/make-hud-font.sh`, using contributor tool fonttools 4.68.0; it is not a project dependency and does not run during builds.
