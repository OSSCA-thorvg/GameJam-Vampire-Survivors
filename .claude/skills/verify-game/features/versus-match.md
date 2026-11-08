# Versus match

A 2-player versus match (#20, ADRs 0004, 0005, 0006, 0009, 0011): after the lobby countdown each player plays the full stage in their own world from the shared seed, sees the opponent's live status in a panel, and lands on a Win, Lose or Draw result with Rematch.

## Sub-features

- **Start:** at the countdown's zero both pages switch to `state: 'versusPlaying'`; the worker logs `[worker] background policy: simulate` and `[worker] run started, seed <matchStart.seed>`. Snapshot `mode: 'versus'`. Escape does not pause and a hidden tab keeps simulating.
- **Same seed:** with no movement for the first 10 s of simulated time, the two pages' `spawnLog` entries (`{ enemyId, timeS }`, the first 64 spawner spawns) with `timeS < 10` are identical. After that the worlds diverge with input; they are never synchronized.
- **Status relay:** each page sends `status { hp, maxHp, level, kills, alive, elapsedMs }` 2–4 times per second (never two within 250 ms: the client waits 260 ms) and receives the opponent's `peerStatus` at the same rate. The panel (`aside` "Opponents", top right) shows one row per opponent: nickname (`.opponent-name`), an HP bar (`role="meter"` "HP", `aria-valuetext` `hp / maxHp`), `Lv n` and `Kills n`; the values change while the other player plays, and HP falls while the other is hit.
- **Badges** (`data-badge` on `.opponent`): `away` while the opponent's tab is hidden (`peerAway`), `disconnected` when their socket closed (`roomState.connected: false`), `dead` and `forfeited` (`playerEliminated` `died`/`afk`); an eliminated row is greyed and struck through (`data-out="true"`).
- **Death:** the dead player's world freezes, dimmed to 40%, under the ThorVG line "You were defeated - waiting for the match to end" (snapshot `defeated: true`); it sends `died { kills, elapsedMs }`. When the result arrives the survivor sees "Win", the dead player "Lose" (`.versus-result h2`), without a reload. The ranking table lists nickname (" (you)" on this player), "alive" or why the player is out ("dead", "disconnected", "forfeited"), and kills. On `matchResult` the worker gets `forceEnd`: its `steps` stop and the last frame stays under the result.
- **Disconnect:** closing one page mid-match shows `disconnected` on the other's panel at once; about 10 s later (`DISCONNECT_GRACE_MS`) the other gets `playerEliminated { reason: 'disconnected' }` and "Win".
- **Hidden tab (AFK):** hiding a page sends `visibility { hidden: true }`; its world keeps simulating (`timeS` advances by about the hidden time) and the opponent's row shows `away` within a second. Back within 30 s clears it. Hidden for 30 s (`AFK_FORFEIT_MS`) forfeits: the opponent gets "Win" and the ranking shows the forfeited player as "forfeited"; the forfeited page shows "Lose" when it returns.
- **Time limit:** a versus run never spawns Death. At 15:00 each world ends with `cleared: true`, sends `survived { kills }` and shows "Survived! Waiting for others" (`.versus-banner`); when both survived the most kills win, equal kills draw.
- **Server deadline (#60):** a `matchResult` that arrives at `startAt` + limit + 10 s while this world is still playing (behind the wall clock after level-ups) ends the match the same way, with the note "Time ran out on the server: you were counted as survived with your last reported kills." (`.versus-result .note`); a player who survived and waited until the deadline sees the note about players who had not finished.
- **Server lost:** when the socket leaves `open` during the match the banner says "Disconnected from server — result unavailable", nothing more is sent, the world plays on, and the local end shows "Unofficial result" with the local time, kills and level and only "Leave". Snapshot `versus.offline: true`.
- **Rematch and Leave:** Rematch returns both to the same room's lobby (`state: 'lobby'`, same `.room-code`), showing "Waiting for the room to reset" until the server's reset 5 s after the result, then every row `data-ready="false"` and Ready enabled. Leave sends `leaveRoom` and returns to the title.
- **Dialogs:** level-ups and chests still open over the versus world and pause only it (`versus.overlay` is `'levelUp'` or `'chest'`; `state` stays `'versusPlaying'`); while one is open no `status` is sent.
- **Single player** is unchanged: `mode: 'single'`, no game WebSocket, no panel, #17's results screen on death.
- Snapshot fields: `spawnLog`, `mode`, `defeated` (worker), `versus` (`{ overlay, offline }` or `null`, main) and `state` (`'versusPlaying'`, `'versusResult'`).

## How to get to it (user POV)

Server needed (`lobby.md`): `cp -n .env.example .env`, `pnpm verify:launch --with-server`, two browser contexts, then in both: title → Multiplayer → character → nickname; A creates a room, B joins with A's code, both press Ready, A presses Start; the match starts when the countdown ends. Debug keys used only for preconditions: `I` (invulnerable, so a player survives long enough or never dies) and `]` (fast-forward 60 s, to reach 15:00). The hidden-tab journey needs a desktop session (headed Chromium). The deadline journey needs a server with the test-only short limit (`room-server.md` § Deadline journey); the server-lost journey stops and restarts your own server.

## Driving it

### Claude in Chrome

The extension drives one Chrome profile; two tabs are two players (`lobby.md`).

1. Reach the countdown in tabs A and B as in `lobby.md` steps 1–4; `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'versusPlaying', 10000)).mode` → `"versus"` in both.
2. Same seed: press nothing for 12 s (press `1` on a level-up dialog in both tabs); `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).spawnLog.filter((e) => e.timeS < 10))` in each → equal strings.
3. Panel: in B press `i`, hold ArrowRight a few seconds; `read_page` in A → the "Opponents" row for Bob changes `Lv`/`Kills`; `read_network_requests` is not enough for WebSocket frames, so count the rate with the Playwright journey.
4. Death: A stands still → `screenshot` of the dimmed world with the defeat line, then "Lose" in A and "Win" in B (`find` the heading).
5. Rematch in both (`find` "Rematch button", `left_click`) → both lobbies with the same code, ready cleared after about 5 s.
6. Disconnect: start again, close tab A (`tabs_close_mcp`); B shows "disconnected" at once and "Win" about 10 s later.
7. Hidden tab: the extension cannot hide its own tab natively; ask the person to switch away from tab A for 20 s and back, then for 35 s, and record B's badges and result (`hidden-tab.md`). The Playwright native journey is the automated level-5 proof.
8. 15:00: start again; in both tabs `i`, then `]` repeatedly (answer dialogs with `1`/Enter) until 15:00; neither world shows Death (`(await __vsTest.snapshot()).bosses` has no `death`); both show the result decided by kills.

### Playwright

Save these files under `verification/issue-<N>/journeys/` (the native spec in `journeys/native/`). After `pnpm verify:launch --with-server` and `pnpm verify:doctor`:

- `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g versus` runs journeys 1–4; add `VERIFY_SERVER_CONTROL=1` for journey 7 (own server only) and `VERIFY_DEADLINE=1` for journey 6 (against the short-limit server only).
- `VERIFY_JOURNEYS=verification/issue-<N>/journeys/native VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project hidden-tab` runs journey 5 (Linux: prefix `xvfb-run -a`).

Evidence per journey and player: `versus-<n>-<name>/<a|b>/` with screenshots, `page-console.log`, `worker-console.log`, `ws-frames.log` and JSON (`spawn-logs.json`, `panel-rate.json`, `hp-seen-by-b.json`, `death.json`, `disconnect.json`, `time-limit.json`, `single.json`, `hidden-20s.json`, `hidden-35s.json`, `deadline.json`, `offline.json`).

`versus-helpers.ts`:

```ts
// Shared helpers for the versus-match journeys (#20): two players in separate browser contexts (or browsers) against
// the Docker server, keyboard first, every game-socket frame recorded with its time.
import { writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  openGame,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from '../../../e2e/helpers';

export interface Frame {
  t: number;
  dir: '→' | '←';
  type: string;
  body: string;
}

export interface Player {
  page: Page;
  ev: Evidence;
  frames: Frame[];
  log: string[];
  close(): Promise<void>;
}

/** A player on the title screen in `context` (a fresh one from `browser` unless given), recording game-socket frames. */
export async function player(
  source: Browser | BrowserContext | Page,
  journey: string,
  ownContext = true,
  url = '/',
): Promise<Player> {
  const context =
    'newContext' in source
      ? await source.newContext({ viewport: { width: 1280, height: 720 } })
      : 'goto' in source
        ? source.context()
        : source;
  const page = 'goto' in source ? source : await context.newPage();
  const ev = startEvidence(page, journey);
  const frames: Frame[] = [];
  const log: string[] = [];
  page.on('websocket', (ws) => {
    if (new URL(ws.url()).pathname !== '/ws') return;
    log.push(`${String(Date.now())} open ${ws.url()}`);
    const note = (dir: '→' | '←', payload: string | Buffer) => {
      const body = String(payload);
      let type = '?';
      try {
        type = (JSON.parse(body) as { type: string }).type;
      } catch {
        // not JSON
      }
      frames.push({ t: Date.now(), dir, type, body });
      log.push(`${String(Date.now())} ${dir} ${body}`);
    };
    ws.on('framesent', (f) => note('→', f.payload));
    ws.on('framereceived', (f) => note('←', f.payload));
    ws.on('close', () => log.push(`${String(Date.now())} close`));
  });
  expect((await openGame(page, url)).renderer).toBe('gl');
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  return {
    page,
    ev,
    frames,
    log,
    async close() {
      writeFileSync(joinPath(ev.dir, 'ws-frames.log'), log.join('\n') + '\n');
      ev.flush();
      if (ownContext && !page.isClosed()) await page.close();
      if (ownContext && 'newContext' in source) await context.close();
    },
  };
}

async function toEntry(page: Page): Promise<void> {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 5_000 });
}

/** A creates a room as Alice, B joins as Bob; both end in the lobby. Returns the code. */
export async function meet(a: Player, b: Player): Promise<string> {
  await toEntry(a.page);
  await a.page.keyboard.type('Alice');
  await a.page.keyboard.press('Enter');
  await waitForSnapshot(a.page, (s) => s.state === 'lobby', 5_000);
  const code = (await a.page.locator('.room-code').textContent()) ?? '';
  await toEntry(b.page);
  await b.page.keyboard.type('Bob');
  await b.page.getByRole('button', { name: 'Join room' }).click();
  await b.page.keyboard.type(code);
  await b.page.keyboard.press('Enter');
  await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
  return code;
}

/** Both press Ready (Enter), the host presses Start; resolves when both pages are in `versusPlaying`. */
export async function startMatch(a: Player, b: Player): Promise<void> {
  for (const p of [a, b]) {
    await expect(p.page.getByRole('button', { name: 'Ready' })).toBeEnabled({ timeout: 10_000 });
    await p.page.getByRole('button', { name: 'Ready' }).focus();
    await p.page.keyboard.press('Enter');
  }
  const start = a.page.getByRole('button', { name: 'Start' });
  await expect(start).toBeEnabled();
  await start.focus();
  await a.page.keyboard.press('Enter');
  for (const p of [a, b]) await waitForSnapshot(p.page, (s) => s.state === 'versusPlaying', 10_000);
}

/** The `versus` main snapshot field (#20). */
export function versusOf(s: GameSnapshot): { overlay: string | null; offline: boolean } | null {
  return (s.versus as { overlay: string | null; offline: boolean } | null | undefined) ?? null;
}

/** Answers every versus level-up with `1` and closes every chest with Enter until stopped. */
export function answerDialogs(page: Page): () => Promise<number> {
  const control = { running: true };
  let answered = 0;
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        const overlay = versusOf(await snapshot(page))?.overlay;
        if (overlay === 'levelUp') {
          await page.keyboard.press('1');
          answered++;
        } else if (overlay === 'chest') {
          await page.keyboard.press('Enter');
          answered++;
        }
      } catch {
        // closing
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

/** `]` (fastForward, precondition only) until `timeS ≥ targetS` or the run is over, answering dialogs on the way. */
export async function forwardVersus(page: Page, targetS: number): Promise<GameSnapshot> {
  for (let i = 0; i < 2000; i++) {
    const s = await snapshot(page);
    if (s.timeS >= targetS || s.state !== 'versusPlaying') return s;
    const overlay = versusOf(s)?.overlay;
    if (overlay === 'levelUp') await page.keyboard.press('1');
    else if (overlay === 'chest') await page.keyboard.press('Enter');
    else {
      await page.keyboard.press(']');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(30);
  }
  throw new Error(`forwardVersus: could not reach ${String(targetS)} s`);
}

export const statusFrames = (p: Player, dir: '→' | '←', from: number, to: number): Frame[] =>
  p.frames.filter(
    (f) =>
      f.dir === dir &&
      f.t >= from &&
      f.t < to &&
      f.type === (dir === '→' ? 'status' : 'peerStatus'),
  );

export const opponentRow = (page: Page) => page.locator('.opponent-panel .opponent').first();

export async function rowState(page: Page) {
  const row = opponentRow(page);
  const timeout = 2_000;
  return {
    name: await row.locator('.opponent-name').textContent({ timeout }),
    level: await row.locator('.opponent-level').textContent({ timeout }),
    kills: await row.locator('.opponent-kills').textContent({ timeout }),
    hp: await row.locator('[role="meter"]').getAttribute('aria-valuetext', { timeout }),
    badge: await row.getAttribute('data-badge', { timeout }),
    out: await row.getAttribute('data-out', { timeout }),
  };
}
```

`versus-match.spec.ts` (journeys 1–4):

```ts
// Feature-map journeys for .claude/skills/verify-game/features/versus-match.md (#20): two browser contexts against
// the Docker server on :8787. Debug keys reach preconditions only: `I` (invulnerable) and `]` (fast-forward).
import { expect, test } from '@playwright/test';
import {
  answerLevelUps,
  noteEvidence,
  pageErrors,
  snapshot,
  waitForSnapshot,
} from '../../../e2e/helpers';
import {
  answerDialogs,
  forwardVersus,
  meet,
  player,
  rowState,
  startMatch,
  statusFrames,
} from './versus-helpers';

test('versus 1: same seed, panel rate, death → Lose/Win without reload, Rematch → the same lobby', async ({
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  const a = await player(browser, 'versus-1-match/a');
  const b = await player(browser, 'versus-1-match/b');
  noteEvidence(testInfo, a.ev);
  try {
    const code = await meet(a, b);
    await startMatch(a, b);
    // Both invulnerable while the schedule and the panel are measured (precondition, `I`); A dies later.
    for (const p of [a, b]) {
      await p.page.keyboard.press('i');
      await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
    }
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    // Same seed: nobody moves for the first 10 s of simulated time.
    const [sa, sb] = await Promise.all(
      [a.page, b.page].map((p) => waitForSnapshot(p, (s) => s.timeS >= 10.5, 60_000)),
    );
    type Spawn = { enemyId: string; timeS: number };
    const early = (s: typeof sa) => (s.spawnLog as Spawn[]).filter((e) => e.timeS < 10);
    a.ev.json('spawn-logs', { a: early(sa), b: early(sb), modeA: sa.mode, modeB: sb.mode });
    expect(sa.mode).toBe('versus');
    expect(early(sa).length).toBeGreaterThan(5);
    expect(early(sb)).toEqual(early(sa));
    await a.ev.shot('a-10s');
    await b.ev.shot('b-10s');
    // Then they move independently.
    const from = Date.now();
    const samples: unknown[] = [];
    await b.page.keyboard.down('ArrowRight');
    for (let i = 0; i < 10; i++) {
      if (i === 5) {
        await b.page.keyboard.up('ArrowRight');
        await b.page.keyboard.down('ArrowUp');
      }
      await b.page.waitForTimeout(1000);
      samples.push({
        at: Date.now() - from,
        aSees: await rowState(a.page),
        bSees: await rowState(b.page),
      });
    }
    await b.page.keyboard.up('ArrowUp');
    const to = Date.now();
    const [pa, pb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
    const rate = {
      windowMs: to - from,
      aSent: statusFrames(a, '→', from, to).length,
      bSent: statusFrames(b, '→', from, to).length,
      aReceived: statusFrames(a, '←', from, to).length,
      bReceived: statusFrames(b, '←', from, to).length,
      minGapMsA: Math.min(
        ...statusFrames(a, '→', from, to).map((f, i, all) =>
          i === 0 ? Infinity : f.t - (all[i - 1]?.t ?? 0),
        ),
      ),
      positions: { a: pa.player, b: pb.player },
      samples,
    };
    a.ev.json('panel-rate', rate);
    const perSecond = (n: number) => (n * 1000) / rate.windowMs;
    for (const n of [rate.aSent, rate.bSent, rate.aReceived, rate.bReceived]) {
      expect(perSecond(n)).toBeGreaterThanOrEqual(2);
      expect(perSecond(n)).toBeLessThanOrEqual(4.05);
    }
    expect(rate.minGapMsA).toBeGreaterThanOrEqual(250);
    expect(
      new Set(samples.map((s) => JSON.stringify((s as { aSees: unknown }).aSees))).size,
    ).toBeGreaterThan(1);
    await a.ev.shot('a-panel');
    await b.ev.shot('b-panel');
    // Death: A turns invulnerability off and stands still until it dies; B stays invulnerable.
    await a.page.keyboard.press('i');
    await waitForSnapshot(a.page, (s) => s.debugInvulnerable === false, 2_000);
    const urlA = a.page.url();
    // B's panel follows A's HP down while A is hit.
    const hpSeenByB: unknown[] = [];
    for (let i = 0; i < 400 && (await snapshot(a.page)).defeated !== true; i++) {
      const row = await rowState(b.page).catch(() => null);
      if (row)
        hpSeenByB.push({ at: Date.now() - from, hp: row.hp, level: row.level, kills: row.kills });
      await b.page.waitForTimeout(500);
    }
    a.ev.json('hp-seen-by-b', hpSeenByB);
    expect(new Set(hpSeenByB.map((x) => (x as { hp: string }).hp)).size).toBeGreaterThan(1);
    const dead = await waitForSnapshot(a.page, (s) => s.defeated === true, 420_000);
    await a.ev.shot('a-defeated-dimmed');
    await expect(a.page.getByRole('heading', { name: 'Lose' })).toBeVisible({ timeout: 5_000 });
    await expect(b.page.getByRole('heading', { name: 'Win' })).toBeVisible({ timeout: 5_000 });
    await a.ev.shot('a-lose');
    await b.ev.shot('b-win');
    const after = await Promise.all([snapshot(a.page), snapshot(b.page)]);
    a.ev.json('death', {
      a: { timeS: dead.timeS, state: after[0].state, steps: after[0].steps },
      b: { state: after[1].state },
      sameUrl: a.page.url() === urlA,
      aDied: a.frames.filter((f) => f.type === 'died').map((f) => f.body),
      result: b.frames.filter((f) => f.type === 'matchResult').map((f) => f.body),
      ranking: await b.page.locator('.ranking tbody tr').allTextContents(),
    });
    expect(a.frames.some((f) => f.dir === '→' && f.type === 'died')).toBe(true);
    expect(b.frames.some((f) => f.type === 'playerEliminated' && f.body.includes('"died"'))).toBe(
      true,
    );
    // forceEnd: B's world no longer steps.
    const bSteps = after[1].steps;
    await b.page.waitForTimeout(500);
    expect((await snapshot(b.page)).steps).toBe(bSteps);
    await stopA();
    await stopB();
    // Rematch: both return to the same lobby with ready flags cleared.
    for (const p of [a, b]) await p.page.getByRole('button', { name: 'Rematch' }).click();
    for (const p of [a, b]) {
      await waitForSnapshot(p.page, (s) => s.state === 'lobby', 5_000);
      await expect(p.page.locator('.room-code')).toHaveText(code);
      await expect(p.page.locator('.players li[data-ready="false"]')).toHaveCount(2, {
        timeout: 10_000,
      });
      await expect(p.page.getByRole('button', { name: 'Ready' })).toBeEnabled();
    }
    await a.ev.shot('a-rematch-lobby');
    await b.ev.shot('b-rematch-lobby');
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('versus 2: closing a page mid-match marks the player disconnected; the other wins about 10 s later', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const a = await player(browser, 'versus-2-disconnect/a');
  const b = await player(browser, 'versus-2-disconnect/b');
  noteEvidence(testInfo, b.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    const stopB = answerDialogs(b.page);
    await b.page.keyboard.press('i');
    await waitForSnapshot(b.page, (s) => s.timeS > 3, 10_000);
    const closedAt = Date.now();
    await a.page.close();
    await expect(b.page.locator('.opponent[data-badge="disconnected"]')).toBeVisible({
      timeout: 5_000,
    });
    const badgeAt = Date.now();
    await b.ev.shot('b-disconnected-badge');
    await expect(b.page.getByRole('heading', { name: 'Win' })).toBeVisible({ timeout: 20_000 });
    const winAt = Date.now();
    await b.ev.shot('b-win');
    await stopB();
    b.ev.json('disconnect', {
      badgeAfterMs: badgeAt - closedAt,
      winAfterMs: winAt - closedAt,
      eliminated: b.frames
        .filter((f) => f.type === 'playerEliminated')
        .map((f) => ({ t: f.t - closedAt, body: f.body })),
      result: b.frames.filter((f) => f.type === 'matchResult').map((f) => f.body),
    });
    expect(winAt - closedAt).toBeGreaterThanOrEqual(9_000);
    expect(winAt - closedAt).toBeLessThanOrEqual(13_000);
    expect(
      b.frames.some((f) => f.type === 'playerEliminated' && f.body.includes('"disconnected"')),
    ).toBe(true);
    expect(pageErrors(b.ev)).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('versus 3: no Death at 15:00; the match is decided by kills', async ({
  browser,
}, testInfo) => {
  test.setTimeout(900_000);
  const a = await player(browser, 'versus-3-time-limit/a');
  const b = await player(browser, 'versus-3-time-limit/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) {
      await p.page.keyboard.press('i');
      await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
    }
    // B walks for 3 s first, so the two worlds (same seed) diverge and the kills differ.
    await b.page.keyboard.down('ArrowRight');
    await b.page.waitForTimeout(3_000);
    await b.page.keyboard.up('ArrowRight');
    const bosses: unknown[] = [];
    for (const p of [a, b]) {
      await forwardVersus(p.page, 899);
      bosses.push((await snapshot(p.page)).bosses);
    }
    await a.ev.shot('a-before-limit');
    // The last second runs live in both worlds.
    await Promise.all(
      [a, b].map((p) =>
        waitForSnapshot(p.page, (s) => s.state !== 'versusPlaying' || s.cleared === true, 30_000),
      ),
    );
    const ends = await Promise.all([a, b].map((p) => snapshot(p.page)));
    for (const p of [a, b])
      await expect(p.page.locator('.versus-result h2')).toBeVisible({ timeout: 15_000 });
    await a.ev.shot('a-result');
    await b.ev.shot('b-result');
    const headlines = await Promise.all(
      [a, b].map((p) => p.page.locator('.versus-result h2').textContent()),
    );
    const survived = [a, b].map((p) =>
      p.frames.filter((f) => f.dir === '→' && f.type === 'survived').map((f) => f.body),
    );
    const result = a.frames.find((f) => f.type === 'matchResult')?.body ?? '';
    a.ev.json('time-limit', {
      ends: ends.map((s) => ({
        timeS: s.timeS,
        cleared: s.cleared,
        bosses: s.bosses,
        enemies: s.enemies,
        state: s.state,
      })),
      bossesBefore: bosses,
      survived,
      result,
      headlines,
    });
    for (const s of ends) {
      expect(s.cleared).toBe(true);
      expect(
        (s.bosses as { enemyId?: string; id?: string }[]).some(
          (x) => (x.enemyId ?? x.id) === 'death',
        ),
      ).toBe(false);
    }
    expect(survived.every((s) => s.length === 1)).toBe(true);
    const parsed = JSON.parse(result) as {
      outcome: string;
      winnerId: string | null;
      ranking: { kills: number; alive: boolean }[];
    };
    expect(parsed.ranking.every((r) => r.alive)).toBe(true);
    const [k0, k1] = parsed.ranking.map((r) => r.kills);
    expect(parsed.outcome).toBe(k0 === k1 ? 'draw' : 'win');
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('versus 4: single player opens no WebSocket and shows the #17 results on death', async ({
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  const solo = await player(browser, 'versus-4-single');
  noteEvidence(testInfo, solo.ev);
  try {
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'characterSelect', 5_000);
    await solo.page.keyboard.press('Enter');
    const s0 = await waitForSnapshot(solo.page, (s) => s.state === 'playing', 5_000);
    const stop = answerLevelUps(solo.page);
    const end = await waitForSnapshot(solo.page, (s) => s.state === 'results', 480_000);
    await stop();
    await expect(solo.page.getByRole('heading', { name: 'Game over' })).toBeVisible();
    await solo.ev.shot('single-results');
    solo.ev.json('single', {
      mode: s0.mode,
      timeS: end.timeS,
      versus: end.versus,
      gameSockets: solo.log,
    });
    expect(s0.mode).toBe('single');
    expect(solo.log).toEqual([]);
    expect(await solo.page.locator('.opponent-panel').count()).toBe(0);
    expect(pageErrors(solo.ev)).toEqual([]);
  } finally {
    await solo.close();
  }
});
```

`native/hidden-tab.spec.ts` (journey 5):

```ts
// versus-match.md journey 5 (#20): native hidden tab against the Docker server. Player A runs in the task-owned
// headed browser of e2e/helpers/native-test.ts (real `document.visibilityState`), hidden by activating an owned
// blank target; player B runs in a second, separately launched headless browser owned by this test.
import { expect } from '@playwright/test';
import { test } from '../../../../e2e/helpers/native-test';
import { hidePage } from '../../../../e2e/helpers/hide-page';
import { noteEvidence, pageErrors, snapshot, waitForSnapshot } from '../../../../e2e/helpers';
import { answerDialogs, meet, player, rowState, startMatch } from '../versus-helpers';

// The window of the owned headed browser may be covered by other windows on a shared desktop; Chrome then reports
// every tab hidden (occlusion), and `show()` can never succeed. Hiding stays native: it is the tab switch to the owned
// blank target. Only occlusion tracking is turned off, for this journey (2026-11-09, #20).
test.use({
  launchOptions: {
    headless: false,
    ignoreDefaultArgs: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  },
});

test('versus 5 (native hidden tab): hidden 20 s keeps simulating and shows away; hidden over 30 s forfeits', async ({
  page,
  playwright,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const other = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const url = baseURL ?? 'http://localhost:5180/';
  const a = await player(page, 'versus-5-hidden/a', false, url);
  const b = await player(other, 'versus-5-hidden/b', true, url);
  noteEvidence(testInfo, a.ev);
  let visibility;
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) {
      await p.page.keyboard.press('i');
      await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
    }
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    await waitForSnapshot(a.page, (s) => s.timeS > 3, 10_000);
    const before = await snapshot(a.page);
    const hiddenAt = Date.now();
    visibility = await hidePage(a.page);
    a.ev.json('ownership', visibility.ownership);
    const docHidden = await a.page.evaluate(() => document.visibilityState);
    await expect(b.page.locator('.opponent[data-badge="away"]')).toBeVisible({ timeout: 3_000 });
    const awaySeenAt = Date.now();
    await b.ev.shot('b-away');
    const mid = await snapshot(a.page);
    await a.page.waitForTimeout(20_000 - (Date.now() - hiddenAt));
    const hiddenEnd = await snapshot(a.page);
    await visibility.show();
    const shownAt = Date.now();
    const after = await snapshot(a.page);
    await expect(b.page.locator('.opponent[data-badge=""]')).toBeVisible({ timeout: 3_000 });
    const back = {
      docAfterShow: await a.page.evaluate(() => document.visibilityState),
      bRow: await rowState(b.page),
    };
    const first = {
      docHidden,
      hiddenMs: shownAt - hiddenAt,
      awaySeenAfterMs: awaySeenAt - hiddenAt,
      timeS: {
        before: before.timeS,
        mid: mid.timeS,
        hiddenEnd: hiddenEnd.timeS,
        after: after.timeS,
      },
      workerHidden: { mid: mid.hidden, after: after.hidden },
      advancedS: hiddenEnd.timeS - before.timeS,
      back,
      aSentVisibility: a.frames
        .filter((f) => f.type === 'visibility')
        .map((f) => ({ t: f.t - hiddenAt, body: f.body })),
      aStatusWhileHidden: a.frames.filter(
        (f) => f.type === 'status' && f.t > hiddenAt && f.t < shownAt,
      ).length,
      bPeerAway: b.frames
        .filter((f) => f.type === 'peerAway')
        .map((f) => ({ t: f.t - hiddenAt, body: f.body })),
    };
    a.ev.json('hidden-20s', first);
    expect(docHidden).toBe('hidden');
    expect(mid.hidden).toBe(true);
    expect(first.advancedS).toBeGreaterThan(17);
    expect(first.advancedS).toBeLessThan(23);
    await a.ev.shot('a-back');
    // Hidden again, past the 30 s forfeit.
    const hidden2At = Date.now();
    await visibility.hide();
    await expect(b.page.getByRole('heading', { name: 'Win' })).toBeVisible({ timeout: 40_000 });
    const winAt = Date.now();
    // The panel shows "forfeited" for the 100 ms before the result; the result's ranking keeps it.
    const aliceRow = b.page.locator('.ranking tbody tr').filter({ hasText: 'Alice' });
    await expect(aliceRow.locator('td').nth(1)).toHaveText('forfeited');
    const forfeitRow = await aliceRow.locator('td').allTextContents();
    await b.ev.shot('b-win-forfeited');
    await visibility.show();
    await expect(a.page.getByRole('heading', { name: 'Lose' })).toBeVisible({ timeout: 5_000 });
    await a.ev.shot('a-lose-after-forfeit');
    await stopA();
    await stopB();
    a.ev.json('hidden-35s', {
      winAfterMs: winAt - hidden2At,
      forfeitRow,
      ranking: await b.page.locator('.ranking tbody tr').allTextContents(),
      bEliminated: b.frames
        .filter((f) => f.type === 'playerEliminated')
        .map((f) => ({ t: f.t - hidden2At, body: f.body })),
      aEliminated: a.frames
        .filter((f) => f.type === 'playerEliminated')
        .map((f) => ({ t: f.t - hidden2At, body: f.body })),
    });
    expect(winAt - hidden2At).toBeGreaterThanOrEqual(29_000);
    expect(winAt - hidden2At).toBeLessThanOrEqual(33_000);
    expect(forfeitRow[1]).toBe('forfeited');
    expect(b.frames.some((f) => f.type === 'playerEliminated' && f.body.includes('"afk"'))).toBe(
      true,
    );
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    // Evidence first; a failing restore must not hide the journey's own error.
    a.ev.json('frames-at-end', { a: a.log, b: b.log });
    await visibility?.dispose().catch((e: unknown) => {
      a.ev.json('dispose-error', { message: String(e).slice(0, 500) });
    });
    await a.close();
    await b.close();
    await other.close();
  }
});
```

`versus-deadline.spec.ts` (journey 6):

```ts
// versus-match.md journey 6 (#20, #60): a server with the test-only short limit (NODE_ENV=test,
// MATCH_TIME_LIMIT_S_OVERRIDE=20) ends the match at startAt + 30 s while both worlds are still playing; both pages show
// the result with the deadline note. Runs only with VERIFY_DEADLINE=1 against that server.
import { expect, test } from '@playwright/test';
import { noteEvidence, pageErrors, snapshot } from '../../../e2e/helpers';
import { answerDialogs, meet, player, startMatch } from './versus-helpers';

test('versus 6: a matchResult at the server deadline shows the result with the deadline note', async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.VERIFY_DEADLINE !== '1',
    'needs VERIFY_DEADLINE=1 and the short-limit server',
  );
  test.setTimeout(120_000);
  const a = await player(browser, 'versus-6-deadline/a');
  const b = await player(browser, 'versus-6-deadline/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) await p.page.keyboard.press('i');
    const stops = [answerDialogs(a.page), answerDialogs(b.page)];
    for (const p of [a, b])
      await expect(p.page.locator('.versus-result h2')).toBeVisible({ timeout: 60_000 });
    for (const stop of stops) await stop();
    const start = JSON.parse(a.frames.find((f) => f.type === 'matchStart')?.body ?? '{}') as {
      startAt: number;
    };
    const result = a.frames.find((f) => f.type === 'matchResult');
    const notes = await Promise.all(
      [a, b].map((p) => p.page.locator('.versus-result .note').textContent()),
    );
    const snaps = await Promise.all([a, b].map((p) => snapshot(p.page)));
    await a.ev.shot('a-deadline-result');
    await b.ev.shot('b-deadline-result');
    a.ev.json('deadline', {
      resultAfterStartMs: (result?.t ?? 0) - start.startAt,
      result: result?.body,
      headlines: await Promise.all(
        [a, b].map((p) => p.page.locator('.versus-result h2').textContent()),
      ),
      notes,
      localTimeS: snaps.map((s) => s.timeS),
      sentSurvived: [a, b].map((p) => p.frames.some((f) => f.dir === '→' && f.type === 'survived')),
    });
    expect(notes.every((n) => n?.startsWith('Time ran out on the server'))).toBe(true);
    expect(snaps.every((s) => s.timeS < 900 && s.state === 'versusResult')).toBe(true);
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
```

`versus-offline.spec.ts` (journey 7):

```ts
// versus-match.md journey 7 (#20): the server goes away mid-match. Both players keep playing locally with the banner,
// and each local death shows an "Unofficial result" with Leave only. Stops and restarts the Docker server, so it runs
// only with VERIFY_SERVER_CONTROL=1 against a server you started yourself.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { noteEvidence, pageErrors, snapshot, waitForSnapshot } from '../../../e2e/helpers';
import { answerDialogs, meet, player, startMatch } from './versus-helpers';

test('versus 7: losing the server mid-match keeps playing locally and ends with an unofficial result', async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.VERIFY_SERVER_CONTROL !== '1',
    'needs VERIFY_SERVER_CONTROL=1 and your own server',
  );
  test.setTimeout(300_000);
  const a = await player(browser, 'versus-7-offline/a');
  const b = await player(browser, 'versus-7-offline/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    const stops = [answerDialogs(a.page), answerDialogs(b.page)];
    await waitForSnapshot(a.page, (s) => s.timeS > 3, 10_000);
    execFileSync('docker', ['compose', 'stop', 'server'], { stdio: 'inherit' });
    for (const p of [a, b])
      await expect(p.page.locator('.versus-banner')).toHaveText(
        'Disconnected from server — result unavailable',
        {
          timeout: 10_000,
        },
      );
    const offline = await snapshot(a.page);
    await a.ev.shot('a-offline-banner');
    const later = await waitForSnapshot(
      a.page,
      (s) => s.timeS > offline.timeS + 3 || s.state !== 'versusPlaying',
      15_000,
    );
    for (const p of [a, b])
      await expect(p.page.getByRole('heading', { name: 'Unofficial result' })).toBeVisible({
        timeout: 180_000,
      });
    for (const stop of stops) await stop();
    await a.ev.shot('a-unofficial');
    await b.ev.shot('b-unofficial');
    a.ev.json('offline', {
      offlineAt: offline.timeS,
      stillPlaying: later.timeS,
      versus: offline.versus,
      rematchVisible: await a.page.getByRole('button', { name: 'Rematch' }).isVisible(),
      stats: await a.page.locator('.versus-result .stats').textContent(),
    });
    expect(later.timeS).toBeGreaterThan(offline.timeS);
    await expect(a.page.getByRole('button', { name: 'Rematch' })).toBeHidden();
    await a.page.getByRole('button', { name: 'Leave' }).click();
    await waitForSnapshot(a.page, (s) => s.state === 'title', 5_000);
    expect(
      [...pageErrors(a.ev), ...pageErrors(b.ev)].filter((l) => !l.includes('WebSocket')),
    ).toEqual([]);
  } finally {
    execFileSync('docker', ['compose', 'start', 'server'], { stdio: 'inherit' });
    await a.close();
    await b.close();
  }
});
```

## Gotchas

- A Warden standing still dies in about 15–40 s; journeys that measure anything first press `I` in both pages, and journey 1 turns it off in A only for the death (2026-11-09, #20).
- Two pages that do the same thing (no movement, `1` on every dialog) play identical worlds, so their kills tie and the 15:00 result is a Draw; journey 3 walks B for 3 s first so the kills differ (2026-11-09, #20).
- The panel shows "forfeited" or "dead" only for the 100 ms between `playerEliminated` and `matchResult` when that ends the match; the result's ranking keeps the reason, so check it there (2026-11-09, #20).
- Hiding must be native: plain Playwright focus emulation (`bringToFront()` on a standard context) keeps pages visible. Journey 5 runs A in the task-owned browser and profile of `e2e/helpers/native-test.ts` (hidden by activating its owned blank target with `hidePage`) and B in a second, separately launched headless browser it closes itself. On a shared desktop the owned window can be covered by other windows, and Chrome then reports every tab hidden (occlusion), so `show()` never succeeds; journey 5 keeps `--disable-backgrounding-occluded-windows` (only occlusion tracking is off; the tab switch still hides the page natively). The checked-in `e2e/hidden-tab.spec.ts` failed the same way on that desktop (2026-11-09, #20).
- While hidden, the main thread's timers are throttled to about once a second, so the trailing status send slows to about 1 per second; the world itself keeps simulating in the worker (measured 22 `status` frames in 21 s hidden, `timeS` +19.8 s) (2026-11-09, #20).
- Measured against the local Docker server: 39 `status` sent and 39 `peerStatus` received per player in 10.3 s (3.8/s, minimum gap 260 ms); `away` seen 61 ms after hiding; disconnect → `disconnected` badge 109 ms, "Win" 10.5 s; AFK forfeit "Win" 30.5 s after hiding; deadline result 30.0 s after `startAt` with a 20 s limit (2026-11-09, #20).
- The deadline journey needs `NODE_ENV=test` and `MATCH_TIME_LIMIT_S_OVERRIDE` (journey 6 used 20 s) through a compose override (`room-server.md` § Deadline journey); the 15:00 journey 3 never reaches the server deadline because both players report `survived` first (2026-11-09, #20).
- In headless SwiftShader screenshots the ThorVG texts (the HUD timer and the defeat line alike) look dark with a light outline; judge their colour in a headed run (2026-11-09, #20).
