# 0020. Admit precompositions, alpha track mattes and bilinear images in validated Lottie, for `ui.splash` only

- Status: Accepted
- Date: 2026-11-09
- Related issues: #126; partially supersedes ADR 0016's Lottie resource contract, and narrows how ADR 0019's sealed motion receipt binds the asset graph

## Context

- REQUIREMENTS 10 and 12 keep ThorVG WebGL rendering in the worker; REQUIREMENTS 11 keeps art behind logical manifest IDs.
- User decisions, 2026-11-09 (#126): the game opens with the 7-second "Powered by ThorVG" Lottie animation (1920×1080, 30 fps, frames 0–210), provided by the ThorVG project for this game. It always plays to its end, and loading continues behind it. The animation is not re-exported, flattened or edited.
- The supplied file (SHA-256 `c448bc4d…f346e509`, Lottie 5.7.0) uses a root precomposition layer (`ty: 0`) over one precomposition of 8 layers, two alpha track mattes (`td: 1` on `Rectangle 1`, `tt: 1` on the precomposition and on `Shape Layer 1`, whose source is the precomposition), trim paths, merge paths, and one embedded lossy WebP image with alpha (`data:image/webp;base64`, 1080×1350, a smooth gradient bolt).
- ADR 0016's contract rejects all of these: data URIs, `e: 1` embedded images, precomposition assets, `ty: 0` layers and `tt` layers. Its resolver forces nearest filtering, which bands the gradient bolt. ADR 0016 says new formats or resource types require revisiting the decision.
- ADR 0019 (#117) admits one bounded actor precomposition per actor profile. It seals the exact asset graph in `docs/assets/motion-84.receipt.json`: every file's SHA-256 (including `assets/README.md`, `CATALOG.md` and `manifest.json`) and the 85 logical IDs. `motion-graph.test.ts` checks this graph with `scripts/assets/motion_verify_installed.py` in `pnpm test`. Re-sealing the receipt needs #117's pinned generator and private evidence. Measured on 2026-11-09: appending one line to `assets/README.md` makes the verifier fail. So no asset can be added after #117 without a rule for it.
- User decision, 2026-11-09: give `ui.splash` its own graph role outside the sealed receipt; keep every other ID, file and role bound to the receipt exactly as before; do not hand-edit the receipt or its recipe.

## Decision

- **Scope:** the exported list `EXTENDED_LOTTIE_IDS = ['ui.splash']` (`packages/shared/src/lottie-motion.ts`). `lottieProfile('ui.splash')` returns the new profile `'splash'`, and only this ID can get it. Every other Lottie keeps ADR 0016's rules, or ADR 0019's actor profiles, unchanged. Admitting another ID needs a new ADR.
- **Validator** (`validateLottie(value, ownerFile, profile)`, `packages/shared/src/lottie.ts`), splash profile only:
  - root layers may be `ty: 0` precomposition layers;
  - each references a precomposition asset (`id` matching `^[\w-]{1,64}$`, unique among all asset IDs, `layers` an array, none of `p`, `u`, `e`, `w`, `h`);
  - a precomposition holds only `ty: 2` and `ty: 4` layers, so there is no nesting;
  - each precomposition is referenced by exactly one root layer;
  - there are at most 8 precompositions (`MAX_LOTTIE_PRECOMPS`) and at most 64 root plus precomposition layers (`MAX_LOTTIE_LAYERS`);
  - a `ty: 0` layer has integer `w`/`h` up to 2048 and no `shapes`;
  - `tt` and `td` are admitted only with the value 1 (alpha matte).
- **Still forbidden for every profile:** masks (`masksProperties`), layer time remapping (`tm`, except ADR 0019's player parent), expressions, text, audio, URLs and data URIs. Image resources stay same-owner, noninterlaced 8-bit RGBA PNGs, fetched, decoded and cached before native load, behind ADR 0016's resolver.
- **The image:** `scripts/make-splash.sh` converts the source's embedded WebP into `assets/ui/splash/logo.png` with libwebp `dwebp` 1.6.0, and points the image asset at it (`u: ''`, `p: 'splash/logo.png'`, `e: 0`). Nothing else in the animation changes, and re-running the script gives byte-identical files.
- **Filtering:** the manifest accepts `filter: "bilinear"` on a Lottie entry only for an ID in `EXTENDED_LOTTIE_IDS`. `createCachedLottie(TVG, source, onResolve, filter)` applies the entry's filter to the image Pictures. Every other Lottie stays `nearest`.
- **Asset graph:** `scripts/assets/motion_graph.ts` gives the `ui.splash` primary and its PNG the graph role `splash` (`splashIds`). `receiptGraph(graph, directory)` is what `motion_verify_installed.py` compares with the sealed receipt:
  - it drops the `splash` files and `ui.splash` from `logicalIds`;
  - it hashes the support files after `stripSplash` removes only the lines naming `` `ui.splash` `` or `"ui.splash"`, the blank line of a paragraph of its own, and the ID's entry block in `manifest.json`;
  - any other new ID, file or changed line still fails the verifier (tests in `motion-graph.test.ts`).
- **Splash provenance:** the source URL and SHA-256 and both output SHA-256s, recorded in `scripts/make-splash.sh` and `assets/README.md`.

## Alternatives considered

- **Embedded WebP data URI** — rejected: a second image format, and bytes that bypass ADR 0016's fetch, decode and size validation.
- **Flatten the animation by hand** — rejected: it changes a user-supplied animation (user decision, 2026-11-09).
- **Re-seal or hand-edit `motion-84.receipt.json`** — rejected: re-sealing needs #117's private evidence, and a hand edit breaks the receipt's meaning.
- **Admit precompositions and mattes for every flat Lottie** — rejected: no other asset needs them, so the attack surface would grow for nothing.

## Consequences

- `ui.splash` renders through ThorVG with its mattes, merge paths and trim paths; #126 compared it with an independent renderer.
- The splash keeps one 1080×1350 texture after boot; disposing it is out of scope.
- `stripSplash` has a known blind spot: a line that names `ui.splash` is not hash-checked by the receipt, so a reviewer must make sure such lines only describe the splash.
- #117's publication pipeline (`motion_publish.py`, `motion_publish_graph.ts`) builds staged packs without `ui.splash`. It must learn the `splash` role before it can publish again.
- Revisit if ThorVG changes its matte semantics for a `tt` layer without a `td` source, if another asset needs precompositions or mattes, or if the motion receipt is re-sealed (it could then include the splash).
