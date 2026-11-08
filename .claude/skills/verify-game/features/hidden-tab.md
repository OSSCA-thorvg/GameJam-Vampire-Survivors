# Hidden tab

When the tab is hidden, the worker follows its background policy: `'pause'` (default, single player) stops the simulation, `'simulate'` (versus) keeps stepping on a `setTimeout` loop without rendering (ADR 0004, #2).

## Sub-features

- **`'pause'` (default):** while hidden, `snapshot().hidden` is `true`, `backgroundPolicy` is `'pause'` and `steps` does not change; after showing the tab again, `steps` rises again. Worker log: `[worker] visible after … hidden: steps while hidden 0, renders while hidden 0`.
- **`'simulate'`:** after `setBackgroundPolicy` `'simulate'`, while hidden `steps` keeps rising (about 60 per second, up to 120 per tick when timers are throttled) and nothing renders. Worker log: `steps while hidden <n>` with `n > 0`, `renders while hidden 0`.

## How to get to it (user POV)

Switch to another tab or minimize the window while the game runs, then come back. `'simulate'` has no player entry point until versus play (#20); reach it as a precondition with `__vsDebug.post({ type: 'setBackgroundPolicy', policy: 'simulate' })`.

## Driving it

### Claude in Chrome

Neither automated driver can hide the game tab (Gotchas), so the real-hide step is done by the person at the keyboard:

1. Open the game in a new tab as in `boot.md` steps 1–3.
2. `javascript_tool`, arming a recorder:
   ```js
   window.__visLog = [];
   const rec = async (why) => {
     const s = await __vsTest.snapshot();
     __visLog.push({
       why,
       vis: document.visibilityState,
       hidden: s.hidden,
       steps: s.steps,
       policy: s.backgroundPolicy,
     });
   };
   document.addEventListener('visibilitychange', () => {
     rec('change');
     setTimeout(() => rec('change+1500ms'), 1500);
   });
   ```
3. Ask the person to switch Chrome to another tab for about 3 seconds and back. Then `javascript_tool` `JSON.stringify(window.__visLog)` → the hidden entries have equal `steps` under `'pause'`.
4. `javascript_tool` `__vsDebug.post({ type: 'setBackgroundPolicy', policy: 'simulate' })`, repeat step 3 → the hidden entries' `steps` rise. `screenshot` before and after; close the tab.

### Playwright

Save as `verification/issue-<N>/journeys/hidden-tab.spec.ts`. It tries a real hide first and, because Playwright keeps pages visible, falls back to posting the worker's own `visibility` message (the message `main/index.ts` sends on `visibilitychange`); the notes in `snapshots.json` say which path ran.

```ts
import { expect, test, type Page } from '@playwright/test';
import { openGame, snapshot, startEvidence, waitForSnapshot } from '../../../e2e/helpers';

async function post(page: Page, message: unknown): Promise<void> {
  await page.evaluate((m) => {
    (globalThis as unknown as { __vsDebug: { post(x: unknown): void } }).__vsDebug.post(m);
  }, message);
}

async function hide(page: Page, other: Page, notes: string[]): Promise<void> {
  await other.bringToFront();
  try {
    await waitForSnapshot(page, (s) => s.hidden, 2_000);
    notes.push('real hide: second page brought to front');
  } catch {
    notes.push(
      'real hide unavailable (Playwright keeps pages visible): posted { type: visibility, hidden: true }',
    );
    await post(page, { type: 'visibility', hidden: true });
    await waitForSnapshot(page, (s) => s.hidden, 2_000);
  }
}

async function show(page: Page): Promise<void> {
  await page.bringToFront();
  await post(page, { type: 'visibility', hidden: false });
  await waitForSnapshot(page, (s) => !s.hidden, 2_000);
}

test('hidden tab: pause freezes the simulation, simulate keeps stepping', async ({
  page,
  context,
}) => {
  const ev = startEvidence(page, 'hidden-tab');
  const notes: string[] = [];
  try {
    await openGame(page);
    await ev.shot('visible');
    const other = await context.newPage();

    await hide(page, other, notes);
    const h1 = await snapshot(page);
    await page.waitForTimeout(2_000);
    const h2 = await snapshot(page);
    expect(h2.backgroundPolicy).toBe('pause');
    expect(h2.steps).toBe(h1.steps);
    await show(page);
    const v1 = await waitForSnapshot(page, (s) => s.steps > h2.steps + 30, 5_000);
    await ev.shot('visible-again');

    await post(page, { type: 'setBackgroundPolicy', policy: 'simulate' });
    await waitForSnapshot(page, (s) => s.backgroundPolicy === 'simulate', 2_000);
    await hide(page, other, notes);
    const s1 = await snapshot(page);
    await page.waitForTimeout(2_000);
    const s2 = await snapshot(page);
    expect(s2.steps - s1.steps).toBeGreaterThan(90);
    await show(page);
    await ev.shot('visible-after-simulate');
    ev.json('snapshots', { notes, pause: { h1, h2, v1 }, simulate: { s1, s2 } });
    await other.close();
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- **No automated real hide (2026-11-08, #31).** Playwright keeps every page `visible`: a second page plus `bringToFront`, CDP window minimize, and a persistent context without the backgrounding flags all left `document.visibilityState` at `visible`, headless and headed. Claude in Chrome did not hide it either: `tabs_create_mcp`, navigating and screenshotting another tab, and `key cmd+t` (delivered to the page, not to Chrome) all left the game tab visible and stepping. So the Playwright journey proves the worker's policies at level 4 through the real `visibility` message, and the level-5 link (`visibilitychange` → message) needs the person to switch tabs (Claude in Chrome recipe).
- Playwright disables timer throttling, so `'simulate'` steps at about 60 per second while "hidden"; a really hidden Chrome tab throttles timers to about 1 Hz and catches up with up to 120 steps per tick.
- `__vsDebug.post` exists only in dev builds (`pnpm verify:launch` serves one).
