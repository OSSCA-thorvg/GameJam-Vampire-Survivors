# Game assets

Game code uses catalog IDs such as `enemy.bat`, never asset file paths. `manifest.json` maps IDs to replaceable files served from this directory (ADRs 0007 and 0016).

To replace art, replace its file, then reload the page. To switch format, edit its manifest `file` and `format` together. Drawable formats are SVG, Lottie JSON, PNG and WebP. Keep `size` in logical world units and `anchor` in normalized coordinates. Raster entries accept `filter: "nearest"` or `"bilinear"`; Lottie entries accept `loop` (default true). Replacement needs no game-code change or development-server restart.

## Style guide (generated pixel artwork, #76)

Use original 2D fantasy art with the approved moderate pixel finish: two physical pixels per block, up to 64 visible colors, and nearest filtering. Preserve each character/item identity and the palette below. Nothing is traced or copied from Vampire Survivors. The baseline 82 IDs plus Aurelia's two new art IDs give 84 catalog entries: 81 static PNGs, two native Lotties and the preserved font. Warden and Ember are male; silver-haired elf Swift (blue clothing, visible pointed ears and pale ivory face/ears/neck/hands) and white-and-gold paladin Aurelia are female. Gameplay selection and stats remain #14 work.

Static PNGs are noninterlaced 8-bit RGBA at exactly four times catalog dimensions; manifest sizes and anchors remain logical. Ground is opaque and seamlessly tileable; the rectangular HP track is opaque for the separately drawn live fill, and other artwork has transparency. PNG framing, CRC, metadata, actual decoding and alpha are checked. Both axes are bounded to 2048; encoded bytes and decoded RGBA are each bounded to 16 MiB. Regenerate rejected art through [the authoring workflow](../docs/assets/README.md).

- Keep readable silhouettes at the actual logical display size, with clear equipment, restrained shading and top-left light.
- Art faces right; the game flips it for leftward movement.
- Any retained or future SVG starts with `<svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H">` at its catalog size, so `Picture.size()` maps 1:1.
- Anchors: characters `[0.5, 0.9]` (feet), `stage.ground` `[0, 0]` (tile corner), everything else `[0.5, 0.5]`.
- Conditional SVG budget for mass rows (enemies, mass projectiles, gems): at most 4 `<path>`, `<circle>`, `<rect>`, `<ellipse>`, `<polygon>` (and `<polyline>`, `<line>`) elements in total, no `stroke`, no gradients, no `<filter>`, `<mask>`, `<clipPath>`, `<image>` or `<text>`. Several sub-paths in one `<path>` count once, so eyes or ribs can share one element. Bosses, players, UI and effects are exempt.
- Inert files only (ADR 0011): no `<script>`, `on*` attributes, `<foreignObject>`, `<style>`, external `href`/`xlink:href`/`url()` (local `#fragment` references are fine), DOCTYPE or entities. SVG checks remain conditional on SVG entries; switching to PNG never removes them. Lottie permits inert shape layers and validated same-owner image layers only; see the resource contract below.
- `stage.ground` is a 128×128 tile whose marks stay at least 8 units from every edge, so tiling shows no seams. Place tiles overlapping by 1 unit (scale `129/128`), as the gallery preview does: anti-aliased tile edges at fractional view scales otherwise show hairlines.
- Each category has a hue family, so things read at a glance:

| Category | Colors |
| --- | --- |
| Players (one per character) | warden `#e8b04a`, ember `#d9622b`, swift `#4ab0e8`; Aurelia white/gold; skin `#f4e9d8`, dark `#2b2b3a`; darker shades `#b8862f`, `#2f7fb0` |
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
3. Generate/export at the naming-rule path using the approved recipe; follow the PNG budgets above, or the conditional vector budget for SVG.
4. Add its manifest entry: `file` from the naming rule, `format`, `size` from the catalog, `anchor` from the style guide.
5. Change the catalog status to `placeholder` or `final`.
6. Run `pnpm check` (it includes `packages/shared/src/assets-catalog.test.ts`) and verify `/?gallery` in a development/e2e build; press `V` there for the speed preview of mass art.

Final art replaces a file without game-code changes: preserve its logical size and anchor, update manifest file/format together when changing formats, validate the new bytes and set status to `final` after visual QA.

Missing drawable files show a magenta square with a dark diagonal and report their ID once. Missing catalog entries are grouped in one warning while art is still needed. The gallery skips fonts, labels every drawable ID, marks anchors with white crosses and pans with arrow keys.

The HP bar is an empty frame/neutral track at40×6 logical (160×24 physical); the worker draws the shrinking red fill in its38×4 logical inner rectangle. Never bake a red health value into this asset.

## Lottie resource contract

Keep `fx.levelUp` at 96×96, 30 fps, one second; keep `fx.chestOpen` at 128×128, 30 fps, 0.8 seconds. Both loop and use the existing native transform/opacity envelopes over generated abstract effect PNGs; this wrapper is repository integration, not an upstream animation export. Four-times PNGs use 25% base scale.

For `fx/level-up.json`, image resources must use `u=''`, `e=0`, and `p='level-up/art.png'`. No traversal, absolute/URL/data path, text, audio, expression or unsupported layer is admitted. Up to 64 images may use 32 MiB decoded data in total, within the per-image limits. Timelines must remain valid in native float arithmetic. Every PNG is fetched, decoded and cached before native load; callbacks resolve only the canonical key and the pinned engine's exact leading-slash alias. Instances retain independent playback and nearest-filtered child Pictures. Resolver errors are recorded, handled without allowing native fallback loading, then surfaced through the normal magenta fallback.

Masters are cached once; static instances duplicate them. Heavy animation remains subject to measurements in #22; entity caps and worker/paint pooling are unchanged.

## Sources and licenses

The #3/#5 geometric placeholder pack is replaced through the pinned sprite-gen authoring workflow. [Recipes, access rules and commands](../docs/assets/README.md) document the confirmed ChatGPT subscription, explicit provider, source/export/processing hashes and visual approval receipts. New Aurelia IDs have no invented baseline hash. The tool's Apache-2.0 license covers sprite-gen, not a blanket license for generated artwork. No credentials or global account settings belong in receipts.

`font.hud` is the existing Noto Sans Mono Regular subset (9400 bytes), licensed under SIL OFL 1.1. Its manifest format is `ttf`; fonts have no drawable size or anchor and cannot be instantiated by AssetLibrary. The worker registers it as `hud`; a missing or invalid font, including a missing-file HTML response with status 200, warns once and uses ThorVG's built-in `default` font.

[fonts/LICENSE-NotoSansMono.txt](fonts/LICENSE-NotoSansMono.txt) records the upstream repository, pinned commit, source and subset SHA-256s, modifications and full license. Keep it beside the font. Preserve printable ASCII and the under-15-KB budget from ADR 0013. Rebuild only with `sh scripts/make-hud-font.sh`, using contributor tool fonttools 4.68.0; it is not a project dependency and does not run during builds.

Native idle/walk and visual movement for the closed36-ID actor/weapon/effect/brazier inventory are planned separately in #84 after this artwork stage. The current pack does not claim those animations or character-selection/stats support.
