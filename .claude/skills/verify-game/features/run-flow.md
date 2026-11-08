# Run flow

The screens around a single-player run (#9, ADR 0009): the title screen, the run, the pause overlay on Escape or a hidden tab, and the results screen with Retry and Title, all driven with the keyboard alone.

## Sub-features

- **Title:** after `ready`, `state: 'title'`, `player: null`; a level-1 heading and a focused "Start" button. Enter starts a run: `state: 'playing'`, the screen is removed (the canvas stays mounted under every screen).
- **Pause on Escape:** Escape while playing shows the dialog (`role=dialog`, name "Paused") with "Resume" focused and "Quit to title"; `paused: true`; over 2 s `timeS` and `enemyPositions` are unchanged. Enter on "Resume" (or Escape again) closes it and `timeS` continues from the frozen value with no jump (under 0.25 s later at the first sample).
- **Pause on a hidden tab:** see `hidden-tab.md` (the run journey there): the overlay is shown on return and holds the run until Resume.
- **Quit to title:** ArrowDown to "Quit to title", Enter: `state: 'title'`, `player: null`, the worker cleared the run (`endRun`) and draws an empty frame.
- **Results:** at 0 HP (`player-health.md`) the run stops and `state: 'results'`; the screen shows "Game over", Survived (`mm:ss` of `timeS` at death, rounded down), Kills (0 until #10) and Level (1 until #11), with "Retry" focused and "Title".
- **Retry keeps the paint count flat:** Retry starts a fresh run (`timeS` back near 0, full HP); `debug.paintsCreated` (the sum of `created` over every worker paint pool) is the same at boot, at the start of each of five runs and back on the title.
- **Keyboard only:** arrows and WASD move focus between buttons (wrapping), Tab moves natively, Enter activates the focused button (or the first one when focus is elsewhere). Escape does nothing on the title and results screens.
- Snapshot fields: `state` (main thread, `main/app.ts`: `'booting'`, `'title'`, `'playing'`, `'results'`), `paused`, `timeS` and `player` (`null` outside a run), `enemyPositions`, `debug` (`{ paintsCreated }`, `worker/index.ts`).

## How to get to it (user POV)

Open the game URL: the title screen appears once loading finishes. Press Enter to play, Escape to pause. A run ends when the player dies (stand still for 15–30 s). No server and no debug key are needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'title', 30000))` → `state: "title"`, `player: null`; `find` "Start button" → focused; `computer` `screenshot`.
3. `computer` `key` `Enter`; `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'playing' && s.timeS > 3, 10000)).timeS`; `screenshot`.
4. `computer` `key` `Escape`; `read_page` `{ filter: "interactive" }` → a dialog "Paused" with buttons "Resume" and "Quit to title"; read `timeS` and `enemyPositions` twice 1 s apart → equal; `screenshot`.
5. `computer` `key` `Enter`; read `timeS` → a little above the frozen value; `screenshot`.
6. Wait for death: `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'results', 90000))`; `get_page_text` → "Game over", Survived `mm:ss` matching `timeS`, Kills 0, Level 1; `screenshot`.
7. `computer` `key` `Enter` (Retry); read `debug.paintsCreated` → the same as at step 2. Repeat steps 6–7 to taste, then `key` `ArrowDown`, `key` `Enter` (Title) → `state: "title"`.
8. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-run-flow.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/run-flow.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g run-flow`. Evidence: `run-flow-1-pause/` (`pause.json`, screenshots of the title, the run, the dialog and the title again) and `run-flow-2-retry/` (`runs.json` with `paintsCreated` per run and the results time, a results screenshot per run). The hidden-tab pause is the run journey in `e2e/hidden-tab.spec.ts` (`--project hidden-tab`).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/run-flow.md (#9). Keyboard only.
import { expect, test, type Page } from '@playwright/test';
import {
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';

const paintsCreated = (s: GameSnapshot) => (s.debug as { paintsCreated: number }).paintsCreated;

async function title(page: Page): Promise<GameSnapshot> {
  expect((await openGame(page)).renderer).toBe('gl');
  return waitForSnapshot(page, (s) => s.state === 'title', 5_000);
}

test('run-flow 1: title, Enter starts, Escape pauses with time and enemies frozen, Resume continues without a jump', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'run-flow-1-pause');
  noteEvidence(testInfo, ev);
  try {
    const atTitle = await title(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
    expect(atTitle.player).toBeNull();
    await ev.shot('title');
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    const running = await waitForSnapshot(
      page,
      (s) => s.timeS >= 3 && (s.enemies as number) > 0,
      10_000,
    );
    await ev.shot('playing');

    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
    const p0 = await waitForSnapshot(page, (s) => s.paused === true, 2_000);
    expect(p0.state).toBe('playing');
    await ev.shot('paused');
    const frozen: { timeS: number; steps: number; positions: unknown }[] = [];
    for (let i = 0; i <= 4; i++) {
      const s = await snapshot(page);
      frozen.push({ timeS: s.timeS, steps: s.steps, positions: s.enemyPositions });
      if (i < 4) await page.waitForTimeout(500);
    }
    for (const f of frozen) {
      expect(f.timeS).toBe(frozen[0]?.timeS);
      expect(f.positions).toEqual(frozen[0]?.positions);
    }
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    const resumed = await snapshot(page);
    const after = await waitForSnapshot(page, (s) => s.timeS > resumed.timeS, 2_000);
    ev.json('pause', {
      running: running.timeS,
      frozen,
      resumed: resumed.timeS,
      after: after.timeS,
    });
    // No jump: within a fraction of a second of the frozen time.
    expect(resumed.timeS - (frozen[0]?.timeS ?? 0)).toBeLessThan(0.25);
    expect(resumed.paused).toBe(false);

    // Escape toggles both ways, and Quit to title ends the run.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Quit to title' })).toBeFocused();
    await page.keyboard.press('Enter');
    const back = await waitForSnapshot(page, (s) => s.state === 'title', 2_000);
    expect(back.player).toBeNull();
    await ev.shot('quit-to-title');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('run-flow 2: five runs of Retry and death then Title keep the paint count flat', async ({
  page,
}, testInfo) => {
  test.setTimeout(480_000);
  const ev = startEvidence(page, 'run-flow-2-retry');
  noteEvidence(testInfo, ev);
  try {
    const boot = await title(page);
    const runs: {
      run: number;
      paintsCreated: number;
      timeS: number;
      diedAt: number;
      resultTime: string | null;
    }[] = [];
    await page.keyboard.press('Enter');
    for (let run = 1; run <= 5; run++) {
      const start = await waitForSnapshot(page, (s) => s.state === 'playing' && s.timeS < 1, 5_000);
      const dead = await waitForSnapshot(page, (s) => s.state === 'results', 90_000);
      const resultTime = await page.locator('[data-stat="time"]').textContent();
      runs.push({
        run,
        paintsCreated: paintsCreated(start),
        timeS: start.timeS,
        diedAt: dead.timeS,
        resultTime,
      });
      await ev.shot(`run-${String(run)}-results`);
      if (run < 5) {
        await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused();
        await page.keyboard.press('Enter');
      }
    }
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Title' })).toBeFocused();
    await page.keyboard.press('Enter');
    const end = await waitForSnapshot(page, (s) => s.state === 'title', 2_000);
    await ev.shot('title-again');
    ev.json('runs', { boot: paintsCreated(boot), runs, end: paintsCreated(end) });
    expect(
      new Set([paintsCreated(boot), ...runs.map((r) => r.paintsCreated), paintsCreated(end)]).size,
    ).toBe(1);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- A run ends only by death until the 15-minute end (#17); standing still dies in about 15–30 s at minute 0 (bats deal 5 per hit, one hit per 0.5 s), so journey 2 takes about a minute and a half for five runs (2026-11-08, #9).
- Enter on a focused button activates it natively; the screens only handle Enter when focus is elsewhere, so a single press never activates two buttons. `page.keyboard.press('Enter')` right after a transition lands on the new screen's focused button (2026-11-08, #9).
- `steps` keeps counting on the title and results screens (the loop runs under the screens); read `timeS`, which is 0 outside a run and frozen while paused or dead (2026-11-08, #9).
