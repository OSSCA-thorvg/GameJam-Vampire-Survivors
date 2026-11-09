// Smoke journey: drives .claude/skills/verify-game/features/boot.md (#31). Runs in CI through `pnpm verify:e2e`.
import { expect, test } from '@playwright/test';
import {
  holdKeys,
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
} from './helpers';

test('boot: the worker starts ThorVG with gl, Enter on the title starts a run that steps, and the keyboard moves the player', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'boot');
  noteEvidence(testInfo, ev);
  try {
    const ready = await openGame(page);
    await ev.shot('ready');
    ev.json('snapshot-ready', ready);
    expect(ready.renderer).toBe('gl');
    await expect(page.locator('#app canvas')).toHaveCount(1);

    // The title screen (#9): Start is focused, and Enter opens the character select (#14), where Enter starts the run.
    const atTitle = await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    expect(atTitle.player).toBeNull();
    await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
    await ev.shot('title');
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await expect(page.getByRole('option', { name: 'Warden', selected: true })).toBeFocused();
    await ev.shot('character-select');
    await page.keyboard.press('Enter');
    const started = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);

    // The simulation steps and the run's clock advances.
    const later = await waitForSnapshot(page, (s) => s.steps >= started.steps + 30, 10_000);
    expect(later.timeS).toBeGreaterThan(started.timeS);
    await ev.shot('stepping');

    // Real keyboard input moves the player right (#7).
    const before = later.player as { x: number; y: number };
    await holdKeys(page, ['ArrowRight'], 500);
    const moved = await snapshot(page);
    await ev.shot('after-arrow-right');
    ev.json('snapshot-after-arrow-right', moved);
    const after = moved.player as { x: number; y: number };
    expect(after.x).toBeGreaterThan(before.x + 20);
    expect(after.y).toBe(before.y);

    expect(pageErrors(ev)).toEqual([]);
    expect(ev.workerLog.some((l) => l.includes('[worker started]'))).toBe(true);
  } finally {
    ev.flush();
  }
});

test('boot: an unsupported browser gets the DOM message (?forceUnsupported, dev and e2e only)', async ({
  page,
}) => {
  const ev = startEvidence(page, 'boot-unsupported');
  try {
    await page.goto('/?forceUnsupported=webgl2-offscreen');
    const app = page.locator('#app');
    await expect(app).toContainText('This game needs a recent Chrome, Edge, Firefox or Safari 17+');
    await expect(app.getByRole('listitem')).toContainText(['webgl2-offscreen']);
    await expect(page.locator('#app canvas')).toHaveCount(0);
    await ev.shot('unsupported-message');
  } finally {
    ev.flush();
  }
});

test('boot: a worker error after ready keeps the run and shows the runtime error notice (#123)', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'boot-runtime-error');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await ev.shot('playing-before-error');
    // An uncaught error outside the loop (a timer), so the worker keeps stepping (the issue's Context).
    const worker = page.workers()[0];
    if (!worker) throw new Error('no game worker');
    await worker.evaluate(() => {
      setTimeout(() => {
        throw new Error('runtime probe');
      }, 0);
    });
    const notice = page.locator('#runtime-error');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Something went wrong in the game. Reload to start again.');
    await expect(notice.locator('.runtime-error-detail')).toContainText('runtime probe');
    await expect(notice.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.locator('#screens')).toHaveCount(1);
    await expect(page.locator('#app canvas')).toHaveCount(1);
    await expect(page.getByText('The game could not start.')).toHaveCount(0);
    const after = await snapshot(page);
    ev.json('snapshot-after-error', after);
    expect(after.state).toBe('playing');
    expect(after.runtimeErrors).toBe(1);
    await ev.shot('notice-shown');

    // The thrown error was outside the loop: the run's clock keeps rising.
    await page.waitForTimeout(2_000);
    const later = await snapshot(page);
    ev.json('snapshot-2s-later', later);
    expect(later.timeS).toBeGreaterThan(after.timeS + 1);
    expect(later.state).toBe('playing');
    expect(
      ev.pageLog.some((l) =>
        l.includes('[vs] game worker runtime error: Uncaught Error: runtime probe at '),
      ),
    ).toBe(true);

    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice).toHaveCount(0);
    await ev.shot('dismissed');
    expect((await snapshot(page)).state).toBe('playing');
  } finally {
    ev.flush();
  }
});
