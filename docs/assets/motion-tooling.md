# Motion asset tooling

`motion-84.json` declares the closed 36-motion-ID scope and all 85 logical IDs. The original shape-only `enemy.lottieTest` from #120 has a separate diagnostic role and its exact upstream Git blob is preserved. Publication remains gated until every genuine source bank passes independent visual and temporal review. Diagnostic reused stills prove runtime mechanics and capacity only.

## Restore approved masters

The recipe records the exact Git commit, blob ID and SHA-256 of every pre-motion master. These records survive removal of PNG primaries from the public asset graph and cleanup of ignored worktrees.

```sh
python3 scripts/assets/motion_inventory.py plan
python3 scripts/assets/motion_inventory.py restore-masters \
  --out verification/issue-84/restored-masters
```

Restoration verifies both Git blob and SHA-256, rejects symlinked output roots, ancestors and targets, checks each resolved target stays inside the chosen output directory before creating or writing it, and refuses to overwrite a different existing file. The issue 76 receipt stays immutable historical evidence; its old physical file count is not a current runtime constraint.

## Bootstrap the pinned tool

From the repository root, install the reviewed upstream commit and pinned dependencies into this issue’s ignored directory. The existing bootstrap reads `docs/assets/rebuild-76.json`, which pins the same upstream revision as the motion recipe; it does not regenerate historical art.

```sh
TOOL="$PWD/verification/issue-84/tool/sprite-gen"
python3 scripts/assets/rebuild_sprite_gen.py bootstrap --tool-root "$TOOL"
PYEXE="$TOOL/.venv/bin/python"
```

The following commands use that interpreter for Pillow, NumPy and upstream APIs. An old issue76 worktree is not required. Inventory planning and Git restoration above use only the Python standard library.

## Refine a genuine actor bank

Use the pinned sprite-gen checkout recorded in the recipe. Source runs must contain actual Codex subscription reports, original raw rows, the request and successful canonical component extraction. Accepted copied rows retain their original report and provider output paths; the selected copy must have identical bytes.

```sh
"$PYEXE" scripts/assets/motion_source.py --id player.swift \
  --run-dir verification/issue-84/generation/swift-004 \
  --out verification/issue-84/generation/swift-004/shared-bank-new \
  --tool-root "$TOOL"
```

Always use a fresh output directory. This command generates no images remotely. It reconstructs raw connected components and replays unmodified upstream `fit_row_to_cells` with exactly one uniform factor per complete source state. All16 replayed RGBA images must match the actual canonical decoded pixels exactly; arbitrary canonical PNGs or hand-written factors are rejected. It then refines all16 calibrated poses with one final bank scale, one64-color palette and binary alpha. No individual pose is fitted independently.

For `grounded:false`, `motion_refine_flying.py` replays the same official calibration as evidence but preserves raw component coordinates instead of consuming centered poses. It observes the actual unmodified upstream component groups, records their exact mask indices/count/hash, raw bbox and padded origin, and applies one state affine: `cellPoint = cellCenter + stateFactor * (rawPoint - [slotCenter, rowMidline])`. The declared slot origin is position metadata, never a raster cut. One full-cell kCentroid scale, binary alpha and shared64-color palette follow across all16 poses. There is no individual bbox centering, bottom alignment, registration or eye-based correction. Actual source hover and wing articulation survive. Validation replays mask selection, coordinate mapping, mapped cells and every final pixel; fabricated masks, coordinates, factors and per-pose offsets reject.

Grounded authoring remains isolated in its original module. Flying uses the separate `flyingExport` contract, so its recipe and script changes do not invalidate the unchanged grounded Swift bank or silently reuse reviews for changed banks.

The receipt retains original raw dimensions and magnification measurements, both state factors, canonical hashes, extraction warnings and final motion metrics separately. Raw-global failed banks remain immutable evidence; row calibration does not turn their source magnification result into an anatomy pass. Final head/torso scale, baseline, identity and temporal continuity still require independent visual review. Source and native idle/move cycles must each meet the unchanged upstream `motion_presence >= 0.01` gate; source warnings require acknowledgment in both reviews.

Both source strips use eight columns: idle8@4fps spans two seconds, and move8@12fps spans two-thirds of a second. After all16 poses are refined, fixed idle indices `[0,2,4,6]` become native4@2fps; all eight move poses remain native8@12fps. This preserves each state’s duration and full-cycle sample times. Odd idle frames remain in `source-poses/` for complete source QA and provenance, outside the public runtime graph. Each native PNG must match its predetermined source PNG byte for byte.

`motion_bank_proof.validate_bank` checks source reports and references, both source-loop flags, the exact request-derived upstream generation plan and layout guides, the explicitly curated idle-anchor selection and its current upstream bake, approved master identity, mandatory paths and hashes, actual decoded pixels, and deterministic replay of both official row calibration and final bank pixels. Hash lists alone cannot establish derivation. The publication validator rechecks the supplied tool checkout’s actual Git HEAD and tracked-source cleanliness against the recipe pin before ancestry, inspection or replay, and uses the verified interpreter. A matching declaration alone is insufficient.

Publication additionally requires two distinct canonical reviewer IDs (lowercase ASCII hyphen tokens, such as `root-independent`) bound to the exact immutable bank; all eight source idle poses, all eight source move poses, and both resulting native cycles must pass. Review coverage explicitly records source8+8/native4+8; discarded source frames cannot be skipped during QA. Provenance acceptance never implies gait acceptance.

## Inspect the installed resource graph

```sh
nvm use
node --import tsx scripts/assets/motion_graph.ts assets > verification/issue-84/current-graph.json
```

The graph uses the real manifest, profile-aware Lottie validator and PNG parser. It records hashes and owning IDs for every primary, same-owner image and support file, and rejects orphan, missing, shared-owner or symlinked files. Physical counts follow actual validated resources rather than a fixed historical number.

## Verify tooling

```sh
"$PYEXE" -m unittest discover -s scripts/assets -p test_motion_tooling.py
MOTION_TOOL_ROOT="$TOOL" \
MOTION_TEST_BANK=verification/issue-84/generation/swift-004/shared-bank-canonical-row-003/bank.json \
  "$PYEXE" -m unittest discover -s scripts/assets -p test_motion_tooling.py
"$PYEXE" -m unittest discover -s scripts/assets -p test_motion_refinement.py
pnpm --filter shared exec vitest run src/assets-catalog.test.ts src/asset-images.test.ts src/motion-graph.test.ts
```

The flying causal suite runs with `MOTION_TEST_FLYING_BANK=verification/issue-84/generation/bat-002/shared-bank-raw-coordinate-002/bank.json MOTION_TOOL_ROOT="$TOOL" "$PYEXE" -m unittest discover -s scripts/assets -p test_motion_flying.py`. A synthetic stable head with changing wing extent reproduces the old bottom-registration jump and verifies that raw-coordinate mapping preserves its position. Genuine-bank attacks reject forged masks, bboxes, origins, offsets, registration and missing authoring foundations.

The synthetic API test proves that an unsampled idle pose still determines the common geometry and palette, and every native pose preserves fixed ancestry. Synthetic rectangles are test data only.

The optional `test_motion_publication.py` suite uses the same `MOTION_TEST_BANK` and `MOTION_TOOL_ROOT` variables. It verifies actual approved-bank and byte-identical-copy controls, rejects forged tool declarations, and uses explicitly synthetic review-schema fixtures to reject blank, padded, case-variant, duplicate or wrong-bank identities. It never writes real art approvals.

The optional genuine-bank suite exercises a real valid replay control and rejects missing poses, substituted source rows, custom operations, individual fitting, forged hashes, palettes, scales and continuity claims. Its source files remain unchanged. Ancestry controls can run independently of visual approval: `MOTION_TEST_SOURCE=verification/issue-84/generation/swift-004 "$PYEXE" -m unittest discover -s scripts/assets -p test_motion_source_integrity.py` verifies the genuine run and byte-identical adoption, rejects missing/substituted anchors, incorrect guides and non-looping sources, and tests real Git restoration against symlink attacks. Valid derivation of a rejected candidate does not grant source-quality approval.

New hit and enemy-death one-shots reach opacity zero at `op - 1`, the actual frame held by `NativePlayback`, while retaining their declared frame rate and duration. The existing level-up and chest-open envelopes stay unchanged.

## Boss footprint and stage sources

Bosses use a separate `bossExport` module. After official state calibration, one bounded camera transform applies to **all16** mapped source cells before final kCentroid refinement. Its neutral footprint targets the exact restored master at2× resolution; the full16-pose union and a two-stage-pixel margin cap magnification. Scythe tips and odd idle poses participate in the bounds. Validation recomputes the master footprint, camera factor/translation, intermediate cells and final pixels. Ordinary flying and grounded processors remain unchanged.

Stage authoring has its own five-source contract: one genuinely generated flameless stand and one genuine four-pose flame-only effect row at6fps. Preview the stand, inspect its actual bowl, and freeze the reviewed geometry before attaching fire:

```sh
"$PYEXE" scripts/assets/motion_stage.py stand-preview --tool-root "$TOOL" \
  --run-dir verification/issue-84/generation/enemies-stage/stage-001 \
  --out verification/issue-84/stage-stand-preview-new
"$PYEXE" scripts/assets/motion_stage.py export --tool-root "$TOOL" \
  --run-dir verification/issue-84/generation/enemies-stage/stage-001 \
  --geometry verification/issue-84/generation/enemies-stage/stage-001/stage-geometry.json \
  --out verification/issue-84/stage-bank-new
"$PYEXE" scripts/assets/motion_stage.py validate --tool-root "$TOOL" \
  --bank verification/issue-84/generation/enemies-stage/stage-001/bank-003/stage-bank.json \
  --require-approval
```

The single still uses its binary opaque ROI, one uniform fit and foot registration. All four flames use one row factor and one fixed reviewed bowl registration. All five share a palette; hardware appears once as a static native layer. Registered whole-row palette decontamination is recorded separately from the immutable original request/canonical cache. Every source, geometry, operation and pixel is replayed; two bound source/composition reviews remain mandatory.

## Stage and review a complete pack

Maintain a source map with exactly13 actor bank paths and one stage bank path. Missing, held, superseded or unapproved banks hard-fail before copying; diagnostic stills cannot fill gaps.

```sh
python3 scripts/assets/motion_publish.py plan \
  --sources verification/issue-84/publication/chosen-sources.json
"$PYEXE" scripts/assets/motion_publish.py build --tool-root "$TOOL" \
  --sources verification/issue-84/publication/chosen-sources.json \
  --out verification/issue-84/publication/staged-new
"$PYEXE" scripts/assets/motion_publish.py verify --tool-root "$TOOL" \
  --staged verification/issue-84/publication/staged-new
```

Build writes only a fresh ignored staging copy. It validates every actual source bank and review, derives20 resources from exact Git masters through upstream nearest2× scaling, preserves the original two effects and47 static PNGs/font, formats JSON before hashing, and records the allowlisted diff and dynamic ownership graph. Rotating weapons use one constant native scale from opaque pixel-corner radius; PNG bytes and timelines remain unchanged. The actual native all-angle probe is reproducible with `node --import tsx scripts/assets/motion_publish_rotation_probe.mjs <proof-directory>` after preparing its `derived.json` and `assets/` through `motion_publish_images.py --emit-json`.

Preflight and receipt validation require the **actual** runtime directory. Each reviewed actor/stage native JSON must match the full factory AST, including ordered image paths, layer references and timing; rehashing a reordered wrapper cannot satisfy approval. Native owned PNG hashes must match the exact reviewed native pose bank. All14 portable source proofs, immutable original review bytes, complete retained source poses and their ancestry are mandatory; archive orphans and symlinks reject.

After root reviews the staged pack and explicitly installs those exact files, `motion_publish.py seal-installed --tool-root "$TOOL" --staged <staging-directory>` verifies the real installed graph again and writes the current receipt/source archive. It performs no asset installation. The historical issue76 receipt remains unchanged. Retained16-pose actor evidence (including odd idle frames), stage5 and original review summaries survive fresh clones outside `assets/`; full upstream replay still requires the exact ignored raw inputs/reports/references identified in those proofs. Git master restoration alone does not reproduce remote image generations.

Additional checks: `test_motion_boss.py` uses optional `MOTION_TEST_BOSS_BANK`; `test_motion_stage.py` uses `MOTION_TEST_STAGE`; both use `MOTION_TOOL_ROOT`. `test_motion_publish.py` uses the genuine Swift bank variables above. `test_motion_native_binding.py` exercises real archived actor/stage controls and rehashed path/reference/timing attacks when their input cache is present. With Node24 active, `python3 -m unittest discover -s scripts/assets -p test_motion_factory.py` checks all36 actual emitted wrappers with the shared runtime parser.

Wraith has one closed later art-direction exception: the user selected an intentional grounded undead drag after viewing the exact earlier preview. Both new reviews bind `locomotionStyle: grounded-undead-drag` and the committed decision’s exact path/hash. The portable proof embeds its original UTF8 bytes. Original generation prompts and earlier failed alternation reviews remain unchanged; this decision does not relax any other actor’s gait, source, sampling or pixel gates.

## ADR numbering in immutable evidence

The unmerged native-motion decision was authored as ADR0017 and renumbered to ADR0018 after the accepted deployment decision took0017. The accepted opponent-stream decision then took ADR0018, so current documentation and publication metadata point to ADR0019. Original source requests, reviews and portable proof UTF8 remain immutable, including historical references to the then-unmerged native0017; do not rewrite their bytes or hashes.
