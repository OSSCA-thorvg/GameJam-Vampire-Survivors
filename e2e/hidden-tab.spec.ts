import { expect, type Page } from '@playwright/test';
import { test } from './helpers/native-test';
import {
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
} from './helpers';
import { hidePage } from './helpers/hide-page';
import type { VsDebug } from '../packages/client/src/main/debug';

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

test('hidden tab: a single-player run pauses while hidden and shows the pause overlay on return', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const ev = startEvidence(page, 'hidden-tab-run-pause');
  noteEvidence(testInfo, ev);
  let visibility;
  try {
    expect((await openGame(page, baseURL)).renderer).toBe('gl');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'playing' && s.timeS >= 1, 10_000);
    await ev.shot('playing');
    visibility = await hidePage(page);
    ev.json('ownership', visibility.ownership);
    const before = await sample(page);
    await page.waitForTimeout(3_000);
    const after = await sample(page);
    expect(before.document).toBe('hidden');
    expect(after.document).toBe('hidden');
    expect(after.snapshot.timeS).toBe(before.snapshot.timeS);
    expect(after.snapshot.steps).toBe(before.snapshot.steps);
    expect(after.snapshot.paused).toBe(true);
    await visibility.show();
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
    await ev.shot('overlay-on-return');
    // The overlay holds the run paused after the tab is visible again.
    await page.waitForTimeout(1_000);
    const held = await sample(page);
    expect(held.document).toBe('visible');
    expect(held.snapshot.state).toBe('playing');
    expect(held.snapshot.timeS).toBe(before.snapshot.timeS);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    const resumed = await waitForSnapshot(page, (s) => s.timeS > before.snapshot.timeS, 3_000);
    ev.json('snapshots', { before, after, held, resumed });
    expect(resumed.timeS - before.snapshot.timeS).toBeLessThan(0.5);
    await ev.shot('resumed');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    try {
      await visibility?.dispose();
      if (!page.isClosed()) await expect.poll(() => context.pages().length).toBe(1);
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
