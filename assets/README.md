# Game assets

Game code uses catalog IDs such as `enemy.bat`, never asset file paths. `manifest.json` maps IDs to replaceable files served from this directory (ADR 0007).

To replace art, replace its file, then reload the page. To switch format, edit its manifest `file` and `format` together. Drawable formats are SVG, Lottie JSON, PNG and WebP. Keep `size` in logical world units and `anchor` in normalized coordinates. Raster entries accept `filter: "nearest"` or `"bilinear"`; Lottie entries accept `loop` (default true). Replacement needs no game-code change or development-server restart.

## Style guide (starter pack, #5)

The starter pack is rough, original placeholder art drawn for this project, meant to be replaced file by file. Nothing is traced or copied from Vampire Survivors.

- Flat shapes, no outlines, chunky silhouettes that read at 32 px. Light comes from the top left, implied by at most one darker shape.
- Art faces right; the game flips it for leftward movement.
- Every SVG starts with `<svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H">` at its catalog size, so `Picture.size()` maps 1:1.
- Anchors: characters `[0.5, 0.9]` (feet), `stage.ground` `[0, 0]` (tile corner), everything else `[0.5, 0.5]`.
- Mass rows (enemies, mass projectiles, gems): at most 4 `<path>`, `<circle>`, `<rect>`, `<ellipse>`, `<polygon>` (and `<polyline>`, `<line>`) elements in total, no `stroke`, no gradients, no `<filter>`, `<mask>`, `<clipPath>`, `<image>` or `<text>`. Several sub-paths in one `<path>` count once, so eyes or ribs can share one element. Bosses, players, UI and effects are exempt.
- Inert files only (ADR 0011): no `<script>`, `on*` attributes, `<foreignObject>`, `<style>`, external `href`/`xlink:href`/`url()` (local `#fragment` references are fine), DOCTYPE or entities. Lottie files hold shape layers only: no image or text layers, no `assets` entry with `p`, no expressions (a string `x`).
- `stage.ground` is a 128×128 tile whose marks stay at least 8 units from every edge, so tiling shows no seams. Place tiles overlapping by 1 unit (scale `129/128`), as the gallery preview does: anti-aliased tile edges at fractional view scales otherwise show hairlines.
- Each category has a hue family, so things read at a glance:

| Category | Colors |
| --- | --- |
| Players (one per character) | warden `#e8b04a`, ember `#d9622b`, swift `#4ab0e8`; skin `#f4e9d8`, dark `#2b2b3a`; darker shades `#b8862f`, `#2f7fb0` |
| Enemies (desaturated purples, greens, greys) | `#7a5c99`, `#5c8a5a`, `#9aa0a6`, `#b8c4ff`, `#6b4a3a`, `#3d2f4f`; lighter shades `#7fa87c`, `#d6d9de`, `#e6ebff`, shadow `#4a3328`; the #3 bat keeps `#b88cff`/`#f5d9ff` |
| Bosses | the enemy family darkened (`#2a1f38`, `#140f1c`), red accent `#c0392b` |
| Player weapons | `#ffffff`, `#ffe066`, `#7fe3ff`, `#ff8a3d`; book covers `#3a6fd8`, `#6b3ad8`; evolutions are bigger, brighter versions of their base weapon |
| Gems | `#3fa7ff` blue, `#3fd17a` green, `#ff4d5e` red, each with one lighter facet |
| Pickups (no coin or gold imagery) | floor chicken `#e07a3d`, rosary `#f4f4f4`, orologion `#7fe3ff`, vacuum `#b07aff`, little clover `#3fd17a`, chest `#8a5a2b` with `#2b2b3a` bands |
| Interference pickups and `fx.warning` | magenta-black hazard: `#ff2bd6` on `#1a1a1a`, so they never look like normal pickups |
| Stage | muted greens `#2f4a2f`, `#3a5a37`, `#466b40` |
| Icons | 32×32 on a rounded dark `#2b2b3a` tile, so they read on any background |

## Naming rule

The manifest never needs guessing: `packages/shared/src/assets-catalog.test.ts` checks every entry against this rule.

- Folder: the one in the catalog section heading (`characters/`, `enemies/`, `bosses/`, `weapons/`, `icons/`, `pickups/`, `stage/`, `fx/`, `ui/`, `fonts/`).
- File name: the ID without its first segment, dots turned into hyphens and camelCase into kebab-case, plus the format's extension (`.svg`, `.json` for Lottie, `.png`, `.webp`, `.ttf`). Examples: `player.warden` → `characters/warden.svg`, `weapon.magicWand` → `weapons/magic-wand.svg`, `icon.passive.hollowHeart` → `icons/passive-hollow-heart.svg`, `pickup.interference.gemThief` → `pickups/interference-gem-thief.svg`, `fx.chestOpen` → `fx/chest-open.json`, `ui.xpBar` → `ui/xp-bar.svg`.
- Exceptions: `portrait.<id>` and `gem.<tier>` keep their first segment as a prefix (`characters/portrait-warden.svg`, `pickups/gem-blue.svg`), because `portrait.warden` would otherwise collide with `player.warden`, and bare tier names would be unclear among the pickups.

## Adding assets later

1. Add its row to `CATALOG.md` with status `needed`.
2. Run `pnpm assets:sync` to regenerate the committed IDs and sizes.
3. Draw the file at the path the naming rule gives, within the budget (mass rows: at most 4 shapes, no strokes, no gradients), following the style guide below.
4. Add its manifest entry: `file` from the naming rule, `format`, `size` from the catalog, `anchor` from the style guide.
5. Change the catalog status to `placeholder` or `final`.
6. Run `pnpm check` (it includes `packages/shared/src/assets-catalog.test.ts`) and verify `/?gallery` in a development/e2e build; press `V` there for the speed preview of mass art.

Final art replaces a file in place, with no code change: keep the file name, the `width`/`height`/`viewBox` and the anchor point, then set the status to `final`.

Missing drawable files show a magenta square with a dark diagonal and report their ID once. Missing catalog entries are grouped in one warning while art is still needed. The gallery skips fonts, labels every drawable ID, marks anchors with white crosses and pans with arrow keys.

Mass art (enemies, projectiles and gems) has at most four SVG paths, no strokes and no gradients. Use Lottie for a few players, bosses or effects; heavy animation use needs the measurements tracked in #22. Masters are cached once; static instances duplicate them. Each Lottie instance owns independent playback from cached JSON.

## Sources and licenses

`enemies/bat.svg`, `ui/placeholder.svg` and `fx/level-up.json` are original project placeholder art created for #3. Every other file under `characters/`, `enemies/`, `bosses/`, `weapons/`, `icons/`, `pickups/`, `stage/`, `fx/` and `ui/` (except `ui/favicon.svg`) is the original starter pack drawn for #5 from simple geometric shapes. `ui/favicon.svg` is the existing original red-gem icon from #48. Nothing is copied from Vampire Survivors.

`font.hud` is the existing Noto Sans Mono Regular subset (9400 bytes), licensed under SIL OFL 1.1. Its manifest format is `ttf`; fonts have no drawable size or anchor and cannot be instantiated by AssetLibrary. The worker registers it as `hud`; a missing or invalid font, including a missing-file HTML response with status 200, warns once and uses ThorVG's built-in `default` font.

[fonts/LICENSE-NotoSansMono.txt](fonts/LICENSE-NotoSansMono.txt) records the upstream repository, pinned commit, source and subset SHA-256s, modifications and full license. Keep it beside the font. Preserve printable ASCII and the under-15-KB budget from ADR 0013. Rebuild only with `sh scripts/make-hud-font.sh`, using contributor tool fonttools 4.68.0; it is not a project dependency and does not run during builds.
