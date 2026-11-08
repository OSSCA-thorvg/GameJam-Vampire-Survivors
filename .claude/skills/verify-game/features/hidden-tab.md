# Hidden tab

When the tab is hidden, the worker follows its background policy: `'pause'` (default, single player) stops simulation, while `'simulate'` (versus) keeps stepping on a timer without rendering (ADR 0004, #2).

## Sub-features

- **Native visibility:** `document.visibilityState` becomes `'hidden'` after another task-owned tab is activated, and the worker snapshot's `hidden` becomes `true` through the real `visibilitychange` listener. Showing the game restores both states.
- **`'pause'` (default):** over a three-second hidden interval, `steps` and `renders` remain equal. The worker's visible-again log reports `steps while hidden 0, renders while hidden 0`.
- **`'simulate'`:** after setting the policy as a precondition, hidden `steps` advance while `renders` stays equal. The visible-again worker log reports positive steps and zero renders. Do not require exactly 180 steps: native timer throttling affects when the final tick arrives.
- **Resume:** after showing the game, both `steps` and `renders` increase. `renders` is the read-only cumulative render-hook counter registered by `worker/debug.ts`; the previous-window `fps` rate cannot prove zero renders.
- **Ownership and cleanup:** only a newly launched BrowserServer process, its generated temporary profile, its loopback CDP endpoint and its recorded game/blank targets are used. The helper closes its blank target and restores the game on success and failure; fixture cleanup stops the owned process and removes its profile. The regular headless smoke fixture stays separate.

## How to get to it (user POV)

Switch to another browser tab while the game runs, wait three seconds, and come back. `'simulate'` has no player entry point until versus play (#20); reach only that precondition with `__vsDebug.post({ type: 'setBackgroundPolicy', policy: 'simulate' })`. The visibility behavior itself must be native, never a posted worker visibility message.

## Driving it

### Claude in Chrome

Use a new task-owned game tab following `boot.md`. Capture a screenshot and `await __vsTest.snapshot()` while visible. The extension does not provide the native automated hiding fixture: use the Playwright journey below for automated level-5 evidence. For an interactive extension run, the person switches to another tab for three seconds and back; record `visibilitychange` document states, the before/after snapshots, and visible screenshots. Repeat after the documented simulate-policy precondition. Equal hidden `steps`/`renders` under pause, advancing hidden steps with equal renders under simulate, and increasing counters after show are the same observations for both drivers. Close only the task-owned tab.

### Playwright

The checked-in `e2e/hidden-tab.spec.ts` is the CI journey. Run `pnpm verify:e2e --issue <N> --project hidden-tab` on a desktop; Linux needs `xvfb-run -a pnpm verify:e2e --issue <N> --project hidden-tab` after `pnpm exec playwright install --with-deps chromium`. `pnpm verify:e2e --project chromium` selects ordinary headless smoke. The default suite runs both projects; CI wraps that full command in Xvfb.

The native fixture in `e2e/helpers/native-test.ts` launches a fresh headed Chromium with `launchServer`, obtains the ephemeral local CDP port only from that process's generated profile, and uses `connectOverCDP({ noDefaults: true })` with its existing default context. It never connects to an existing user's browser/profile and never discovers external endpoints. Standard Playwright-created contexts enable focus emulation; using a new context would reintroduce that override. The helper in `e2e/helpers/hide-page.ts` creates a blank target in the task context and activates only its recorded targets. It fails if the actual document does not become hidden within five seconds. Neither helper posts synthetic visibility messages.

For a feature-map copy, save this complete spec as `verification/issue-<N>/journeys/hidden-tab.spec.ts`. Launch and doctor first, then run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project hidden-tab`; on Linux prefix `xvfb-run -a`. Always run `pnpm verify:cleanup` afterward.

```ts
import { expect, type Page } from '@playwright/test';
import { test } from '../../../e2e/helpers/native-test';
import {
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
} from '../../../e2e/helpers';
import { hidePage } from '../../../e2e/helpers/hide-page';
import type { VsDebug } from '../../../packages/client/src/main/debug';

async function sample(page: Page) {
  return {
    at: new Date().toISOString(),
    document: await page.evaluate(() => document.visibilityState),
    snapshot: await snapshot(page),
  };
}

function renders(state: Awaited<ReturnType<typeof snapshot>>): number {
  if (typeof state.renders !== 'number')
    throw new Error('Read-only renders snapshot field is missing');
  return state.renders;
}

async function simulate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug: VsDebug | undefined = globalThis.__vsDebug;
    if (!debug) throw new Error('__vsDebug.post is missing');
    debug.post({ type: 'setBackgroundPolicy', policy: 'simulate' });
  });
  await waitForSnapshot(page, (s) => s.backgroundPolicy === 'simulate', 2_000);
}

test('hidden tab: native visibility pauses or simulates without rendering, then resumes', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const ev = startEvidence(page, 'hidden-tab');
  noteEvidence(testInfo, ev);
  let visibility;
  const phases = [];
  try {
    expect((await openGame(page, baseURL)).renderer).toBe('gl');
    await ev.shot('visible');
    const visible = await sample(page);
    visibility = await hidePage(page);
    ev.json('ownership', visibility.ownership);
    for (const policy of ['pause', 'simulate']) {
      if (policy === 'simulate') {
        await simulate(page);
        await visibility.hide();
      }
      const before = await sample(page);
      const started = Date.now();
      await page.waitForTimeout(3_000);
      const after = await sample(page);
      const elapsedMs = Date.now() - started;
      phases.push({ policy, before, after, elapsedMs });
      ev.json('snapshots', { visible, phases });
      expect(before.document).toBe('hidden');
      expect(after.document).toBe('hidden');
      expect(before.snapshot.hidden).toBe(true);
      expect(after.snapshot.hidden).toBe(true);
      expect(after.snapshot.backgroundPolicy).toBe(policy);
      expect(renders(after.snapshot)).toBe(renders(before.snapshot));
      if (policy === 'pause') expect(after.snapshot.steps).toBe(before.snapshot.steps);
      else expect(after.snapshot.steps - before.snapshot.steps).toBeGreaterThan(30);
      const logsBeforeShow = ev.workerLog.length;
      await visibility.show();
      const resumed = await waitForSnapshot(
        page,
        (s) => s.steps > after.snapshot.steps && renders(s) > renders(after.snapshot),
        5_000,
      );
      await expect
        .poll(() =>
          ev.workerLog.slice(logsBeforeShow).find((line) => line.includes('visible after')),
        )
        .toMatch(/renders while hidden 0/);
      const log = ev.workerLog.slice(logsBeforeShow).find((line) => line.includes('visible after'));
      if (policy === 'pause') expect(log).toMatch(/steps while hidden 0,/);
      else expect(log).toMatch(/steps while hidden [1-9]\d*,/);
      ev.json(`resumed-${policy}`, {
        document: await page.evaluate(() => document.visibilityState),
        resumed,
        log,
      });
      await ev.shot(`visible-after-${policy}`);
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    try {
      await visibility?.dispose();
      if (!page.isClosed()) {
        await expect.poll(() => context.pages().length).toBe(1);
        ev.json('cleanup', {
          ownedTargetRemoved: true,
          pageCount: context.pages().length,
          document: await page.evaluate(() => document.visibilityState),
        });
      }
    } finally {
      ev.flush();
    }
  }
});

test('hidden tab: owned target is disposed after an intentional journey failure', async ({
  page,
  context,
  baseURL,
}) => {
  const ev = startEvidence(page, 'hidden-tab-failure-cleanup');
  let visibility;
  try {
    await openGame(page, baseURL);
    try {
      visibility = await hidePage(page);
      ev.json('ownership', visibility.ownership);
      throw new Error('intentional journey failure');
    } finally {
      await visibility?.dispose();
      await visibility?.dispose();
    }
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : '').toBe('intentional journey failure');
  } finally {
    await expect.poll(() => context.pages().length).toBe(1);
    const state = await sample(page);
    expect(state.document).toBe('visible');
    expect(state.snapshot.hidden).toBe(false);
    ev.json('cleanup-after-intentional-failure', {
      ownedTargetRemoved: true,
      pageCount: context.pages().length,
      state,
    });
    await ev.shot('restored-after-failure');
    ev.flush();
  }
});
```

## Gotchas

- **2026-11-08, #52:** normal Playwright Chromium pages receive a focus-emulation override from their original session. Disabling it through a second public CDP session still left the page visible; the first genuine headed journey failed and was retained as evidence. The public `noDefaults` connection to a newly task-launched process's existing context avoids that override and produced native `hidden` then `visible`. Do not re-enable focus emulation in helper cleanup.
- **2026-11-08, #52:** genuine hidden proof requires headed Chromium and a desktop display; Linux CI uses Xvfb and SwiftShader. Missing display support and native-hidden timeouts fail the journey. They never turn into a synthetic visibility fallback or a level-5 claim.
- During a hidden measurement, do not screenshot, focus, navigate, or send input to the game. Record document state and read-only snapshots; screenshots are taken before hide and after show.
- Evidence includes `hidden-tab/snapshots.json`, `resumed-*.json`, `ownership.json`, `cleanup.json`, page/worker logs, visible screenshots, and `native-fixture-*/{ownership,cleanup}.json`. The fixture records PID, temporary profile, loopback endpoint and process/profile cleanup; The native fixture retains and attaches `native-trace.zip` with browser events, network data and snapshots on failure under `playwright-output/`; regular smoke keeps the runner trace. Fast `worker/loop.test.ts` policy coverage is level 4 and remains independent.
- The `renders` registration and `__vsDebug.post` precondition exist in dev builds; `verify:launch` serves the e2e Vite development mode. Production builds strip the instrumentation.
