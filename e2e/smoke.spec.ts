// Smoke journey: drives .claude/skills/verify-game/features/boot.md (#31). Runs in CI through `pnpm verify:e2e`.
import { expect, test } from '@playwright/test';
import {
  holdKeys,
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
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

    // The title screen (#9): Start is focused, and Enter starts the run.
    const atTitle = await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    expect(atTitle.player).toBeNull();
    await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
    await ev.shot('title');
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
