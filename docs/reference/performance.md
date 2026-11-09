# Performance reference: entity caps and the Lottie question

Measurements behind the entity caps in `packages/shared/src/content/constants.ts` (ADR 0007, retained by ADR 0016) and the answer to "can each enemy be a Lottie?" (#22). Re-measure with the commands below whenever the art, the renderer or ThorVG changes, and add a dated table here.

## How to measure

```sh
pnpm --filter client exec vite build --mode perf          # minified build that keeps the stress scenarios
pnpm --filter client exec vite preview --mode perf        # serves it (add --port <free> --strictPort if 4173 is taken)
```

Open `/?stress=<name>&perf` in a headed browser on a real GPU, one tab, nothing else GPU-heavy running. The scenario warms up for 5 s, measures for 60 s, then logs `[stress] result {json}` and shows the same JSON with a **Copy results** button. Run every scenario 3 times and record the median of the per-run values. The overlay (`?perf`, also in the normal production build) shows the same timings live.

| Scenario               | What it runs                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enemies-400/800/1200` | a real run (Warden, invulnerable) with N wave enemies kept alive around the player, ignoring `ENEMY_CAP`                                                            |
| `projectiles-max`      | 300 enemies kept around the player; Magic Wand, Knife, Axe, Cross, Fire Wand and King Bible at level 8 and every passive at level 5 (6 slots, so not all 8 weapons) |
| `gems-flood`           | 1000 blue gems dropped at once without merging; later drops merge into the red gem as usual                                                                         |
| `lottie-enemy`         | 400 `enemy.lottieTest` (an original 3-shape Lottie), one pooled `LottieAnimation` each, advanced every step by `AssetLibrary.tick`                                  |
| `lottie-enemy-shared`  | the same 400, drawn by duplicating one shared animation's Picture for every enemy every frame (the previous copies removed and disposed)                            |

The JSON reports the frame interval (`medianMs`, `p95Ms`, `maxMs`), the median and mean sim time per step, the transform, `canvas.update()` and `canvas.render()` time per frame, the peak live counts, the user agent, the WebGL renderer and the asset load time. Worker clocks are coarsened to 0.1 ms, so the means are the readable figure for sub-millisecond phases. `canvas.render()` returns before the GPU finishes, so GPU cost shows only in the frame interval.

## Results, 2026-11-09 (#22)

**Machine:** the contributor's development machine, Apple M4 Pro (14 cores), macOS 26.5.1, 60 Hz display; WebGL renderers reported: Chrome `ANGLE Metal Renderer: Apple M4 Pro`, Firefox `Apple M1, or similar` (masked), WebKit `Apple GPU`. Browsers: Chrome 156.0.8078.80 (stable channel), Firefox 157.0 and WebKit 27.2 (the Playwright builds), all headed, 1280×720, on the `perf` build. Concurrent load: other agents ran builds and browsers on the same machine; the 1-minute load average before each run ranged from 3.8 to 54 (column "Load avg", median of the runs), so single-run outliers are expected.

**Reference machine: not measured.** No mid-range laptop with an integrated GPU was available, and the documented substitute (Chrome DevTools 4× CPU throttling) cannot reach the game: Chromium refuses `Emulation.setCPUThrottlingRate` on the worker target ("Operation is only supported for pages, not workers"), and page throttling leaves the worker untouched (measured: `enemies-400` sim 0.27 ms/step unthrottled and 0.23 ms/step with the page at 4×). **Safari 17+ was not measured** (no automation without enabling Safari's remote automation); WebKit 27.2 stands in for it. **WebKit is partial:** 3 runs of the three enemy scenarios, 2 of the other four; the harness timed out once on `enemies-800` run 2 and hung on `projectiles-max` run 3 (stopped after an hour), so run 3 of `projectiles-max`, `gems-flood` and both Lottie scenarios is missing.

Median over the runs of each value; p95 per run in parentheses. Times are milliseconds.

| Browser              | Scenario              | Runs | Frame median ms | Frame p95 ms (runs)        | Max frame ms | Sim ms/step (mean) | Transform ms (mean) | update() ms (mean) | render() ms (mean) | Max counts                                                    | Load avg |
| -------------------- | --------------------- | ---- | --------------- | -------------------------- | ------------ | ------------------ | ------------------- | ------------------ | ------------------ | ------------------------------------------------------------- | -------- |
| chrome 156.0.8078.80 | `enemies-400`         | 3    | 16.70           | 18.50 (18.5 / 18.6 / 17.6) | 20.0         | 0.271              | 0.079               | 0.084              | 0.140              | enemies 400, projectiles 0, gems 173, pickups 0, paints 2938  | 18.7     |
| chrome 156.0.8078.80 | `enemies-800`         | 3    | 16.70           | 19.00 (19.0 / 19.0 / 17.6) | 20.3         | 0.565              | 0.139               | 0.125              | 0.181              | enemies 800, projectiles 0, gems 401, pickups 0, paints 3199  | 17.6     |
| chrome 156.0.8078.80 | `enemies-1200`        | 3    | 16.70           | 18.40 (18.5 / 18.4 / 17.5) | 19.4         | 0.922              | 0.177               | 0.148              | 0.248              | enemies 1200, projectiles 0, gems 401, pickups 0, paints 3630 | 15.3     |
| chrome 156.0.8078.80 | `projectiles-max`     | 3    | 16.70           | 18.60 (18.6 / 18.6 / 17.5) | 22.7         | 0.175              | 0.124               | 0.121              | 0.158              | enemies 304, projectiles 12, gems 401, pickups 0, paints 3013 | 11.5     |
| chrome 156.0.8078.80 | `gems-flood`          | 3    | 16.70           | 18.40 (18.6 / 18.4 / 17.6) | 21.7         | 0.085              | 0.115               | 0.144              | 0.201              | enemies 29, projectiles 0, gems 1001, pickups 0, paints 3538  | 13.2     |
| chrome 156.0.8078.80 | `lottie-enemy`        | 3    | 16.70           | 17.70 (18.7 / 9.3 / 17.7)  | 19.8         | 0.359              | 0.039               | 1.099              | 0.315              | enemies 400, paints 400                                       | 12.1     |
| chrome 156.0.8078.80 | `lottie-enemy-shared` | 3    | 16.70           | 17.60 (18.5 / 17.5 / 17.6) | 25.6         | 0.026              | 1.067               | 1.260              | 0.344              | enemies 400, paints 400                                       | 11.3     |
| firefox 157.0        | `enemies-400`         | 3    | 17.00           | 18.00 (18.0 / 18.0 / 18.0) | 32.0         | 0.534              | 0.214               | 0.144              | 0.265              | enemies 400, projectiles 0, gems 173, pickups 0, paints 2938  | 8.2      |
| firefox 157.0        | `enemies-800`         | 3    | 17.00           | 18.00 (18.0 / 18.0 / 18.0) | 22.0         | 0.714              | 0.239               | 0.143              | 0.241              | enemies 800, projectiles 0, gems 401, pickups 0, paints 3199  | 7.0      |
| firefox 157.0        | `enemies-1200`        | 3    | 17.00           | 18.00 (18.0 / 18.0 / 19.0) | 26.0         | 1.460              | 0.362               | 0.229              | 0.478              | enemies 1200, projectiles 0, gems 401, pickups 0, paints 3630 | 10.6     |
| firefox 157.0        | `projectiles-max`     | 3    | 17.00           | 18.00 (18.0 / 18.0 / 18.0) | 37.0         | 0.343              | 0.273               | 0.202              | 0.316              | enemies 304, projectiles 12, gems 401, pickups 0, paints 3013 | 11.2     |
| firefox 157.0        | `gems-flood`          | 3    | 17.00           | 18.00 (18.0 / 18.0 / 19.0) | 27.0         | 0.141              | 0.280               | 0.241              | 0.365              | enemies 29, projectiles 0, gems 1001, pickups 0, paints 3538  | 12.0     |
| firefox 157.0        | `lottie-enemy`        | 3    | 17.00           | 18.00 (18.0 / 18.0 / 19.0) | 24.0         | 0.615              | 0.079               | 1.415              | 0.639              | enemies 400, paints 400                                       | 11.2     |
| firefox 157.0        | `lottie-enemy-shared` | 3    | 17.00           | 18.00 (18.0 / 18.0 / 19.0) | 48.0         | 0.041              | 1.394               | 1.561              | 0.573              | enemies 400, paints 400                                       | 11.0     |
| webkit 27.2          | `enemies-400`         | 3    | 17.00           | 19.00 (22.0 / 19.0 / 19.0) | 24.0         | 0.411              | 0.261               | 0.185              | 0.362              | enemies 400, projectiles 0, gems 173, pickups 0, paints 2938  | 5.0      |
| webkit 27.2          | `enemies-800`         | 3    | 17.00           | 19.00 (21.0 / 19.0 / 19.0) | 26.0         | 0.894              | 0.396               | 0.265              | 0.460              | enemies 800, projectiles 0, gems 401, pickups 0, paints 3199  | 6.3      |
| webkit 27.2          | `enemies-1200`        | 3    | 17.00           | 19.00 (22.0 / 19.0 / 19.0) | 75.0         | 1.318              | 0.376               | 0.289              | 0.602              | enemies 1200, projectiles 0, gems 401, pickups 0, paints 3630 | 5.8      |
| webkit 27.2          | `projectiles-max`     | 2    | 17.00           | 19.00 (21.0 / 19.0)        | 20.0         | 0.263              | 0.320               | 0.275              | 0.377              | enemies 304, projectiles 12, gems 401, pickups 0, paints 3013 | 5.7      |
| webkit 27.2          | `gems-flood`          | 2    | 17.00           | 19.00 (21.0 / 19.0)        | 34.0         | 0.117              | 0.185               | 0.259              | 0.395              | enemies 29, projectiles 0, gems 1001, pickups 0, paints 3538  | 5.0      |
| webkit 27.2          | `lottie-enemy`        | 2    | 17.00           | 19.00 (19.0 / 19.0)        | 53.0         | 0.522              | 0.055               | 1.413              | 0.598              | enemies 400, paints 400                                       | 4.5      |
| webkit 27.2          | `lottie-enemy-shared` | 2    | 17.00           | 18.00 (18.0 / 18.0)        | 45.0         | 0.028              | 1.250               | 1.625              | 0.524              | enemies 400, paints 400                                       | 5.3      |

**Asset load time** (navigation to `assetsReady`, cold context, 84 manifest entries including the 2938 prewarmed Paints): Chrome median 182 ms (154–259), Firefox 194 ms (164–345), WebKit 236 ms (221–321) over all scenario runs. It is not significant; no bundling or preloading is needed (finding from #5).

### Reading the numbers

- Every scenario in every browser holds the display rate: frame median 16.7–17 ms and p95 17.5–19 ms on a 60 Hz display, well under the 20 ms criterion. The single higher per-run p95 values (21–22 ms, WebKit) come with the busiest load averages; maxima of 20–75 ms are isolated hitches from the shared machine. One Chrome `lottie-enemy` run reported an 8.4 ms median: the window was on a 120 Hz display for that run.
- Worker CPU per frame stays small and grows linearly with enemies: in Chrome, sim + transform + update + render is about 0.6 ms at 400 enemies, 1.0 ms at 800 and 1.5 ms at 1200 (Firefox 1.2 / 1.3 / 2.5 ms, WebKit 1.2 / 2.0 / 2.6 ms). Even a CPU four times slower would spend about 6–10 ms at 1200 enemies, inside the frame. The GPU's share is not visible in these timings (`render()` returns before the GPU finishes) and is what a reference laptop must show.
- `projectiles-max` peaks at only 12 live projectiles: the 300 enemies surround the player, so most shots hit in the step they are fired. It does not stress `PROJECTILE_CAP`; a variant with frozen, spread-out enemies stalled under the shared machine load and was dropped from this PR (follow-up).
- `gems-flood` holds 1001 gems (1000 normal plus the merge gem) at the display rate; paints grew from 2938 to 3538 as the blue pool grew past its prewarm.

## Decision: caps stay at 400 enemies, 600 projectiles and 400 gems

The cap rule is the largest count whose p95 frame interval stays at or below 20 ms **on the reference machine in Chrome**. That machine was not measured, so ADR 0007's rule ("raise them only with a measurement on a mid-range laptop") keeps the caps where they are. The development machine confirms they are safe there with a large margin: 1200 enemies, 1001 gems and the max-weapon load all held p95 ≤ 19 ms in three browsers. The measurements confirm ADR 0007; no ADR is added. The wave table's peak of 300 live enemies (#17) is below the enemy cap, so no mass art needs simplifying.

Pool prewarm retune from the #11, #13 and #17 findings: `gem.blue` is prewarmed to `GEM_CAP` (400, was 200) so a full screen of the commonest gem never grows the pool mid-run, and `fx.levelUp` to 4 (was 2) for back-to-back level-ups; the view now creates 2938 Paints at boot (was 2736). Enemy pools stay at 200 per type: the whole boot, including those Paints, finishes in about 0.2 s.

## The Lottie-per-enemy question

**Supported, and the recommended approach is one pooled `LottieAnimation` per enemy** (`PaintPool` over `AssetLibrary.create`, advanced by `AssetLibrary.tick`). 400 animated `enemy.lottieTest` instances held the display rate in all three browsers (Chrome p95 17.7 ms). The cost moves into ThorVG: `canvas.update()` rises to about 1.1 ms per frame (Chrome; 1.4 ms in Firefox and WebKit) from about 0.1 ms for 400 static PNG enemies, and ticking the 400 animations costs about 0.36 ms per step.

**Sharing one animation and duplicating its Picture for every enemy every frame works in webcanvas 1.1.3** (the copies show the shared frame), but it is not recommended: it is no cheaper (transform 1.07 ms plus update 1.26 ms per frame in Chrome, against 0.04 + 1.10 ms per enemy), it creates and disposes 400 Paints per frame, which ADR 0003 forbids, and it gave the worst hitches (max 25.6 ms in Chrome, 48 ms in Firefox).

The ADR 0007 Lottie rule stays as it is ("Lottie is for a few on-screen instances"): moving mass enemies to Lottie should wait for the reference-laptop measurement, because its `update()` cost is about ten times that of static art.

## Follow-ups

- Measure every scenario on a mid-range laptop with an integrated GPU in Chrome, and in Safari 17+, then revisit the caps and the Lottie rule with those numbers.
- Make `projectiles-max` actually fill the projectile store (enemies kept at range), and rerun it on an idle machine.
