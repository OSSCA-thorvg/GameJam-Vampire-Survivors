// Splash journeys: drive the "Splash" sub-feature of .claude/skills/verify-game/features/boot.md (#126). The e2e build
// skips the splash unless `?splash=full`, so the smoke journey keeps today's boot.
import { expect, test, type Page } from '@playwright/test';
import {
  noteEvidence,
  pageErrors,
  startEvidence,
  waitForSnapshot,
  type GameSnapshot,
} from './helpers';

interface SplashField {
  state: 'playing' | 'holding' | 'done' | 'skipped';
  frame: number;
  elapsedS: number;
  durationS: number;
}
interface LoadingField {
  visible: boolean;
  held: boolean;
  text: string;
}
interface AssetsField {
  ready: boolean;
  loaded: number;
  total: number;
  placeholders: string[];
}
const splashOf = (s: GameSnapshot): SplashField | undefined =>
  (s as Record<string, unknown>).splash as SplashField | undefined;
const loadingOf = (s: GameSnapshot): LoadingField | undefined =>
  (s as Record<string, unknown>).loading as LoadingField | undefined;
const assetsOf = (s: GameSnapshot): AssetsField | undefined =>
  (s as Record<string, unknown>).assets as AssetsField | undefined;

/**
 * Holds one manifest file until `release()` is called, then lets it through unchanged. The journey decides when, from
 * the snapshot, so the precondition does not depend on how fast the runner renders (CI renders in software).
 */
async function holdBat(page: Page): Promise<{ release: () => void }> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/enemies/bat.json', async (route) => {
    await released;
    await route.continue();
  });
  return {
    release: () => {
      release();
    },
  };
}
/** Software rendering (CI) runs the splash at a few frames per second; waits scale for it, assertions do not. */
const SLOW_MS = 120_000;
/**
 * One snapshot, retried: while the worker decodes the other assets it can miss the bridge's 2 s reply window on a
 * slow runner.
 */
const settled = (page: Page): Promise<GameSnapshot> => waitForSnapshot(page, () => true, SLOW_MS);

test('splash: plays the full 7 s first, ignores input, then the title follows', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'splash-full');
  noteEvidence(testInfo, ev);
  try {
    await page.goto('/?splash=full');
    const first = await waitForSnapshot(page, (s) => splashOf(s)?.state === 'playing', SLOW_MS);
    const t0 = Date.now();
    ev.json('snapshot-playing', first);
    expect(first.state).toBe('booting');
    expect(first.ready).toBe(false);
    expect(loadingOf(first)?.visible).toBe(false);
    await expect(page.locator('#loading')).toBeHidden();
    await ev.shot('t0-playing');

    const at = async (seconds: number): Promise<void> => {
      const wait = t0 + seconds * 1000 - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    };
    await at(1);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await page.locator('#app canvas').click();
    const afterInput = await settled(page);
    ev.json('snapshot-after-input', afterInput);
    expect(splashOf(afterInput)?.state).toBe('playing');
    expect(afterInput.state).toBe('booting');

    const frames: number[] = [];
    for (const [seconds, name] of [
      [2.3, 't2.3'],
      [3.7, 't3.7'],
      [5, 't5'],
    ] as const) {
      await at(seconds);
      const s = await settled(page);
      frames.push(splashOf(s)?.frame ?? -1);
      await ev.shot(name);
      ev.json(`snapshot-${name}`, s);
    }
    expect(frames[0]).toBeGreaterThan(0);
    expect(frames[1]).toBeGreaterThan(frames[0] ?? 0);
    expect(frames[2]).toBeGreaterThan(frames[1] ?? 0);

    // The last frame before the title, as close to 7 s as the title allows.
    const ended = await waitForSnapshot(
      page,
      (s) => splashOf(s)?.state !== 'playing' || s.state === 'title',
      SLOW_MS,
    );
    await ev.shot('t7-end');
    ev.json('snapshot-end', ended);
    const title = await waitForSnapshot(page, (s) => s.state === 'title', SLOW_MS);
    const wall = (Date.now() - t0) / 1000;
    ev.json('snapshot-title', { ...title, wallSinceFirstPlayingS: wall });
    await ev.shot('title');
    expect(wall).toBeGreaterThanOrEqual(6.8);
    const last = splashOf(title);
    expect(last?.state).toBe('done');
    expect(last?.elapsedS).toBeGreaterThanOrEqual(7 - 1e-6);
    expect(last?.frame).toBe(209);
    expect(pageErrors(ev)).toEqual([]);
    expect(ev.workerLog.filter((l) => l.includes('[error]'))).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('splash: slower loading holds frame 209 with the progress centred under the logo', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'splash-hold');
  noteEvidence(testInfo, ev);
  try {
    const bat = await holdBat(page);
    await page.goto('/?splash=full');
    const playing = await waitForSnapshot(page, (s) => splashOf(s)?.state === 'playing', SLOW_MS);
    ev.json('snapshot-playing', playing);
    // The rest of the manifest loads while the splash plays.
    expect(assetsOf(playing)?.loaded ?? 0).toBeLessThan(assetsOf(playing)?.total ?? 0);

    // `bat.json` stays held until the splash has ended, so loading is still running whatever the frame rate.
    const held = await waitForSnapshot(page, (s) => splashOf(s)?.state === 'holding', SLOW_MS);
    // Give the main thread one more snapshot so `splashEnded` has reached it.
    const s = await waitForSnapshot(page, (x) => loadingOf(x)?.visible === true, 30_000);
    ev.json('snapshot-holding', s);
    expect(splashOf(held)?.frame).toBe(209);
    expect(splashOf(s)?.frame).toBe(209);
    expect(loadingOf(s)).toMatchObject({ visible: true, held: true });
    expect(s.state).toBe('booting');
    expect(assetsOf(s)?.ready).toBe(false);
    const loading = page.locator('#loading');
    await expect(loading).toHaveText(/^Loading \d+\/86$/);
    const text = await loading.boundingBox();
    const canvas = await page.locator('#app canvas').boundingBox();
    if (!text || !canvas) throw new Error('missing bounding boxes');
    const geometry = {
      text,
      canvas,
      expectedTop: canvas.y + (canvas.height * 610) / 720,
      expectedCentreX: canvas.x + canvas.width / 2,
    };
    ev.json('geometry-holding', geometry);
    expect(Math.abs(text.x + text.width / 2 - geometry.expectedCentreX)).toBeLessThanOrEqual(2);
    expect(Math.abs(text.y - geometry.expectedTop)).toBeLessThanOrEqual(2);
    await ev.shot('holding');

    bat.release();
    const title = await waitForSnapshot(page, (x) => x.state === 'title', SLOW_MS);
    ev.json('snapshot-title', title);
    expect(assetsOf(title)?.ready).toBe(true);
    expect(assetsOf(title)?.placeholders).toEqual([]);
    await expect(loading).toHaveCount(0);
    await ev.shot('title');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('splash: the e2e default skips it and keeps the top-left loading text', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'splash-skipped');
  noteEvidence(testInfo, ev);
  try {
    const bat = await holdBat(page);
    await page.goto('/');
    const s = await waitForSnapshot(page, (x) => loadingOf(x)?.visible === true, SLOW_MS);
    ev.json('snapshot-loading', s);
    expect(splashOf(s)?.state).toBe('skipped');
    expect(loadingOf(s)?.held).toBe(false);
    const box = await page.locator('#loading').boundingBox();
    ev.json('geometry-loading', box);
    expect(box && box.x < 40 && box.y < 40).toBe(true);
    await ev.shot('loading-top-left');
    bat.release();
    const title = await waitForSnapshot(page, (x) => x.state === 'title', SLOW_MS);
    expect(splashOf(title)?.state).toBe('skipped');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
