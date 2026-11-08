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

test('boot: the worker starts ThorVG with gl and the test scene animates and moves', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'boot');
  noteEvidence(testInfo, ev);
  try {
    const ready = await openGame(page);
    await ev.shot('ready');
    ev.json('snapshot-ready', ready);
    expect(ready.renderer).toBe('gl');
    expect(ready.state).toBe('running');
    await expect(page.locator('#app canvas')).toHaveCount(1);

    // The simulation steps and the square rotates.
    const later = await waitForSnapshot(page, (s) => s.steps >= ready.steps + 30, 10_000);
    const sceneBefore = ready.testScene as { angleDeg: number; dotX: number; dotY: number };
    const sceneLater = later.testScene as { angleDeg: number; dotX: number; dotY: number };
    expect(sceneLater.angleDeg).not.toBe(sceneBefore.angleDeg);
    await ev.shot('animating');

    // Real keyboard input moves the dot right.
    await holdKeys(page, ['ArrowRight'], 500);
    const moved = await snapshot(page);
    await ev.shot('after-arrow-right');
    ev.json('snapshot-after-arrow-right', moved);
    const sceneMoved = moved.testScene as { dotX: number; dotY: number };
    expect(sceneMoved.dotX).toBeGreaterThan(sceneLater.dotX + 20);
    expect(sceneMoved.dotY).toBe(sceneLater.dotY);

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
