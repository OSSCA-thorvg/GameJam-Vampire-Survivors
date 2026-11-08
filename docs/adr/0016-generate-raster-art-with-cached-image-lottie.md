# 0016. Generate raster art and preload image-backed Lottie resources

- Status: Superseded in part by [0019](0019-render-all-actor-and-effect-motion-with-native-lottie.md) (motion inventory and animated-instance lifecycle; approved artwork and provenance retained)
- Date: 2026-11-08
- Related issues: #76; partially supersedes ADR 0007's vector-first art direction and ADR 0008's art roster scope

## Context

- REQUIREMENTS 10 and 12 keep ThorVG WebGL rendering in the dedicated worker; REQUIREMENTS 11 keeps art replaceable behind logical manifest IDs.
- User decision, 2026-11-08: rebuild every dummy drawable with `aldegad/sprite-gen`, preserving the existing fantasy identities, logical dimensions and anchors. The user then requested a stronger pixel-art finish. Generation follows the latest approved issue brief; it does not replace gameplay or the licensed HUD font.
- The baseline has 82 IDs: 79 static SVGs, two animated Lotties and one final licensed font. Exporting an atlas as one Picture or flattening the effects would violate their existing rendering/playback contract.
- A real WebGL-worker probe on pinned ThorVG 1.1.3 resolved a preloaded diagnostic PNG before native Lottie load. Two animations retained independent frames and stable Paints with no post-load fetch. The native callback prepends `/` to an authored `u=''` image source; the official resolver can serve the exact cached alias.

## Decision

- Partially supersede ADR 0007's vector preference with a generated PNG illustration pipeline. Its logical-ID indirection, replaceability, original-source/provenance requirement and entity caps remain: 400 enemies, 600 projectiles and 400 gems. ADRs 0003/0004 keep cached masters, pools, worker ownership and one update/render per frame. Keep conditional inert-SVG and mass-vector complexity checks for any SVG entry retained or added later.
- Pin sprite-gen 4.3.0 at `35a27e137bfd72440cc856b080913c66f69c772e` in an isolated tool environment. Use the user's confirmed ChatGPT subscription through the explicit `codex` provider. Login/quota failures require user input; no automatic billed-provider/account switch or global preference rewrite.
- Regenerate all 81 baseline drawables and add `player.aurelia` (48×48, feet anchor `[0.5, 0.9]`) and `portrait.aurelia` (128×128, centered anchor). The user explicitly requested an adult female white-and-gold paladin carrying the existing cross, while preserving Warden and Ember as male characters; the user subsequently requested a beautiful adult female elf Swift with visible pointed ears, pale ivory face/ears/neck/hands, silver hair and the existing blue-clothed knife role/palette. The final artwork roster is two male and two female characters, with existing Swift IDs, logical dimensions and anchors unchanged. This narrowly extends ADR 0008's three-character art scope: selection, character data and stats remain future #14 work, with no invented gameplay values. The final catalog has 84 IDs: 81 static PNGs, two Lotties and one font. New artwork has no baseline source hash.
- Preserve `font.hud`, its 9400-byte binary SHA-256 `dc8bbbd58c5b5404ec1eb392b6aedeb81904869b1009ec9b1ba056e4cb310dd0` and OFL provenance. Record every baseline ID, job, provider/prompt, raw/export hashes and auxiliary file in a committed exact-set receipt. Only mark artwork final after complete visual QA.
- Static art is noninterlaced 8-bit RGBA PNG at four times catalog dimensions. Manifest dimensions/anchors remain logical. Static entries use explicit nearest filtering; the Lottie resolver applies nearest filtering to each cached image Picture, retaining the requested pixel grid. Preserve the existing kebab-case naming rule and make Icons' Format column explicit. Actual decoding, PNG framing/CRC, alpha and resource budgets are checked; an encoded image and decoded RGBA image each stay within 16 MiB and either axis within 2048.
- Preserve `fx.levelUp` as 96×96, 30 fps, frames 0–30 (1 second), looping; preserve `fx.chestOpen` as 128×128, 30 fps, frames 0–24 (0.8 seconds), looping. One newly generated abstract effect image may serve the existing native transform/opacity layer envelopes (one layer for level-up, two for chest-open). Four-times image pixels use the corresponding 25% base scale. This native Lottie wrapper is repository integration of generated still art, not an upstream animation-pipeline export.
- Lottie accepts only inert shape layers and declared same-owner PNG image layers. For owner `fx/level-up.json`, image assets use `u=''`, `e=0` and canonical paths such as `level-up/art.png`. No absolute path, traversal, query/fragment, URL/data URI, text/audio, expression, precomposition or unsupported layer. IDs/paths are unique and every resource is referenced. Bound each effect to 64 resources, each image to 2048-axis/16 MiB decoded, and aggregate decoded image data to 32 MiB. JSON and nesting/layer counts are bounded before native load. Timeline values and their interval/duration must remain finite and positive where required after native float conversion; native metadata is independently checked for finite values.
- Fetch and validate every declared PNG once in the worker before native load, including actual browser image decoding. Close temporary decode bitmaps. Cache validated bytes with the master; every animation instance keeps its own Lottie state and resolver, preserving `AssetInstance.lottie`, `library.tick` and gallery frame observation. The only resolver keys are authored canonical `p` and the pinned engine's exact `'/'+p` alias.
- The resolver always returns true, even when it records a failure. Throw that failure after native load and use the existing asset fallback path. Throwing from the callback itself is unsafe: the pinned wrapper catches it and returns false, permitting native fallback loading. No unknown source can trigger that fallback.
- Resources remain same-origin and byte-backed; no CSP origin is added. Generated source/output provenance is retained without credentials. Sprite-gen's Apache license applies to its tool; do not mislabel that as a blanket license grant for generated artwork.

- Preserve the HUD HP contract introduced by #9: `ui.hpBar` is an empty dark track/frame; the worker supplies the shrinking red fill. The one revised PNG is separately regenerated and approved, with all other82 artwork PNG hashes retained.
- The user subsequently requested native idle/walk and all visual movement. Follow-up #84 owns the closed36-ID animation migration after #76; this artwork stage preserves its approved sources and implements no new locomotion or gameplay.

## Alternatives considered

- Keep rough SVG dummy art: does not meet the user's replacement request or revised visual direction.
- Flatten animated effects to PNG: loses their visible motion and breaks the native playback API.
- Introduce atlas cropping or a second playback format: requires a larger rendering/API change and is unnecessary for two effects.
- Embed unrestricted data URLs or allow native external resolution: weakens source ownership and resource validation.
- Treat one generated still as an upstream animation export: misstates which stage produced the motion.

## Consequences

- Higher-resolution textures increase loading/cache memory. Measure the final pack in the gallery/stress scene and retain the existing performance follow-up; do not raise caps from a high-end-machine result.
- Generation receipts and auxiliary-file ownership become part of exact catalog coverage. Regeneration uses existing upstream extraction/export/QA stages; rejected art is regenerated rather than silently reusing a dummy.
- Native animation instances re-decode cached bytes during creation; they perform no fetch, JSON/resource discovery or Paint creation per rendered frame.
- A ThorVG upgrade must re-prove callback aliases, fail-closed handling, independent animation and no post-load fetch. New image formats, resource types or larger budgets require revisiting this decision.
