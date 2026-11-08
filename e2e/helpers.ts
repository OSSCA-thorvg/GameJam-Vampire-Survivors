// Journey helpers for verify-game (#31). The canvas belongs to the game worker (ADR 0004), so state is read through
// the dev/e2e test bridge (`window.__vsTest`, packages/client/src/main/test-bridge.ts) and driven only with real
// keyboard input. Evidence goes under VERIFY_EVIDENCE_DIR (set by `pnpm verify:e2e`, default verification/adhoc/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type { GameSnapshot } from '../packages/client/src/protocol/worker-messages';

export type { GameSnapshot };

interface VsTestApi {
  snapshot(): Promise<GameSnapshot>;
}

declare global {
  var __vsTest: VsTestApi | undefined;
}

const ROOT = resolve(import.meta.dirname, '..');

/** The evidence folder for one journey: `<VERIFY_EVIDENCE_DIR>/<journey>/`. */
export function evidencePath(journey: string): string {
  const base = process.env.VERIFY_EVIDENCE_DIR ?? join(ROOT, 'verification/adhoc');
  const dir = join(base, journey);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface Evidence {
  dir: string;
  /** Saves `<NN>-<name>.png`, numbered in the order taken. */
  shot(name: string): Promise<void>;
  /** Saves `<name>.json`. */
  json(name: string, value: unknown): void;
  /** Writes page-console.log and worker-console.log; call at the end (also in `finally`). */
  flush(): void;
  pageLog: string[];
  workerLog: string[];
}

/**
 * Starts collecting evidence for `page`: page console messages and page errors, and console messages of every
 * worker the page starts. Call before `page.goto`.
 */
export function startEvidence(page: Page, journey: string): Evidence {
  const dir = evidencePath(journey);
  const pageLog: string[] = [];
  const workerLog: string[] = [];
  const stamp = (): string => new Date().toISOString();
  page.on('console', (m) => {
    const where = m.type() === 'error' && m.location().url ? ` (${m.location().url})` : '';
    pageLog.push(`${stamp()} [${m.type()}] ${m.text()}${where}`);
  });
  page.on('pageerror', (e) => pageLog.push(`${stamp()} [pageerror] ${e.message}`));
  page.on('worker', (worker) => {
    workerLog.push(`${stamp()} [worker started] ${worker.url()}`);
    worker.on('console', (m) => workerLog.push(`${stamp()} [${m.type()}] ${m.text()}`));
  });
  let n = 0;
  return {
    dir,
    pageLog,
    workerLog,
    async shot(name) {
      n++;
      await page.screenshot({ path: join(dir, `${String(n).padStart(2, '0')}-${name}.png`) });
    },
    json(name, value) {
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
    },
    flush() {
      writeFileSync(join(dir, 'page-console.log'), pageLog.join('\n') + '\n');
      writeFileSync(join(dir, 'worker-console.log'), workerLog.join('\n') + '\n');
    },
  };
}

/** Page errors and console errors (including failed resource loads, with their URL) collected by `startEvidence`. */
export function pageErrors(ev: Evidence): string[] {
  return ev.pageLog.filter((l) => l.includes('[error]') || l.includes('[pageerror]'));
}

/** Attaches the journey's evidence folder to the Playwright report on failure (the trace is kept by the config). */
export function noteEvidence(testInfo: TestInfo, ev: Evidence): void {
  testInfo.annotations.push({ type: 'evidence', description: ev.dir });
}

/** One `__vsTest.snapshot()`; throws when the bridge is missing (production build or unsupported browser). */
export async function snapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    if (!globalThis.__vsTest)
      throw new Error('window.__vsTest is missing: not a dev or e2e build, or no game');
    return globalThis.__vsTest.snapshot();
  });
}

/** Polls `snapshot` every 50 ms until `predicate` holds; throws with the last snapshot after `timeoutMs`. */
export async function waitForSnapshot(
  page: Page,
  predicate: (s: GameSnapshot) => boolean,
  timeoutMs: number,
): Promise<GameSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: GameSnapshot | null = null;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      last = await snapshot(page);
      if (predicate(last)) return last;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `waitForSnapshot timed out after ${String(timeoutMs)} ms; last snapshot: ${JSON.stringify(last)} ${lastError}`,
  );
}

/** Holds `keys` (KeyboardEvent `key` names such as `ArrowRight` or `d`) for `ms`, then releases them in reverse. */
export async function holdKeys(page: Page, keys: string[], ms: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

/** Loads the game and waits until the worker reports `ready` (callers assert `renderer === 'gl'`). */
export async function openGame(page: Page, path = '/'): Promise<GameSnapshot> {
  await page.goto(path);
  return waitForSnapshot(page, (s) => s.ready, 30_000);
}

/**
 * Loads the game, waits for the title screen and presses Enter on "Start" (#9): resolves with the first `playing`
 * snapshot. Real keyboard input; the run has a fresh random seed.
 */
export async function startRun(page: Page, path = '/'): Promise<GameSnapshot> {
  await openGame(page, path);
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  await page.keyboard.press('Enter');
  return waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
}
