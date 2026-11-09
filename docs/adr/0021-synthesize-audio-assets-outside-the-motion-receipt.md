# 0021. Synthesize audio assets and keep them outside the #117 receipt

- Status: Accepted
- Date: 2026-11-09
- Related issues: #128; relates to ADRs 0007, 0011, 0019 and 0020, and supersedes none

## Context

- REQUIREMENTS 11 keeps every asset behind a logical manifest ID (ADR 0007), so sound must be replaceable by swapping a file, like art.
- User request, 2026-11-09 (#128): add sound effects and music from copyright-free sources, make good use of open-source projects, and prefer tools that let an AI, ideally Claude Code itself, create the sounds.
- User decisions, 2026-11-09 (#128): the music is original ZzFXM gothic chiptune written by Claude, with no AI model and no library music; there is no splash sound; listening is not a merge gate. Comment of 2026-11-09: the stage loop is a driving gothic action track at 140–150 BPM in D minor, the title loop slower and darker at about 90–100 BPM in A minor, and no melody, bass line or chord progression may be reused, quoted or paraphrased from Vampire Survivors, Castlevania or any other game.
- ZzFX (Frank Force, MIT, npm `zzfx@1.4.0`, 0 dependencies) describes a sound as up to 21 numbers; ZzFXM (Keith Clark and Frank Force, MIT, v2.0.3, commit `cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe`, not on npm) renders MOD-like songs whose instruments are ZzFX sounds. Both render in Node once `AudioContext` is stubbed, and give byte-identical samples for a seeded `Math.random`.
- Measured 2026-11-09 under Playwright 1.64.1: headless Chromium, Firefox and WebKit all decode a LAME 3.100 MP3 to exactly the source WAV's frame count, so a buffer loop with `loopEnd = duration` is gapless. Ogg Opus and Vorbis need Safari 18.4+, but the project targets Safari 17+ (#118).
- ADR 0011: the client's only runtime dependency is `@thorvg/webcanvas`; packages must be at least 7 days old; assets are inert and fetched same-origin, which `connect-src 'self'` already covers.
- ADR 0019 seals the exact asset graph in `docs/assets/motion-84.receipt.json`, including the SHA-256 of `assets/README.md`, `CATALOG.md` and `manifest.json`. ADR 0020 keeps `ui.splash` out of it with the `'splash'` role, `receiptGraph` and `stripSplash`. Any other new asset still fails the receipt.

## Decision

- **Authoring:** sounds are ZzFX parameter arrays and ZzFXM songs in `scripts/audio/sounds.json` (`{ version: 1, sfx: { <id>: { seed, gain, params } }, music: { <id>: { seed, gain, bpm, song: [instruments, patterns, sequence] } } }`; a `null` is ZzFX's default for that slot). `sh scripts/make-audio.sh` downloads ZzFX 1.4.0 (`package/ZzFX.js`, SHA-256 `43f321101a935892c112a291e2e943b4da33159b43fcd4a21f3eae710f4a27ff`) and ZzFXM `cb07fa9` (`zzfxm.js`, SHA-256 `540904cd2574af403896bfa6fd552a7431461979e2002d44d16d21a34ea73115`), exits on a hash mismatch, renders with `scripts/audio/render-audio.mjs` and encodes with LAME 3.100. The MP3s and `docs/assets/audio.receipt.json` (tool versions and hashes, and per sound `file`, `samples`, `bytes`, `pcmSha256`, `mp3Sha256`) are committed. `--check` re-renders and compares every hash. Nothing is added to the runtime, and no npm dependency is added.
- **Rendering:** each sound runs with `Math.random = mulberry32(seed)`. A sound effect is ZzFX's samples with the silent tail (below `1 / 32768`) trimmed. A song's sequence is rendered three times in a row and the loop is the middle pass, samples `[n, 2n)` with `n` = rows × `(44100 / bpm * 60 >> 2)`, mixed to mono as `(l + r) / 2`. The middle pass already contains the notes held over from the pass before it, and ends where the third pass continues, so the loop point is the same as the renderer's own continuation; the renderer fails unless the third pass repeats the second sample for sample. Every sample times `gain` must stay within ±1.
- **Format:** MP3, MPEG-1 Layer III, 44.1 kHz, mono, CBR 96 kbps (`lame --quiet -m m -b 96 --noreplaygain`), with LAME's gapless header.
- **Budgets:** each `sfx.*` file is at most 2.0 s and 32 KiB; each `music.*` file at most 70 s (3 087 000 samples) and 840 KiB; all audio together at most 2 MiB.
- **IDs:** namespaces `sfx.<name>` (folder `audio/sfx/`) and `music.<name>` (folder `audio/music/`), file name by the naming rule, format `mp3`, non-drawable like `font.*`. A manifest entry is `{ file, format: 'mp3', samples, loop }`, with `loop` true exactly for `music.*`; `size`, `anchor` and `filter` are rejected. `DrawableAssetId` excludes both namespaces, and the worker, the gallery and the boot progress ignore them. A catalog section whose heading starts with `Sound` uses the columns `ID | File | Format | Length | Original role | Used by | Status`.
- **Receipt:** `scripts/assets/motion_graph.ts` gives every `mp3` entry's file the graph role `'audio'` (`audioIds`). `receiptGraph` drops the `'splash'` and `'audio'` files and IDs, and hashes the support files after `stripUnsealed(text, ids)` (formerly `stripSplash`) removes the lines naming those IDs, their manifest entry blocks, and every marker block from a line `<!-- audio:begin -->` through the next line `<!-- audio:end -->` plus the one empty line right after it. Every other change still fails the verifier.
- **Style:** the music is original chiptune written for this game. Its genre influences are gothic action-game chiptune in general (driving minor-key bass ostinatos, square and saw leads, arpeggios, noise drums, organ-like pads); no melody, bass line or progression is taken from any game.
- **Other sources:** sound from any other source (AI models, CC0 or other libraries) needs a new ADR that records its licence.

## Alternatives considered

- **Ogg Opus or Vorbis** — rejected: Safari before 18.4 cannot decode it, and the project targets Safari 17+.
- **Runtime synthesis in the client (ZzFX in the bundle)** — rejected: it adds third-party code to the client, and every visit pays the synthesis time.
- **Re-sealing #117's receipt with the audio inside** — rejected: re-sealing needs #117's ignored AI raws and private evidence (ADR 0020).
- **MusicGen or AudioGen** — rejected: CC-BY-NC 4.0 weights. **Stable Audio Open** — rejected: its community licence limits revenue, needs registration and attribution. **ACE-Step** — rejected by the user: its training data cannot be verified. **Sonniss GDC bundles** — rejected: the licence forbids redistributing the sounds as sounds. **Kenney (CC0)** — not needed: the user preferred sounds the agent writes itself; a later ADR may add it.
- **Rendering a song once, or twice and taking the second pass** — rejected: ZzFXM fades every note out over the last 99 samples of the sequence, so the end of a final pass dips to silence and clicks at the loop point.

## Consequences

- A sound changes by editing numbers in `scripts/audio/sounds.json` and re-running `sh scripts/make-audio.sh`; the receipt and the asset tests show any drift. Contributors who do so need `curl`, Node 24 and LAME 3.100; nobody else does, and CI only checks the committed files against the receipt.
- `--check` assumes Node's `Math` functions and LAME 3.100 give the same results on every machine. If a contributor's platform renders different PCM or MP3 bytes, `--check` fails there: record that machine's result and revisit (for example, compare only decoded lengths and PCM within a tolerance).
- `stripUnsealed` has the blind spot of ADR 0020's `stripSplash`, widened to the audio marker blocks: lines inside them are not hash-checked by the motion receipt, so reviewers must keep those blocks about audio only. `audio-assets.test.ts` checks the audio rows themselves.
- #117's publication pipeline (`motion_publish.py`, `motion_publish_graph.ts`) builds staged packs without `ui.splash` and without audio, and counts formats; it must learn the `'splash'` and `'audio'` roles before it can publish again.
- Playing the sounds (the worker channel, volume and mute) is a separate issue.
- Revisit if the project drops Safari 17 (Opus becomes possible), if the music needs stereo, or if the motion receipt is re-sealed (it could then include the audio).
