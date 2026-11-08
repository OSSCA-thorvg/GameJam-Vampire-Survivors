# Debug tools

Dev-only tools from #2: `` ` `` (`Backquote`) toggles the perf overlay and `]` (`BracketRight`) fast-forwards 60 s of simulation; production builds contain neither them nor the test bridge.

## Sub-features

- **Perf overlay:** `Backquote` toggles `snapshot().perfOverlay`; when shown, white text at the top left reads `fps <n>` and `steps/s <n>` (lines added by later issues with `registerPerfStat` appear below). Worker log: `[debug] perf overlay shown` / `hidden`.
- **Fast-forward:** `BracketRight` raises `steps` by 3600 and `timeS` by 60 at once, without rendering in between. Worker log: `[debug] fastForward 60 s in <t> ms: simTime a -> simTime a+60`.
- **Absent from production:** `pnpm build` passes `check-prod-bundle.mjs` (no `__vsTest`, `__vsDebug`, `testSnapshot`, `togglePerfOverlay` in `packages/client/dist`); in `vite preview`, `typeof __vsDebug` and `typeof __vsTest` are `undefined` and the two keys change nothing.

## How to get to it (user POV)

In a dev or e2e build (`pnpm dev`, `pnpm verify:launch`), press `` ` `` or `]` while the game runs. Players of the production build cannot reach them.

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
    expect(after.timeS - before.timeS).toBeGreaterThanOrEqual(60);
    expect(after.timeS - before.timeS).toBeLessThan(65);

    await page.keyboard.press('Backquote');
    await waitForSnapshot(page, (s) => !s.perfOverlay, 2_000);
    await ev.shot('overlay-off-again');
    expect(ev.workerLog.some((l) => l.includes('[debug] fastForward 60 s'))).toBe(true);
  } finally {
    ev.flush();
  }
});
```

Production absence: `pnpm build` (its last line is `check-prod-bundle: ok, …`), then `pnpm --filter client exec vite preview --port 4173 --strictPort`, open `http://localhost:4173/` with either driver, press both keys, and check `typeof __vsDebug` and `typeof __vsTest` are `'undefined'` and the screen has no overlay. Stop the preview server you started by its PID.

## Gotchas

- The overlay's first second reads `fps 0` and `steps/s 0`: the numbers come from the once-per-second `stats` window (2026-11-08, #31).
- The overlay uses `HUD_FONT`, the bundled ASCII subset since #46 (ADR 0013); if manifest entry `font.hud` fails to load, the worker logs one warning and falls back to the built-in font, which lacks `/`.
- Screenshots in headless SwiftShader log a `GPU stall due to ReadPixels` warning; it is harmless.
