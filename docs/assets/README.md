# Sprite rebuild recipes

Issue #76 replaces all 81 audited drawable placeholders with original polished 2D fantasy illustrations with the user-requested moderate pixel feel, and adds the original female paladin Aurelia plus her matching portrait. `rebuild-76.json` preserves the complete original 82-ID baseline (81 regeneration targets and the unchanged OFL HUD font), then declares two new Aurelia targets: 84 final IDs and 83 drawables. New targets use action `generate` and have no invented original file or hash. Logical sizes, anchors, semantic roles and palettes remain catalog contracts. The final visual roster has two men (Warden, Ember) and two women (Swift, Aurelia). Swift retains the existing blue-hooded knife-scout IDs, size, anchors and blue-gray-charcoal clothing palette; her fair-skinned, silver-bob beautiful adult female elf source and matching portrait supersede the earlier male illustrations. This artwork revision does not change gameplay stats or character availability.

## Tool and access

The renderer uses no new package dependency. Offline authoring uses [sprite-gen](https://github.com/aldegad/sprite-gen) 4.3.0 pinned to `35a27e137bfd72440cc856b080913c66f69c772e`, Python 3.13, Pillow 12.3.0 and NumPy 2.5.4, isolated under ignored `verification/`. Upstream Apache-2.0 [LICENSE](third-party/sprite-gen/LICENSE) and [NOTICE](third-party/sprite-gen/NOTICE) are retained. Generated illustrations are task outputs; the tool license is attribution for the authoring software.

The user confirmed ChatGPT image access and the illustrated style, then requested a slightly more pixel-like finish. The approved final revision uses 2 physical pixels per block and at most 64 visible colors. Every generation explicitly uses `codex`, checks `codex login status`, and requires `--confirmed-subscription`. Preferences stay inside the run directory; unavailable access stops the command. Request login/subscription assistance before continuing. Never switch to API billing, another provider, or global preferences.

```sh
python3 scripts/assets/rebuild_sprite_gen.py plan
python3 scripts/assets/rebuild_sprite_gen.py bootstrap --tool-root verification/issue-76/tool/sprite-gen
python3 -m unittest discover -s scripts/assets -p '*_test.py'
```

## Generate and export

Run commands from the repository root. The accepted Warden pilot is the actual style reference. Matching portraits reference accepted players; inventory icons reference their weapon boards. The recipe records 23 world jobs (including the reused Warden pilot) and eight independent item boards. Cells map to target IDs in reading order. Tracked prompt files preserve specialized requests; other prompts are built from each target description.

```sh
python3 scripts/assets/rebuild_sprite_gen.py run --tool-root verification/issue-76/tool/sprite-gen --run-dir verification/issue-76/generation/items --job icons-weapons-base --style-ref verification/issue-76/generation/pilot/warden.png --ref verification/issue-76/generation/items/weapons-base/board.png --confirmed-subscription
python3 scripts/assets/rebuild_sprite_gen.py export --tool-root verification/issue-76/tool/sprite-gen --run-dir verification/issue-76/generation/world --job player-warden-pilot --image verification/issue-76/generation/pilot/warden.png --report verification/issue-76/generation/pilot/warden.report.json
```

Generation is nondeterministic. Replays reproduce prompts and upstream export geometry; completed jobs resume only when request and output hashes match. Use a fresh run directory for changed requests or rejected artwork. Source generation reports and rejected attempts stay in ignored evidence.

All image transformations use unmodified upstream operations: `slice-sheet` for independent cells and normalized canvases, `background-tile` for seamless ground, then the pinned engine primitives for painted-source pixel refinement. PNGs are exactly 4× logical dimensions, at most 2048 per axis, noninterlaced 8-bit RGBA, and metadata-free apart from allowed color/physical hints. Export rejects clipped or empty cells. The disconnected three-knife projectile uses upstream `fit_to_cell` on the complete union bbox with centered containment, avoiding the standing-subject baseline that otherwise shrinks its secondary blades. Alpha floor 64 removes native generation haze during normalization; effects retain their recipe-specific normalization floor. The final refinement makes alpha binary, with ground fully opaque. No placeholder copying, manual repainting, custom crop, resize or matte fallback is used.

The final pixel route is **painted-source refinement**, not automatic Backbone lattice extraction. Painted images can trigger confident false pitch detections, collapsing otherwise valid artwork; rejected automatic attempts remain in evidence. `refine_painted.py`, run by the pinned tool virtualenv, calls `conform_row_logical` with the normalized subject bbox divided by two, `binarize_alpha`, `build_shared_palette`/`apply_palette`, `fit_pixel_unfake` for integer NEAREST enlargement, and `apply_transform` for nearest placement on the fixed cell grid. These are the upstream implementations; the repository does not implement image resizing or quantization. Reports record `inputLattice: null`, the actual API operation list, script hash and direct PNG serialization. No smooth resampling follows this stage. Intentional magenta is preserved because this route performs no chroma removal.

Every candidate includes a read-only `final-proof.json`: physical size, alpha values, visible color count, exact 2×2 grid uniformity and phase, source/final bounding boxes, occupied pixels and source-relative occupancy. Export rejects missing content, more than 64 colors, grid drift, or severe occupancy/bbox collapse. The catalog anchor stays unchanged; alignment rounds the visual baseline to the nearest pixel block. Inspect final ground in a 2×2 repeat after refinement.

## Review and receipt

Visually inspect every cell on dark and light backgrounds, including tiny-size silhouettes, identity, alpha edges, baseline, and glyph-free details. Approval is explicit and binds the reviewed bytes:

```sh
python3 scripts/assets/rebuild_sprite_gen.py approve --candidate-receipt verification/issue-76/generation/items/weapons-base/candidates.json --notes 'Record the actual visual checks and reviewer.'
python3 scripts/assets/rebuild_sprite_gen.py receipt --run-dir verification/issue-76/generation/world --run-dir verification/issue-76/generation/items --run-dir verification/issue-76/generation/items-pixel --out docs/assets/rebuild-76.receipt.json --require-approved --final-assets
```

Processing schema 2 requires canonical named evidence for the normalized painted input, exact exporter request and script, upstream operation report, palette lock and final pixel proof. Route, block size, palette budget, engine pin and output hash must match the recipe. Receipt validation reopens the actual candidate PNG and remeasures its grid, palette, alpha, dimensions and geometry; a hashed empty file list or fabricated proof is rejected. Swift prompt digests bind the final elf identity request to its replay recipe.

The final receipt requires exact 83-target coverage (81 regenerated, two newly generated) plus the preserved font, verified source/report/reference hashes, dimensions, unchanged anchors and installed bytes. Committed provenance uses repository-relative paths; raw provider reports remain ignored. Two effect PNGs become resources of native Lottie transform/opacity envelopes in repository integration, preserving durations, fps and loop contracts. This is not an upstream sprite-animation export. `--final-assets` additionally records a separate installed integration section for all 90 physical files (84 manifest primaries, two generated FX PNG resources, four support files), including actual native JSON byte hashes, owning image links, preserved timeline spans and keyframes. Format tracked JSON before capturing these hashes. Final acceptance includes ThorVG gallery, independent native effect instances, loading/cache/pool behavior and mass-scene verification described by the issue and ADR.

The HP track follows main PR #79: its40×6logical artwork is empty neutral dark, while the native HUD draws the red38×4fill at(1,1). Its generated complete frame uses upstream `tighten_components` and `resize_cell` to map the full160×24canvas, then a full-rectangle80×12logical pixel grid and integer2×export. The inner152×16area at(4,4) stays opaque neutral dark, with no baked red or filled-looking highlight. Dedicated proof checks full bounds, opaque inner coverage and tone. The latest-main SVG/HUD hashes are compatibility references; the original82asset baseline hashes remain historical.

## Static DOM icons from native effects

Use `loadAssetUrls` for DOM images. The interference banner reuses `fx.warning` as a static icon through its eagerly validated, same-owner PNG poster, cached as a data URL under the existing CSP. The manifest primary and canvas animation remain native Lottie. JSON dimensions/profile, single-image ownership, redirects, byte budgets, PNG framing and actual decode are checked before publication to the DOM caller; failure omits the poster without breaking static icons. Do not pass a Lottie JSON URL to `<img>` or initialize ThorVG in the main thread.
