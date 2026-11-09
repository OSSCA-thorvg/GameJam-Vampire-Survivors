# Game assets

Game code uses catalog IDs such as `enemy.bat`, never asset file paths. `manifest.json` maps IDs to replaceable files served from this directory (ADRs 0007 and 0016).

To replace art, replace its file, then reload the page. To switch format, edit its manifest `file` and `format` together. Drawable formats are SVG, Lottie JSON, PNG and WebP. Keep `size` in logical world units and `anchor` in normalized coordinates. Raster entries accept `filter: "nearest"` or `"bilinear"`; Lottie entries accept `loop` (default true). Replacement needs no game-code change or development-server restart.

## Style guide (generated pixel artwork and motion, #76/#84)

Use original 2D fantasy art with the approved moderate pixel finish: two physical pixels per block for four-times static art, one per block for two-times motion resources, up to 64 visible colors, and nearest filtering. Preserve each character/item identity and the palette below. Nothing is traced or copied from Vampire Survivors. The catalog has 85 IDs across 47 static PNGs, 36 native-motion Lotties, the upstream shape-only diagnostic Lottie and the font. Warden and Ember are male; silver-haired elf Swift (blue clothing, visible pointed ears and pale ivory face/ears/neck/hands) and white-and-gold paladin Aurelia are female. #14 supplies gameplay selection and stats; this migration preserves them.

The boot splash `ui.splash` (#126) is the 86th ID and the 38th Lottie: the "Powered by ThorVG" animation provided by the ThorVG project, not generated art and not part of the #84 motion receipt (ADR 0020); its one image keeps smooth bilinear filtering.

Static PNGs are noninterlaced 8-bit RGBA at exactly four times catalog dimensions; manifest sizes and anchors remain logical. Ground is opaque and seamlessly tileable; the rectangular HP track is opaque for the separately drawn live fill, and other artwork has transparency. PNG framing, CRC, metadata, actual decoding and alpha are checked. Both axes are bounded to 2048; encoded bytes and decoded RGBA are each bounded to 16 MiB. Regenerate rejected art through [the authoring workflow](../docs/assets/README.md).

- Keep readable silhouettes at the actual logical display size, with clear equipment, restrained shading and top-left light.
- Art faces right; the game flips it for leftward movement.
- Any retained or future SVG starts with `<svg xmlns="http://www.w3.org/2000/svg" width="W" height="H" viewBox="0 0 W H">` at its catalog size, so `Picture.size()` maps 1:1.
- Anchors: characters `[0.5, 0.9]` (feet), `stage.ground` `[0, 0]` (tile corner), everything else `[0.5, 0.5]`.
- Conditional SVG budget for mass rows (enemies, mass projectiles, gems): at most 4 `<path>`, `<circle>`, `<rect>`, `<ellipse>`, `<polygon>` (and `<polyline>`, `<line>`) elements in total, no `stroke`, no gradients, no `<filter>`, `<mask>`, `<clipPath>`, `<image>` or `<text>`. Several sub-paths in one `<path>` count once, so eyes or ribs can share one element. Bosses, players, UI and effects are exempt.
- Inert files only (ADR 0011): no `<script>`, `on*` attributes, `<foreignObject>`, `<style>`, external `href`/`xlink:href`/`url()` (local `#fragment` references are fine), DOCTYPE or entities. SVG checks remain conditional on SVG entries; switching to PNG never removes them. Lottie permits inert shapes, validated same-owner images and the bounded actor precomposition profile; see the resource contract below.
- `stage.ground` is a 128×128 tile whose marks stay at least 8 units from every edge, so tiling shows no seams. Place tiles overlapping by 1 unit (scale `129/128`), as the gallery preview does: anti-aliased tile edges at fractional view scales otherwise show hairlines.
- Each category has a hue family, so things read at a glance:

| Category                                     | Colors                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Players (one per character)                  | warden `#e8b04a`, ember `#d9622b`, swift `#4ab0e8`; Aurelia white/gold; skin `#f4e9d8`, dark `#2b2b3a`; darker shades `#b8862f`, `#2f7fb0`                               |
| Enemies (desaturated purples, greens, greys) | `#7a5c99`, `#5c8a5a`, `#9aa0a6`, `#b8c4ff`, `#6b4a3a`, `#3d2f4f`; lighter shades `#7fa87c`, `#d6d9de`, `#e6ebff`, shadow `#4a3328`; the #3 bat keeps `#b88cff`/`#f5d9ff` |
| Bosses                                       | the enemy family darkened (`#2a1f38`, `#140f1c`), red accent `#c0392b`                                                                                                   |
| Player weapons                               | `#ffffff`, `#ffe066`, `#7fe3ff`, `#ff8a3d`; book covers `#3a6fd8`, `#6b3ad8`; evolutions are bigger, brighter versions of their base weapon                              |
| Gems                                         | `#3fa7ff` blue, `#3fd17a` green, `#ff4d5e` red, each with one lighter facet                                                                                              |
| Pickups (no coin or gold imagery)            | floor chicken `#e07a3d`, rosary `#f4f4f4`, orologion `#7fe3ff`, vacuum `#b07aff`, little clover `#3fd17a`, chest `#8a5a2b` with `#2b2b3a` bands                          |
| Interference pickups and `fx.warning`        | magenta-black hazard: `#ff2bd6` on `#1a1a1a`, so they never look like normal pickups                                                                                     |
| Stage                                        | muted greens `#2f4a2f`, `#3a5a37`, `#466b40`                                                                                                                             |
| Icons                                        | 32×32 on a rounded dark `#2b2b3a` tile, so they read on any background                                                                                                   |

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
6. Run `pnpm check` (it includes `packages/shared/src/assets-catalog.test.ts`) and verify `/?gallery` in a development/e2e build; press `O` to switch actor idle/move and replay one-shots, and `V` for the mass-art speed preview.

Final art replaces a file without game-code changes: preserve its logical size and anchor, update manifest file/format together when changing formats, validate the new bytes and set status to `final` after visual QA.

Missing drawable files show a magenta square with a dark diagonal and report their ID once. Missing catalog entries are grouped in one warning while art is still needed. The gallery skips fonts, labels every drawable ID, marks anchors with white crosses and pans with arrow keys.

The HP bar is an empty frame/neutral track at40×6 logical (160×24 physical); the worker draws the shrinking red fill in its38×4 logical inner rectangle. Never bake a red health value into this asset.

## Lottie resource contract

Keep `fx.levelUp` at 96×96, 30 fps, one second; keep `fx.chestOpen` at 128×128, 30 fps, 0.8 seconds. Both loop and use the existing native transform/opacity envelopes over generated abstract effect PNGs; this wrapper is repository integration, not an upstream animation export. Four-times PNGs use 25% base scale.

For `fx/level-up.json`, image resources must use `u=''`, `e=0`, and `p='level-up/art.png'`. No traversal, absolute/URL/data path, text, audio, expression or unsupported layer is admitted. Up to 64 images may use 32 MiB decoded data in total, within the per-image limits. Actor banks use12 two-times PNGs (four idle poses uniformly sampled from8 source poses and all8 move poses), at most1 MiB decoded for ordinary actors or4 MiB for bosses. Brazier uses one static flameless stand plus four genuine flame poses. Timelines must remain valid in native float arithmetic. Every PNG is fetched, decoded and cached before native load; callbacks resolve only the canonical key and the pinned engine's exact leading-slash alias. Instances retain independent playback and nearest-filtered child Pictures. Resolver errors are recorded, handled without allowing native fallback loading, then surfaced through the normal magenta fallback.

Static instances duplicate cached masters; animated instances own independent native controllers over cached JSON/PNG bytes. Actor idle/move markers retain their full cycles. All actor profiles allow one bounded image-only child and a declared native parent-opacity slot; nonplayers have no time remap, while only the player profile permits HOLD remapping (ADR 0019). Native enemy hit flash retains alpha140/255 and player feedback retains its exact100/255 phases. Suspend playback on release, pause and hidden scenes; hidden visibility alone does not prevent image preparation. Simulation owns world position, collision, aim, facing, area and event lifetimes. Flat effect clocks fit their existing combat lifetime once per lease; reuse restores the default rate. Axe/cross keep their initial aim and720deg/s spin through native playback without a second outer spin. Entity caps and worker/paint pooling remain unchanged.

Only `ui.splash` (ADR 0020, `EXTENDED_LOTTIE_IDS`) may also use root precomposition layers (`ty: 0`) over at most 8 flat precomposition assets (only `ty: 2` and `ty: 4` layers, each referenced by exactly one root layer, with no `p`, `u`, `e`, `w` or `h`), alpha track mattes (`td: 1`, `tt: 1`), at most 64 root plus precomposition layers, and `filter: "bilinear"` on its manifest entry, which its image Pictures use; masks, layer time remapping, expressions, text, audio, URLs and data URIs stay forbidden, and its image is a same-owner 8-bit RGBA PNG (`splash/logo.png`, 1080×1350). Its timeline is 1920×1080, 30 fps, frames 0–210 (7 seconds), non-looping, drawn at 2/3 scale into the 1280×720 view; every other Lottie keeps the rules above.

## Sources and licenses

The #3/#5 geometric placeholder pack is replaced through the pinned sprite-gen authoring workflow. [Recipes, access rules and commands](../docs/assets/README.md) document the confirmed ChatGPT subscription, explicit provider, source/export/processing hashes and visual approval receipts. New Aurelia IDs have no invented baseline hash. The tool's Apache-2.0 license covers sprite-gen, not a blanket license for generated artwork. No credentials or global account settings belong in receipts.

`font.hud` is the existing Noto Sans Mono Regular subset (9400 bytes), licensed under SIL OFL 1.1. Its manifest format is `ttf`; fonts have no drawable size or anchor and cannot be instantiated by AssetLibrary. The worker registers it as `hud`; a missing or invalid font, including a missing-file HTML response with status 200, warns once and uses ThorVG's built-in `default` font.

[fonts/LICENSE-NotoSansMono.txt](fonts/LICENSE-NotoSansMono.txt) records the upstream repository, pinned commit, source and subset SHA-256s, modifications and full license. Keep it beside the font. Preserve printable ASCII and the under-15-KB budget from ADR 0013. Rebuild only with `sh scripts/make-hud-font.sh`, using contributor tool fonttools 4.68.0; it is not a project dependency and does not run during builds.

The closed36-ID motion inventory follows [ADR 0019](../docs/adr/0019-render-all-actor-and-effect-motion-with-native-lottie.md). The exact current graph and retained source/review archive are recorded in `docs/assets/motion-84.receipt.json`; the #76 receipt remains historical evidence. #14 supplies gameplay selection and stats; this migration preserves them.

Powered by ThorVG animation (`ui.splash`), provided by the ThorVG project for this game (2026-11-09). Source: https://github.com/user-attachments/files/34418458/powred.by.thorvg.1.json (92 448 bytes, SHA-256 `c448bc4d6b62d9fc7f790a4b28ad4a4717e2c9a13f30d5ee31fda12bf346e509`). `sh scripts/make-splash.sh` converts its one embedded WebP image with libwebp `dwebp` 1.6.0 into `ui/splash/logo.png` (94 154 bytes, SHA-256 `0233d9febd4a64384b2c4b8703dd137798236ef85bbcd3777597638a1f757904`) and writes `ui/splash.json` (79 072 bytes, SHA-256 `15c4dda63fff855e6497b89dac10c3d29e85b8ae84ce23ff5ca783f956846f89`); nothing else in the animation changes. Its provenance is these hashes, outside `docs/assets/motion-84.receipt.json` (ADR 0020).

<!-- audio:begin -->

### Sound (ADR 0021)

The 17 sound effects (`sfx.*`) and 2 music loops (`music.*`) are original works authored for this game in `scripts/audio/sounds.json` and rendered with these tools; no recording, sample library or AI model is involved, and the music was written from scratch without quoting or paraphrasing any game's melody, bass line or chord progression. `music.stage` is a 145 BPM loop in D minor, `music.title` a 95 BPM loop in A minor.

- ZzFX 1.4.0 by Frank Force, MIT, Copyright (c) 2019 Frank Force: https://github.com/KilledByAPixel/ZzFX, downloaded from https://registry.npmjs.org/zzfx/-/zzfx-1.4.0.tgz, `package/ZzFX.js` SHA-256 `43f321101a935892c112a291e2e943b4da33159b43fcd4a21f3eae710f4a27ff`.
- ZzFXM 2.0.3 by Keith Clark and Frank Force, MIT: https://github.com/keithclark/ZzFXM, commit `cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe`, `zzfxm.js` SHA-256 `540904cd2574af403896bfa6fd552a7431461979e2002d44d16d21a34ea73115`.
- LAME 3.100 encodes the MP3s. None of the three tools ships with the game or is a project dependency.

Naming rule: `sfx.<name>` is `audio/sfx/<kebab-name>.mp3` and `music.<name>` is `audio/music/<kebab-name>.mp3`. Format: MPEG-1 Layer III, 44.1 kHz, mono, CBR 96 kbps with LAME's gapless header; the manifest entry records the decoded frame count as `samples`, and `loop` is true exactly for music. Budgets: each sound effect at most 2.0 s and 32 KiB, each music loop at most 70 s and 840 KiB, all audio at most 2 MiB. A music loop is the steady-state middle pass of three renders, so it repeats seamlessly on whole rows.

Change a sound by editing its numbers in `scripts/audio/sounds.json` and running `sh scripts/make-audio.sh` (contributor tools: curl, Node 24, LAME 3.100); it rewrites the MP3s and `docs/assets/audio.receipt.json`. `sh scripts/make-audio.sh --check` proves the committed files are exactly what the committed parameters render. These lines sit between audio markers, which the #117 motion receipt skips (ADR 0021); keep everything about audio inside them.

<!-- audio:end -->
