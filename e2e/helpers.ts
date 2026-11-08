// Journey helpers for verify-game (#31). The canvas belongs to the game worker (ADR 0004), so state is read through
// the dev/e2e test bridge (`window.__vsTest`, packages/client/src/main/test-bridge.ts) and driven only with real
// keyboard input. Evidence goes under VERIFY_EVIDENCE_DIR (set by `pnpm verify:e2e`, default verification/adhoc/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import type { GameSnapshot } from '../packages/client/src/protocol/worker-messages';
import { PASSIVES } from '../packages/shared/src/content/passives';
import type { StatId } from '../packages/shared/src/content/stats';

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
 * Loads the game, waits for the title screen, presses Enter on "Start" (#9), then on the character select (#14)
 * presses ArrowRight `rightPresses` times (0: the default Warden; 1 Ember, 2 Swift, 3 Aurelia) and Enter: resolves
 * with the first `playing` snapshot. Real keyboard input; the run has a fresh random seed.
 */
export async function startRun(page: Page, path = '/', rightPresses = 0): Promise<GameSnapshot> {
  await openGame(page, path);
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  for (let i = 0; i < rightPresses; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  return waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
}

export interface AnswerLevelUpsOptions {
  /**
   * Picks the first card that is not a new weapon (a weapon upgrade, a passive or the heal) instead of `1`, falling
   * back to `1` when every card is a new weapon (#104): a journey that needs a crowd near the player keeps area
   * weapons such as Garlic out of the run.
   */
  avoidNewWeapons?: boolean;
  /**
   * With `avoidNewWeapons`, also ranks the other cards by how little they add to the kill rate (#104): a passive that
   * adds no damage, then the heal, then a passive that does (`DAMAGE_STATS`), then a weapon upgrade.
   */
  avoidDamage?: boolean;
}

/** Passive stats that make weapons kill faster: more damage, area, fire rate or projectiles. */
const DAMAGE_STATS: ReadonlySet<StatId> = new Set(['might', 'area', 'cooldown', 'amount']);
const DAMAGE_PASSIVES: ReadonlySet<string> = new Set(
  PASSIVES.filter((p) => p.perLevel.some((m) => DAMAGE_STATS.has(m.stat))).map((p) => p.name),
);

/** Lower is preferred; a new weapon is always last. */
function cardRank(kind: string | null, name: string, avoidDamage: boolean): number {
  if (kind === 'newWeapon' || kind === null) return 9;
  if (!avoidDamage) return 0;
  if (kind === 'newPassive' || kind === 'upgradePassive') return DAMAGE_PASSIVES.has(name) ? 2 : 0;
  if (kind === 'heal') return 1;
  return 3; // upgradeWeapon
}

/** The key to press for the level-up dialog's cards: the best-ranked card (`cardRank`), the first one on a tie. */
async function levelUpKey(page: Page, avoidDamage: boolean): Promise<string> {
  const cards = page.locator('[role="dialog"][aria-label="Level up"] button.card');
  await cards.first().waitFor({ timeout: 2_000 }); // the dialog mounts with the state change; never read it empty
  const found = await cards.evaluateAll((els) =>
    els.map((c) => ({
      kind: c.getAttribute('data-kind'),
      name: c.querySelector('.card-name')?.textContent ?? '',
    })),
  );
  let best = 0;
  for (let i = 1; i < found.length; i++) {
    const card = found[i];
    const top = found[best];
    if (
      card &&
      top &&
      cardRank(card.kind, card.name, avoidDamage) < cardRank(top.kind, top.name, avoidDamage)
    )
      best = i;
  }
  return String(best + 1);
}

/**
 * Answers every level-up dialog (#11) with a real key press while a journey that is not about level-ups plays a
 * run: since #11 a run pauses on each level-up, and a journey that waits for time to pass or for death would wait
 * forever. Presses `1` by default; `{ avoidNewWeapons: true }` presses the first card that is not a new weapon, and
 * `avoidDamage` also prefers cards that add no damage (#104).
 * Polls every 100 ms; returns the function that stops it (await it before the test ends) and resolves to the number
 * of dialogs answered.
 */
export function answerLevelUps(
  page: Page,
  options: AnswerLevelUpsOptions = {},
): () => Promise<number> {
  // An object, so the loop re-reads the flag the stop function clears.
  const control = { running: true };
  let answered = 0;
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        const s = await snapshot(page);
        if (s.state === 'levelUp') {
          await page.keyboard.press(
            options.avoidNewWeapons ? await levelUpKey(page, options.avoidDamage === true) : '1',
          );
          answered++;
        }
      } catch {
        // The page is navigating or closing; try again on the next poll.
      }
      await page.waitForTimeout(100).catch(() => undefined);
    }
  })();
  return async () => {
    control.running = false;
    await loop;
    return answered;
  };
}

/**
 * Fast-forwards the run with `]` (the dev-only `fastForward` key, a precondition only) until `timeS >= targetS`,
 * answering each level-up with `1` and closing each chest with Enter on the way (#17): a fast-forward stops advancing
 * at the first pending choice, so one press may cover less than 60 s. Long runs need invulnerability first (`I`, #17).
 * Calls `onPress` with the snapshot after each press; resolves with the first snapshot at or past `targetS`, or on the
 * results screen.
 */
export async function forwardTo(
  page: Page,
  targetS: number,
  onPress: (s: GameSnapshot) => Promise<void> | void = () => undefined,
): Promise<GameSnapshot> {
  for (let i = 0; i < 1000; i++) {
    const s = await snapshot(page);
    if (s.timeS >= targetS || s.state === 'results') return s;
    if (s.state === 'levelUp') await page.keyboard.press('1');
    else if (s.state === 'chest') await page.keyboard.press('Enter');
    else {
      await page.keyboard.press(']');
      await page.waitForTimeout(150);
      await onPress(await snapshot(page));
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`forwardTo: could not reach ${String(targetS)} s`);
}
