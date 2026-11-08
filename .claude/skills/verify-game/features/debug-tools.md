# Debug tools

Dev-only tools from #2: `` ` `` (`Backquote`) toggles the perf overlay and `]` (`BracketRight`) fast-forwards 60 s of simulation; later issues add gameplay precondition keys such as `G` (`KeyG`, #10), `L` (`KeyL`, #11) and `P` (`KeyP`, #12); production builds contain neither them nor the test bridge.

## Sub-features

- **Perf overlay:** `Backquote` toggles `snapshot().perfOverlay`; when shown, white text at the top left reads `fps <n>` and `steps/s <n>` (lines added by later issues with `registerPerfStat` appear below). Worker log: `[debug] perf overlay shown` / `hidden`.
- **Fast-forward:** `BracketRight` raises `steps` by 3600 at once, without rendering in between; during a run `timeS` rises by 60 too, unless the player dies on the way (contact damage, #9: a standing player dies within 60 s, and the run then stops). The journey runs it on the title screen, where `timeS` stays 0. Worker log: `[debug] fastForward 60 s in <t> ms: simTime a -> simTime a+60`.
- **Stress scene (#6):** `/?stress=3000` in dev or `perf` mode creates 3000 pooled `enemy.bat` instances, moves/separates them and replaces 1000 every 2 simulated seconds. In dev/e2e, `snapshot().debug` reports actual `entities`, `paintsCreated`, `visiblePaints`, `churnCycles` and `stepMs`. The overlay adds `entities`, `paints created` and `step ms`. Counts stay constant as churn advances. Numeric values clamp to 4096, zero is valid, invalid names warn once and fall back to the normal game view without a `debug` snapshot field (#92), and gallery takes precedence when both flags are present.
- **Grant weapon (#10):** `G` (`KeyG`) during a run adds the first weapon of `WEAPON_LIST` the player does not own, at level 1: `snapshot().weapons` goes from `[{ id: 'whip', level: 1 }]` to also list `{ id: 'magicWand', level: 1 }`; once every weapon is owned it adds nothing. Worker log: `[debug] grantWeapon: magicWand` (or `nothing to grant`). Driven in `weapons.md` journey 3.
- **Level up (#11):** `L` (`KeyL`) during a run grants exactly the XP missing for the next level: on the next step `player.level` rises by one and the level-up dialog opens (`level-up.md`). Worker log: `[debug] levelUp: +<n> XP`. Ignored while the dialog is open. Driven in `level-up.md` journey 2.
- **Grant passive (#12):** `P` (`KeyP`) during a run adds the first passive of `PASSIVES` the player does not own, at level 1 (Hollow Heart, Empty Tome, Bracer, Candelabrador, Clover, Spellbinder, in that order), and recomputes `snapshot().stats`; with 6 owned it adds a level to the first owned passive below level 5, and once all six are at 5 it adds nothing. `snapshot().passives` lists them. Worker log: `[debug] grantPassive: <id>` (or `nothing to grant`). Driven in `passives.md` journey 5.
- **Absent from production:** `pnpm build` passes `check-prod-bundle.mjs` (no `__vsTest`, `__vsDebug`, `testSnapshot`, `togglePerfOverlay` in `packages/client/dist`); in `vite preview`, `typeof __vsDebug` and `typeof __vsTest` are `undefined` and the two keys change nothing.

## How to get to it (user POV)

In a dev or e2e build (`pnpm dev`, `pnpm verify:launch`), press `` ` `` or `]` while the game runs. Players of the normal production build cannot reach them. For stress, navigate to `/?stress=3000`; do not run another game/GPU workload while measuring.

## Driving it

### Claude in Chrome

1. Open the game in a new tab as in `boot.md` steps 1–3; `screenshot`.
2. `computer` `key` `` ` ``; `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.perfOverlay, 3000))` → `perfOverlay: true`; `screenshot` shows `fps …` and `steps/s …`.
3. `javascript_tool` `(await __vsTest.snapshot()).steps`; `computer` `key` `]`; read `steps` again → at least 3600 more.
4. `computer` `key` `` ` `` → `perfOverlay: false`; `screenshot`; close the tab.

### Playwright

Save as `verification/issue-<N>/journeys/debug-tools.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { openGame, snapshot, startEvidence, waitForSnapshot } from '../../../e2e/helpers';

test('debug tools: ` toggles the perf overlay, ] fast-forwards 60 s', async ({ page }) => {
  const ev = startEvidence(page, 'debug-tools');
  try {
    await openGame(page);
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await ev.shot('overlay-off');
    expect((await snapshot(page)).perfOverlay).toBe(false);

    await page.keyboard.press('Backquote');
    await waitForSnapshot(page, (s) => s.perfOverlay, 2_000);
    await page.waitForTimeout(600); // the overlay text refreshes at most every 250 ms
    await ev.shot('overlay-on');

    const before = await snapshot(page);
    await page.keyboard.press('BracketRight');
    const after = await waitForSnapshot(page, (s) => s.steps >= before.steps + 3600, 5_000);
    await ev.shot('after-fast-forward');
    ev.json('fast-forward', { before, after });
    // On the title screen there is no run (#9): only the loop's steps advance.
    expect(after.state).toBe('title');
    expect(after.timeS).toBe(0);

    await page.keyboard.press('Backquote');
    await waitForSnapshot(page, (s) => !s.perfOverlay, 2_000);
    await ev.shot('overlay-off-again');
    expect(ev.workerLog.some((l) => l.includes('[debug] fastForward 60 s'))).toBe(true);
  } finally {
    ev.flush();
  }
});
```

Stress journey: save the following beside the debug spec as `stress.spec.ts`, and select `--project=chromium`. For observed FPS use `VERIFY_HEADED=1` (real GPU); headless smoke uses SwiftShader and is not a hardware FPS claim.

```ts
import { expect, test } from '@playwright/test';
import { cpus, loadavg, platform, release } from 'node:os';
import { openGame, snapshot, startEvidence, waitForSnapshot } from '../../../e2e/helpers';

test('stress: prewarmed paints survive real remove/add cycles', async ({ page, browser }) => {
  test.setTimeout(100_000);
  const ev = startEvidence(page, 'stress');
  try {
    const ready = await openGame(page, '/?stress=3000');
    expect(ready.renderer).toBe('gl');
    await page.waitForTimeout(2200);
    await page.keyboard.press('Backquote');
    await ev.shot('after-warmup');
    const before = await snapshot(page);
    const samples = [];
    for (let window = 0; window < 5; window++) {
      const start = await snapshot(page);
      const fps = [];
      for (let second = 0; second < 10; second++) {
        await page.waitForTimeout(1000);
        const value = await snapshot(page);
        const debug = value.debug as {
          entities: number;
          paintsCreated: number;
          visiblePaints: number;
          churnCycles: number;
        };
        expect(debug.entities).toBe(3000);
        expect(debug.paintsCreated).toBe(3000);
        expect(debug.visiblePaints).toBe(3000);
        fps.push(value.fps);
      }
      const end = await snapshot(page);
      expect(
        (end.debug as { churnCycles: number }).churnCycles -
          (start.debug as { churnCycles: number }).churnCycles,
      ).toBeGreaterThanOrEqual(5);
      samples.push({ start, end, fps });
    }
    await ev.shot('after-churn');
    const hardware = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return extension && gl ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable';
    });
    ev.json('measurement', {
      before,
      samples,
      machine: {
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        cores: cpus().length,
        load: loadavg(),
      },
      browser: browser.version(),
      hardware,
    });
    expect(
      ev.pageLog.filter((line) => line.includes('[error]') || line.includes('[pageerror]')),
    ).toEqual([]);
    expect(ev.workerLog.filter((line) => line.includes('[error]'))).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('stress: zero, clamp, invalid names and gallery precedence', async ({ page }) => {
  const ev = startEvidence(page, 'stress-entry-points');
  try {
    expect((await openGame(page, '/?stress=0')).debug).toMatchObject({
      entities: 0,
      paintsCreated: 0,
    });
    expect((await openGame(page, '/?stress=99999')).debug).toMatchObject({
      entities: 4096,
      paintsCreated: 4096,
    });
    expect((await openGame(page, '/?stress=reserved')).debug).toBeUndefined();
    expect(
      ev.workerLog.filter((line) => line.includes('[stress] unsupported scenario: reserved')),
    ).toHaveLength(1);
    const gallery = await openGame(page, '/?gallery&stress=3000');
    expect(gallery.gallery).toBeDefined();
    expect(gallery.debug).toBeUndefined();
    expect(gallery.galleryPreview).toBe(false);
    await page.keyboard.press('KeyV');
    await waitForSnapshot(page, (value) => value.galleryPreview === true, 2000);
    await ev.shot('gallery-precedence-preview');
    await page.keyboard.press('KeyV');
    await waitForSnapshot(page, (value) => value.galleryPreview === false, 2000);
    await ev.shot('gallery-precedence');
  } finally {
    ev.flush();
  }
});
```

Heap diagnostic, separate from untraced FPS measurements: warm the same 3000-entity scene, then record **10 seconds with the game worker selected** in Chrome DevTools Performance. Save the raw trace and worker heap graph, plus before/after snapshots with advancing `steps`/`churnCycles` and constant paint counts. Inspect retained heap floors and allocation stacks rather than treating every temporary sawtooth as a leak. The pinned ThorVG `Paint.transform` wrapper creates transient typed-array views/WASM allocations; minor GC there is allowed. Attribute growing retained allocations to source before claiming the owned loop is clean.

For a Playwright/CDP equivalent, launch a fresh task-owned headed browser, get its browser CDP session, find the dedicated worker target whose URL is `src/worker/index.ts`, and attach **that target** with `Target.attachToTarget`. Route worker `Runtime.getHeapUsage`, `HeapProfiler.startSampling`/`stopSampling` and `Profiler.start`/`stop` through its session, sampling heap every 500 ms for 10 s. Record `Tracing.start` with `devtools.timeline`, `disabled-by-default-devtools.timeline`, `v8`, `disabled-by-default-v8.gc` and CPU-profile categories. Keep `TracingSessionIdForWorker` and the worker thread's `UpdateCounters` so evidence cannot accidentally measure the main page. Save the full trace, worker heap samples, allocation profile, CPU profile, target identity and summary. Tracing changes frame timing: report FPS only from the earlier untraced run. Detach the owned worker session and close the task browser in `finally`.

For Claude in Chrome, use a new task tab, navigate to `/?stress=3000`, toggle the overlay with the real key and read the same snapshots before/after 10 s; capture both screenshots and the selected worker's 10 s Performance recording. Never attach to a user's existing browser/profile with CDP. Record CPU/browser/GPU, load, sample count, median and range; investigate and explain a median below 55 FPS rather than weakening the criterion.

Production absence: `pnpm build` (its last line is `check-prod-bundle: ok, …`), then `pnpm --filter client exec vite preview --port 4173 --strictPort`, open `http://localhost:4173/` with either driver, press both keys, and check `typeof __vsDebug` and `typeof __vsTest` are `'undefined'` and the screen has no overlay. Also open `/?stress=3000` and `/?gallery&stress=3000`: neither enables diagnostic scenes; the normal bat/dot scene remains. The normal build excludes `paintsCreated`, `churnCycles` and the invalid-scenario warning; a separate `vite build --mode perf` retains stress for #22. Stop the preview server you started by its PID.

## Gotchas

- Since #11 `]` during a run stops simulating at the first level-up: the world does not step while a choice is pending, so `timeS` rises by less than 60 and the dialog opens when the fast-forward returns (2026-11-08, #11).
- Since #9 a fast-forward inside a run usually ends in death (the dead world stops at the death time, so `timeS` rises by less than 60); fast-forwarding to a later minute needs the invulnerability precondition from #17 (`KeyI`). The journey fast-forwards on the title screen (2026-11-08, #9).
- The overlay's first second reads `fps 0` and `steps/s 0`: the numbers come from the once-per-second `stats` window (2026-11-08, #31).
- The overlay uses `HUD_FONT`, the bundled ASCII subset since #46 (ADR 0013); if manifest entry `font.hud` fails to load, the worker logs one warning and falls back to the built-in font, which lacks `/`.
- Screenshots in headless SwiftShader log a `GPU stall due to ReadPixels` warning; it is harmless.

- Stress churn runs every 2 **simulated** seconds; retain `steps` and `churnCycles` with paint counts so low frame rates cannot disguise skipped work. The debug snapshot allocates only when requested, outside the owned per-entity hot loop.
- Per-run reset order is pool `releaseAll()` followed by store `clear()`; ordinary removal must call binding `unbind(slot)` first. Bindings store physical pool handles, and use preallocated stable-UID bookkeeping to distinguish unbound slots from handle zero.
