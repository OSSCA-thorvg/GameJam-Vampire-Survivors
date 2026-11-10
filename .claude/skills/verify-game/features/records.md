# Personal records

Single-player runs leave a record in the browser (#143, ADR 0022): bests per character and overall, lifetime totals, the last 10 runs and the best damage per weapon, kept in `localStorage['vs.records']` on the main thread, shown as "New best!" badges on the results screen, as the best time and a `Cleared` mark on the character cards, and on a Records screen opened from the title. Versus matches are never recorded.

## Sub-features

- **Snapshot field `records`** (main thread, dev and e2e builds; `App.recordsSnapshot()`): `{ data, lastBreaks, persisted }`. `data` is the stored document `{ v: 1, overall, characters, totals, recent, weaponBest }` (`overall` and `characters[id]`: `{ timeSec, kills, level, cleared }`; `totals`: `{ runs, kills, clears, playTimeSec }`; `recent`: newest first, at most 10 `{ at, characterId, timeSec, kills, level, cleared }`; `weaponBest`: best single-run damage by weapon ID). `lastBreaks` is what the last recorded run broke (`{ timeSec, kills, level }` each `'overall' | 'character' | null`, `firstClear`, `weapons: string[]`), `null` before any run and after a reset. `persisted` is false once a save failed this session.
- **Recording:** a single-player run is recorded once, when the app moves from `playing` to `results` on `gameOver`; `totals.runs` rises by 1, `recent[0]` holds that run (`timeSec`, `kills`, `level`, `cleared`, `characterId`) and `vs.records` holds the same JSON. A run quit from the pause screen is not recorded. A versus match never is (`totals.runs` and `recent` unchanged on both pages).
- **Results badges:** each broken item gets `span.new-best` inside its `dd`, after the value: `data-best="time"` on Survived, `kills` on Kills, `level` on Level, with `data-scope="overall"` and the text "New best! (all characters)" when it beat the best over every character, or `data-scope="character"` and "New best!" when it beat only the character's own best. A weapon row whose damage beat its stored best gets "New best!" with `data-best="weapon"` and `data-weapon="<id>"` (an evolved weapon has its own ID). A character's first clear shows "First clear!" (`data-best="clear"`) after the heading. An item equal to or below its best has no badge. The first run ever marks every non-zero item `overall`. `[data-stat="time"|"kills"|"level"]` is a `span` holding only the value.
- **Character cards:** each card shows `Best mm:ss` (`[data-best-time="<id>"]`, `Best --:--` without a record) and `.character-cleared` "Cleared" only for a character that cleared 15:00; both purposes (single and versus).
- **Title:** three buttons, "Start" (focused), "Multiplayer", "Records"; ArrowDown twice and Enter opens Records (`state: 'records'`).
- **Records screen:** heading "Records"; "Bests" table (`[data-best-row="overall"|"<id>"]`, cells Time, Kills, Level, Cleared `Yes`/`-`; a character without a record reads `--:--`, `0`, `0`, `-`); "Totals" (Runs, Kills, Clears, Play time `H:MM:SS`); "Last 10 runs" (`li[data-run-index]`, newest first: `YYYY-MM-DD HH:MM · <name> · mm:ss · n kills · Lv n · Stage cleared|Game over`), or "No runs yet."; "Weapon bests" (`[data-list="weapon-bests"]`, content order, only weapons with a best, hidden when empty); "Back" (focused) and "Reset records". Escape or Back returns to the title.
- **Reset:** "Reset records" shows an in-page `role="alertdialog"` ("Delete all records? This cannot be undone.", "Cancel" focused, "Delete records"), and disables Back and Reset records. Cancel (or Escape) keeps everything and focuses "Reset records"; "Delete records" shows "No runs yet.", focuses "Back", removes `vs.records` only (`vs.audio` and `vs.nickname` stay) and sets `lastBreaks` to `null`. No native dialog (`alert`, `confirm`, `prompt`) ever fires.
- **Resilience:** an unknown version, corrupt JSON, an extra or missing field, or an out-of-range value in `vs.records` loads as empty records with exactly one console warning `[records] stored records were unreadable …`; the value stays until the next run overwrites it with a valid `v: 1` document. A `setItem` that throws (quota) keeps the records in memory: the results screen and its badges still show, `persisted` is false, one warning `[records] failed to save records …`, `runtimeErrors` 0.

## How to get to it (user POV)

Open the game URL; the Records button is the title's third button. A run ends when the player dies (stand still for about 1–2 minutes as Warden since #148, sometimes longer). Debug keys used only for preconditions: `I` (invulnerable) and `]` (fast-forward 60 s) to reach a long run or 15:00 (`stage-and-finale.md`). Journey 6 needs the server (`cp -n .env.example .env`, `pnpm verify:launch --with-server`) and two browser contexts as in `versus-match.md` journey 1.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `localStorage.removeItem('vs.records')` and `navigate` again so the records start empty.
2. `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'title', 30000)).state`; `computer` `key` `ArrowDown` twice, `key` `Return` → `state: "records"`; `get_page_text` → "No runs yet." and the zero rows; `screenshot`; `key` `Escape` → `state: "title"`.
3. `key` `Return` twice (Warden), stand still, pressing `1` on each level-up, until `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'results', 120000)).state`; `find` "New best badges" → Survived and Level "New best! (all characters)" (Kills too when non-zero); `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).records)` → `totals.runs` 1, `recent[0]` equal to the shown values; `screenshot`.
4. `navigate` again (reload); title → Records → one run in "Last 10 runs" with the same time; Escape, Enter → the Warden card reads `Best mm:ss`; `screenshot`.
5. Escape; Records → ArrowDown → Enter on "Reset records" → `read_page` shows the alertdialog with "Cancel" focused; Enter (Cancel) → the run is still listed; Enter, ArrowRight, Enter ("Delete records") → "No runs yet."; `javascript_tool` `[localStorage.getItem('vs.records'), localStorage.getItem('vs.audio')]` → `null` and the audio settings unchanged.
6. For a clear: title → Start → ArrowRight twice (Swift) → Enter, `key` `i`, `key` `]` (answering level-ups with `1`, chests with Enter) until `timeS` ≥ 900, `key` `i`, wait for Death → "Stage cleared", "First clear!", a weapon "New best!"; title → Start → Swift's card shows "Cleared"; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/records.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "records [1-5]"`; journey 6 needs `pnpm verify:launch --with-server` and `-g "records 6"`. Headless only (`--project chromium`, never `VERIFY_HEADED`). Evidence: `records-1-first-run/` (`first-run.json`, screenshots of the empty Records screen, the results, Records after the reload and the Warden card), `records-2-beating/runs.json`, `records-3-clear/` (`clear.json`, `weapon-bests.json`), `records-4-reset/reset.json`, `records-5-resilience/corrupt.json`, `records-5-quota/quota.json` and `records-6-versus/{a,b}/` with `versus-records.json`; every folder has `page-console.log` and `worker-console.log`.

```ts
// Feature-map journeys for .claude/skills/verify-game/features/records.md (#143, ADR 0022). Keyboard first, headless;
// `I` and `]` only reach a long run. Every journey fails if a native dialog (alert/confirm/prompt) fires.
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  answerLevelUps,
  forwardTo,
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from '../../../e2e/helpers';

interface BestSet {
  timeSec: number;
  kills: number;
  level: number;
  cleared: boolean;
}
interface RecentRun extends BestSet {
  at: number;
  characterId: string;
}
interface RecordsSnap {
  data: {
    v: number;
    overall: BestSet;
    characters: Record<string, BestSet>;
    totals: { runs: number; kills: number; clears: number; playTimeSec: number };
    recent: RecentRun[];
    weaponBest: Record<string, number>;
  };
  lastBreaks: {
    timeSec: string | null;
    kills: string | null;
    level: string | null;
    firstClear: boolean;
    weapons: string[];
  } | null;
  persisted: boolean;
}
const recordsOf = (s: GameSnapshot): RecordsSnap => s.records as RecordsSnap;

/** Fails the journey on any native dialog (the browser rules forbid them). */
function noDialogs(page: Page, ev: Evidence): string[] {
  const seen: string[] = [];
  page.on('dialog', (d) => {
    seen.push(`${d.type()}: ${d.message()}`);
    ev.pageLog.push(`[dialog] ${d.type()} ${d.message()}`);
    void d.dismiss();
  });
  return seen;
}

const recordsWarnings = (ev: Evidence): string[] =>
  ev.pageLog.filter((l) => l.includes('[warning]') && l.includes('[records]'));

async function toTitle(page: Page): Promise<void> {
  expect((await openGame(page)).renderer).toBe('gl');
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
}

/** Title → Records (ArrowDown twice, Enter). */
async function openRecords(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Records' })).toBeFocused();
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'records', 5_000);
  await expect(page.getByRole('heading', { level: 2, name: 'Records' })).toBeVisible();
}

/** From the title: Start, `rightPresses` × ArrowRight, Enter; resolves on `playing`. */
async function startFromTitle(page: Page, rightPresses = 0): Promise<void> {
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  for (let i = 0; i < rightPresses; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
}

/** Stands still (answering level-ups with `1`) until the results screen. */
async function standUntilResults(page: Page, timeoutMs = 120_000): Promise<GameSnapshot> {
  const stop = answerLevelUps(page);
  try {
    return await waitForSnapshot(page, (s) => s.state === 'results', timeoutMs);
  } finally {
    await stop();
  }
}

/** The badges on the results screen. */
async function badges(page: Page) {
  return page.locator('.new-best').evaluateAll((els) =>
    els
      .filter((e) => !(e as HTMLElement).hidden)
      .map((e) => ({
        best: e.getAttribute('data-best'),
        scope: e.getAttribute('data-scope'),
        weapon: e.getAttribute('data-weapon'),
        text: e.textContent,
      })),
  );
}

async function resultValues(page: Page) {
  return {
    heading: await page.getByRole('heading', { level: 2 }).textContent(),
    time: await page.locator('[data-stat="time"]').textContent(),
    kills: await page.locator('[data-stat="kills"]').textContent(),
    level: await page.locator('[data-stat="level"]').textContent(),
  };
}

const clock = (sec: number): string => {
  const t = Math.floor(sec);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

test('records 1: empty Records screen, first run marks every best overall, survives a reload, card shows Best', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'records-1-first-run');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await toTitle(page);
    await openRecords(page);
    await expect(page.getByText('No runs yet.')).toBeVisible();
    for (const row of ['overall', 'warden', 'ember', 'swift', 'aurelia'])
      expect(await page.locator(`[data-best-row="${row}"] td`).allTextContents()).toEqual([
        row === 'overall' ? '00:00' : '--:--',
        '0',
        '0',
        '-',
      ]);
    await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
    await ev.shot('records-empty');
    await page.keyboard.press('Escape');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);

    await startFromTitle(page);
    const over = await standUntilResults(page);
    const dom = await resultValues(page);
    const shown = await badges(page);
    const rec = recordsOf(over);
    await ev.shot('results-first-run');
    ev.json('first-run', { dom, badges: shown, records: rec });
    expect(shown.find((b) => b.best === 'time')).toMatchObject({
      scope: 'overall',
      text: 'New best! (all characters)',
    });
    expect(shown.find((b) => b.best === 'level')).toMatchObject({ scope: 'overall' });
    if (Number(dom.kills) > 0)
      expect(shown.find((b) => b.best === 'kills')).toMatchObject({ scope: 'overall' });
    expect(rec.data.totals.runs).toBe(1);
    expect(rec.persisted).toBe(true);
    const first = rec.data.recent[0];
    expect(first?.characterId).toBe('warden');
    expect(clock(first?.timeSec ?? -1)).toBe(dom.time);
    expect(String(first?.kills)).toBe(dom.kills);
    expect(String(first?.level)).toBe(dom.level);
    expect(first?.cleared).toBe(false);

    await page.reload();
    await toTitle(page);
    await openRecords(page);
    const runs = page.locator('[data-run-index]');
    await expect(runs).toHaveCount(1);
    await expect(runs.first()).toContainText(dom.time ?? 'missing');
    await expect(runs.first()).toContainText('Warden');
    await expect(runs.first()).toContainText('Game over');
    await ev.shot('records-after-reload');
    await page.keyboard.press('Escape');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await expect(page.locator('[data-best-time="warden"]')).toHaveText(`Best ${dom.time ?? ''}`);
    await expect(page.locator('[data-best-time="ember"]')).toHaveText('Best --:--');
    await expect(page.locator('.character-cleared')).toHaveCount(0);
    await ev.shot('select-warden-best');
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('records 2: a longer run beats the time, a shorter one does not; recent is newest first', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const ev = startEvidence(page, 'records-2-beating');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await toTitle(page);
    await startFromTitle(page);
    const one = await standUntilResults(page);
    const t1 = recordsOf(one).data.overall.timeSec;
    await ev.shot('run-1');

    // Retry; a long run as precondition only: I, ] past the first run's time, I off, then stand to death.
    await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused();
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    await forwardTo(page, Math.min(t1 + 60, 120));
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === false, 2_000);
    const two = await standUntilResults(page);
    const shown2 = await badges(page);
    await ev.shot('run-2-longer');
    expect(recordsOf(two).data.recent[0]?.timeSec ?? 0).toBeGreaterThan(t1);
    expect(shown2.find((b) => b.best === 'time')).toMatchObject({ scope: 'overall' });

    await page.keyboard.press('Enter'); // Retry
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    const three = await standUntilResults(page);
    const shown3 = await badges(page);
    await ev.shot('run-3-shorter');
    const rec = recordsOf(three);
    ev.json('runs', { t1, badges2: shown2, badges3: shown3, records: rec });
    expect(rec.data.recent[0]?.timeSec ?? Infinity).toBeLessThan(rec.data.overall.timeSec);
    expect(shown3.find((b) => b.best === 'time')).toBeUndefined();
    expect(rec.data.totals.runs).toBe(3);
    expect(rec.data.recent).toHaveLength(3);
    const at = rec.data.recent.map((r) => r.at);
    expect([...at].sort((a, b) => b - a)).toEqual(at);
    expect(rec.data.recent[1]?.timeSec).toBe(rec.data.overall.timeSec);
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('records 3: a Swift clear shows First clear!, weapon bests, the Cleared card and Records row', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const ev = startEvidence(page, 'records-3-clear');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await toTitle(page);
    await startFromTitle(page, 2); // Swift
    expect((await snapshot(page)).characterId).toBe('swift');
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    await forwardTo(page, 900);
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === false, 2_000);
    const over = await standUntilResults(page, 60_000);
    const dom = await resultValues(page);
    const shown = await badges(page);
    const rec = recordsOf(over);
    const runWeapons = await page.locator('[data-list="weapons"] dt').allTextContents();
    await ev.shot('results-stage-cleared');
    ev.json('clear', { dom, badges: shown, runWeapons, records: rec });
    expect(dom.heading).toBe('Stage cleared');
    expect(shown.find((b) => b.best === 'clear')?.text).toBe('First clear!');
    const knifeLike = shown.filter(
      (b) => b.best === 'weapon' && (b.weapon === 'knife' || b.weapon === 'thousandEdge'),
    );
    expect(knifeLike.length).toBe(1);
    expect(rec.data.characters.swift?.cleared).toBe(true);
    expect(rec.data.totals.clears).toBe(1);

    await page.getByRole('button', { name: 'Title' }).focus();
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await expect(page.locator('[data-character="swift"] .character-cleared')).toHaveText('Cleared');
    await expect(page.locator('[data-character="warden"] .character-cleared')).toHaveCount(0);
    await expect(page.locator('[data-best-time="swift"]')).toHaveText(`Best ${dom.time ?? ''}`);
    await ev.shot('select-swift-cleared');
    await page.keyboard.press('Escape');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await openRecords(page);
    expect(await page.locator('[data-best-row="swift"] td').allTextContents()).toEqual([
      dom.time,
      dom.kills,
      dom.level,
      'Yes',
    ]);
    const listed = await page.locator('[data-list="weapon-bests"] dt').allTextContents();
    ev.json('weapon-bests', { listed, runWeapons });
    for (const w of runWeapons) expect(listed).toContain(w.replace(/ Lv \d+$/, ''));
    await ev.shot('records-swift-cleared');
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('records 4: Reset asks in page, Cancel keeps, Delete removes only vs.records', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'records-4-reset');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await toTitle(page);
    await startFromTitle(page);
    await standUntilResults(page);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Title' })).toBeFocused();
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.locator('#sound-toggle').click();
    await waitForSnapshot(page, (s) => (s.audio as { muted: boolean }).muted, 2_000);
    const audioBefore = await page.evaluate(() => localStorage.getItem('vs.audio'));
    expect(audioBefore).toContain('"muted":true');
    // The toggle took focus; the title menu's arrows still start from Start.
    await page.getByRole('button', { name: 'Start' }).focus();
    await openRecords(page);
    await expect(page.locator('[data-run-index]')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Reset records' })).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Delete all records? This cannot be undone.');
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();
    await ev.shot('confirm');
    await page.keyboard.press('Enter'); // Cancel
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-run-index]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reset records' })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('vs.records'))).not.toBeNull();
    await ev.shot('after-cancel');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Delete records' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('No runs yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
    const stored = await page.evaluate(() => ({
      records: localStorage.getItem('vs.records'),
      audio: localStorage.getItem('vs.audio'),
    }));
    expect(stored.records).toBeNull();
    expect(stored.audio).toBe(audioBefore);
    const after = recordsOf(await snapshot(page));
    expect(after.data.totals.runs).toBe(0);
    expect(after.lastBreaks).toBeNull();
    await ev.shot('after-delete');
    await page.reload();
    await toTitle(page);
    expect((await snapshot(page)).audio).toMatchObject({ muted: true });
    await openRecords(page);
    await expect(page.getByText('No runs yet.')).toBeVisible();
    ev.json('reset', { audioBefore, stored, after });
    await ev.shot('after-reload');
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('records 5: a corrupt value warns once and is overwritten; a quota failure keeps the run working', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'records-5-resilience');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await toTitle(page);
    await page.evaluate(() => {
      localStorage.setItem('vs.records', '{"v":99}');
    });
    await page.reload();
    await toTitle(page);
    await openRecords(page);
    await expect(page.getByText('No runs yet.')).toBeVisible();
    await page.keyboard.press('Escape');
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    // The corrupt value stays until the next save.
    expect(await page.evaluate(() => localStorage.getItem('vs.records'))).toBe('{"v":99}');
    await startFromTitle(page);
    await standUntilResults(page);
    const saved = await page.evaluate(() => localStorage.getItem('vs.records'));
    const parsed = JSON.parse(saved ?? 'null') as { v: number; totals: { runs: number } };
    expect(parsed.v).toBe(1);
    expect(parsed.totals.runs).toBe(1);
    expect(recordsWarnings(ev)).toHaveLength(1);
    expect(recordsWarnings(ev)[0]).toContain('unreadable');
    await ev.shot('corrupt-overwritten');
    ev.json('corrupt', { warnings: recordsWarnings(ev), saved: parsed });
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
  await quota(browser, testInfo);
});

async function quota(
  browser: Browser,
  testInfo: Parameters<typeof noteEvidence>[0],
): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const ev = startEvidence(page, 'records-5-quota');
  noteEvidence(testInfo, ev);
  const dialogs = noDialogs(page, ev);
  try {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'vs.records') throw new DOMException('quota (test)', 'QuotaExceededError');
        original.call(this, key, value);
      };
    });
    await toTitle(page);
    await startFromTitle(page);
    const over = await standUntilResults(page);
    const shown = await badges(page);
    const rec = recordsOf(over);
    await ev.shot('quota-results');
    ev.json('quota', { badges: shown, records: rec, warnings: recordsWarnings(ev) });
    expect(shown.find((b) => b.best === 'time')).toMatchObject({ scope: 'overall' });
    expect(rec.persisted).toBe(false);
    expect(rec.data.totals.runs).toBe(1);
    expect(recordsWarnings(ev)).toHaveLength(1);
    expect(recordsWarnings(ev)[0]).toContain('failed to save');
    expect(over.runtimeErrors).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('vs.records'))).toBeNull();
    // Retry still works and keeps the in-memory records.
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    const again = await standUntilResults(page);
    expect(recordsOf(again).data.totals.runs).toBe(2);
    expect(recordsWarnings(ev)).toHaveLength(1);
    expect(dialogs).toEqual([]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
    await context.close();
  }
}

// Journey 6 needs the Docker server (`pnpm verify:launch --with-server`, or `pnpm server:up` with the client's origin in
// ALLOWED_ORIGINS); run it with `-g "records 6"`. Two players meet as in versus-match.md journey 1.
async function versusPlayer(browser: Browser, journey: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const ev = startEvidence(page, journey);
  const dialogs = noDialogs(page, ev);
  await toTitle(page);
  return { page, ev, dialogs, context };
}

async function toEntry(page: Page): Promise<void> {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 5_000 });
}

test('records 6: a versus match changes no record on either page', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await versusPlayer(browser, 'records-6-versus/a');
  const b = await versusPlayer(browser, 'records-6-versus/b');
  noteEvidence(testInfo, a.ev);
  try {
    // A plays one single-player run first, so there is something that must not change.
    await startFromTitle(a.page);
    await standUntilResults(a.page);
    await a.page.keyboard.press('ArrowDown');
    await a.page.keyboard.press('Enter'); // Title
    await waitForSnapshot(a.page, (s) => s.state === 'title', 5_000);
    const before = {
      a: recordsOf(await snapshot(a.page)).data,
      b: recordsOf(await snapshot(b.page)).data,
    };
    const storedBefore = {
      a: await a.page.evaluate(() => localStorage.getItem('vs.records')),
      b: await b.page.evaluate(() => localStorage.getItem('vs.records')),
    };
    expect(before.a.totals.runs).toBe(1);
    expect(before.b.totals.runs).toBe(0);

    await toEntry(a.page);
    await a.page.keyboard.type('Alice');
    await a.page.keyboard.press('Enter');
    await waitForSnapshot(a.page, (s) => s.state === 'lobby', 10_000);
    const code = (await a.page.locator('.room-code').textContent()) ?? '';
    await toEntry(b.page);
    await b.page.keyboard.type('Bob');
    await b.page.getByRole('button', { name: 'Join room' }).click();
    await b.page.keyboard.type(code);
    await b.page.keyboard.press('Enter');
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 10_000);
    for (const p of [a, b]) {
      await expect(p.page.getByRole('button', { name: 'Ready' })).toBeEnabled({ timeout: 10_000 });
      await p.page.getByRole('button', { name: 'Ready' }).focus();
      await p.page.keyboard.press('Enter');
    }
    const start = a.page.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled();
    await start.focus();
    await a.page.keyboard.press('Enter');
    for (const p of [a, b])
      await waitForSnapshot(p.page, (s) => s.state === 'versusPlaying', 15_000);
    await a.ev.shot('versus-playing');
    // Both stand still (answering level-ups) until both see the versus result.
    // In versus the dialogs are an overlay on `versusPlaying` (#20), so they are answered here.
    const deadline = Date.now() + 180_000;
    for (;;) {
      const snaps = await Promise.all([snapshot(a.page), snapshot(b.page)]);
      if (snaps.every((s) => s.state === 'versusResult')) break;
      if (Date.now() > deadline)
        throw new Error(`no versus result: ${JSON.stringify(snaps.map((s) => s.state))}`);
      for (const [i, s] of snaps.entries()) {
        const page = (i === 0 ? a : b).page;
        const overlay = (s.versus as { overlay: string | null } | null)?.overlay ?? null;
        if (overlay === 'levelUp') await page.keyboard.press('1');
        else if (overlay === 'chest') await page.keyboard.press('Enter');
      }
      await a.page.waitForTimeout(150);
    }
    await a.ev.shot('versus-result-a');
    await b.ev.shot('versus-result-b');
    const after = {
      a: recordsOf(await snapshot(a.page)).data,
      b: recordsOf(await snapshot(b.page)).data,
    };
    const storedAfter = {
      a: await a.page.evaluate(() => localStorage.getItem('vs.records')),
      b: await b.page.evaluate(() => localStorage.getItem('vs.records')),
    };
    a.ev.json('versus-records', { code, before, after, storedBefore, storedAfter });
    expect(after).toEqual(before);
    expect(storedAfter).toEqual(storedBefore);
    expect([...a.dialogs, ...b.dialogs]).toEqual([]);
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    a.ev.flush();
    b.ev.flush();
    await a.context.close();
    await b.context.close();
  }
});
```

## Gotchas

- Records persist across reloads of the same browser profile; Playwright gives each test a fresh context, so each journey starts empty. With Claude in Chrome, clear `vs.records` first (step 1) or the first-run badges do not appear (2026-11-09, #143).
- Dev-key runs (`I`, `]`) are recorded like any other run in dev and e2e builds; journeys use them only to reach a long run or 15:00, and the records they leave are the ones checked (2026-11-09, #143).
- The store reads `vs.records` lazily, on the first call (the Records screen, the character select or a run's end), so the corrupt-data warning appears on the first of these after a reload, not at boot (2026-11-09, #143).
- Journey 2's second run uses `]` until past the first run's time (at most 120 s) so it is strictly longer; journey 3 takes about 2–4 minutes headless (2026-11-09, #143).
- `#sound-toggle` takes focus when clicked; journey 4 focuses "Start" again before ArrowDown twice reaches "Records" (2026-11-09, #143).
