# Versus match

A 2-player versus match (#20, ADRs 0004, 0005, 0006, 0009, 0011): after the lobby countdown each player plays the full stage in their own world from the shared seed, sees the opponent's live status in a panel, and lands on a Win, Lose or Draw result with Rematch.

## Sub-features

- **Start:** at the countdown's zero both pages switch to `state: 'versusPlaying'`; the worker logs `[worker] background policy: simulate` and `[worker] run started, seed <matchStart.seed>`. Snapshot `mode: 'versus'`. Escape does not pause and a hidden tab keeps simulating.
- **Same seed:** with no movement for the first 10 s of simulated time, the two pages' `spawnLog` entries (`{ enemyId, timeS }`, the first 64 spawner spawns) with `timeS < 10` are identical. After that the worlds diverge with input; they are never synchronized.
- **Status relay:** each page sends `status { hp, maxHp, level, kills, alive, elapsedMs }` 2–4 times per second (never two within 250 ms: the client waits 260 ms) and receives the opponent's `peerStatus` at the same rate. The panel (`aside` "Opponents", top right; since #115 at the opponent pane's top left, as its label strip) shows one row per opponent: nickname (`.opponent-name`), an HP bar (`role="meter"` "HP", `aria-valuetext` `hp / maxHp`), `Lv n` and `Kills n`; the values change while the other player plays, and HP falls while the other is hit.
- **Badges** (`data-badge` on `.opponent`): `away` while the opponent's tab is hidden (`peerAway`), `disconnected` when their socket closed (`roomState.connected: false`), `dead` and `forfeited` (`playerEliminated` `died`/`afk`); an eliminated row is greyed and struck through (`data-out="true"`).
- **Death:** the dead player's world freezes, dimmed to 40%, under the ThorVG line "You were defeated - waiting for the match to end" (snapshot `defeated: true`); it sends `died { kills, elapsedMs }`. When the result arrives the survivor sees "Win", the dead player "Lose" (`.versus-result h2`), without a reload. The ranking table lists nickname (" (you)" on this player), "alive" or why the player is out ("dead", "disconnected", "forfeited"), and kills. On `matchResult` the worker gets `forceEnd`: its `steps` stop and the last frame stays under the result.
- **Disconnect:** closing one page mid-match shows `disconnected` on the other's panel at once; about 10 s later (`DISCONNECT_GRACE_MS`) the other gets `playerEliminated { reason: 'disconnected' }` and "Win".
- **Hidden tab (AFK):** hiding a page sends `visibility { hidden: true }`; its world keeps simulating (`timeS` advances by about the hidden time) and the opponent's row shows `away` within a second. Back within 30 s clears it. Hidden for 30 s (`AFK_FORFEIT_MS`) forfeits: the opponent gets "Win" and the ranking shows the forfeited player as "forfeited"; the forfeited page shows "Lose" when it returns.
- **Time limit:** a versus run never spawns Death. At 15:00 each world ends with `cleared: true`, sends `survived { kills }` and shows "Survived! Waiting for others" (`.versus-banner`); when both survived the most kills win, equal kills draw.
- **Server deadline (#60):** a `matchResult` that arrives at `startAt` + limit + 10 s while this world is still playing (behind the wall clock after level-ups) ends the match the same way, with the note "Time ran out on the server: you were counted as survived with your last reported kills." (`.versus-result .note`); a player who survived and waited until the deadline sees the note about players who had not finished.
- **Server lost:** when the socket leaves `open` during the match the banner says "Disconnected from server — result unavailable", nothing more is sent, the world plays on, and the local end shows "Unofficial result" with the local time, kills and level and only "Leave". Snapshot `versus.offline: true`.
- **Rematch and Leave:** Rematch returns both to the same room's lobby (`state: 'lobby'`, same `.room-code`), showing "Waiting for the room to reset" until the server's reset 5 s after the result, then every row `data-ready="false"` and Ready enabled. Leave sends `leaveRoom` and returns to the title.
- **Dialogs:** level-ups and chests still open over the versus world and pause only it (`versus.overlay` is `'levelUp'` or `'chest'`; `state` stays `'versusPlaying'`); while one is open no `status` is sent.
- **Sound (#129):** each page hears only its own world (the opponent pane carries no cues), `music.stage` during the match with the overlays ducking it to 0.5, and `music.title` on the result (`audio.md`).
- **Single player** is unchanged: `mode: 'single'`, no game WebSocket, no panel, #17's results screen on death, one full view (`layout.layout: 'single'`, no "YOU" label).
- **Split view (#115, ADR 0018):** from `versusPlaying` until leaving `versusResult` the canvas shows two equal 16:9 panes, own first, with a 16-unit gap that shows only the page background: `columns` (left/right) when `min(W / 2576, H / 720) >= min(W / 1280, H / 1456)`, else `rows` (top/bottom): 1600 × 900 is `columns`, 1440 × 900, 900 × 1400 and 1000 × 1000 are `rows`. A resize that crosses the layout switches it at once, and the worker draws the new layout on its next frame; size changes within one layout keep the trailing 100 ms debounce (`main/resize.ts`), so a window drag resizes the canvas once. The own pane is labelled "YOU" (ThorVG, bottom left) and keeps its HUD, the "Sent <label>" toast, the defeat dim and line; `.versus-banner` sits at its bottom centre and `.interference-banners` at its top centre. The result screen covers the last split frame; Rematch or Leave returns to one view.
- **Picture-in-picture on touch devices (#150, ADR 0024):** in touch mode (`touch.mode === 'touch'`, `touch-controls.md`) a versus match does not split: the own world fills the canvas like single player (no "YOU" label) and the opponent's world is a top-right inset at 0.32 scale, 409.6 × 230.4 logical units, 16 from the right edge and 64 from the top of the visible area (`pipRect(visible)`; `PIP_RECT` = (854.4, 64) when the whole view is visible), with a white 2-unit frame over a 60% black backdrop, at least 8 units below the kill count (12 at 1280×720). Snapshot `layout.layout` and `panes.layout` are `'pip'`, `panes.youLabel` false, and `layout.panes[1]` / `--opp-x/y/w/h` on `#screens` are the inset in CSS pixels. The opponent panel sits right under the inset, as wide as it, with the nickname and HP only (12 px). A touch on a desktop page switches its match to the inset at once, and a movement key back to the equal split; `opponentPane.paintsCreated` stays the same across switches. Since #171 (ADR 0025) a touch page covers the window (`layout.fit: 'cover'`, `touch-controls.md`), so the inset is 16 logical units from the screen's right edge and 64 from the view's top, on a Pixel 7 and on a 1024×768 touch page alike (the latter is cropped only to 1220 units of width and keeps bars above and below, so the timer and the sent toast clear the inset), and the HUD's kill count is drawn above it inside the screen. Desktop (keys mode) keeps the split above, letterboxed (`layout.fit: 'contain'`).
- **Inventory (#156):** in either split layout the Weapons and Passives groups appear at the top left of the local pane. On Rematch, the next run lists its own starting weapon and empty passive group. See `inventory-hud.md` for the reward checks.
- **Opponent pane (#115):** labelled "OPPONENT" (ThorVG) with the opponent's `mm:ss`, and the opponent panel as its DOM label strip (the nickname via `textContent`, so `<b>Ann</b>` shows as text). It draws the opponent's ground, enemies (elites at 1.5×), idle gems, pickups (interference ones included), sprite (mirrored when facing left) and HP bar from the newest relayed view, 200 ms behind real time with the player position interpolated, so it follows the opponent within about 45 units while walking; no projectiles, effects, weapons, lights, chests, hit flash, elite markers or frost. Caps: 160 enemies, 48 gems, 8 pickups; it creates no paint after boot. "AWAY" dims it to 60% while the opponent's tab is hidden or their socket is closed, "OUT" to 40% once they are eliminated.
- **Opponent native motion (#84, ADR 0019):** the live pane uses adjacent player positions for idle or locomotion and displays relayed enemies with locomotion poses. Its native clock runs during local level-up, chest or defeat pauses while fresh views arrive. Check that peer away/out, exhausted feed, local tab hide and leaving the pane stop native progression or release the leases. A fresh view resumes playback without catch-up.
- **Interference (#21):** enemy kills drop Swarm, Gem Thief and Elite Call pickups from 1:00; collecting one sends it to the opponent's world, whose banner names the sender. Journeys in `interference.md`.
- **View stream (#114, ADR 0018):** each page sends `view { view }` (a quantized `PlayerView` of its own world: player position, facing, character, HP permille and `[kind, dx, dy]` triples of nearby enemies, idle gems and pickups) 9–10 times per second, never two within 110 ms, never while its tab is hidden, after its death or after the result; each body is at most 3072 bytes. The server relays it unchanged as `peerView { playerId, view }`; the worker keeps the opponent's last 3 (`opponentFeed`). Swarm, Gem Thief and Elite Call sent to the opponent show up in the sender's `opponentFeed` (enemies, gems 0, elites ≥ 1). Single player sends none (`viewOut` stays `null`). The opponent pane draws the feed (#115, below).
- Snapshot fields: `spawnLog`, `mode`, `defeated`, `panes` (`{ layout, opponentVisible, youLabel }`), `opponentPane` (`{ cameraX, cameraY, enemiesShown, gemsShown, pickupsShown, state: 'live' | 'away' | 'out', paintsCreated }`), `viewOut` (`{ t, x, y, enemies, elites, gems, pickups, sent }` of the last view posted, or `null`) and `opponentFeed` (`{ t, x, y, facing, character, hpPermille, enemies, elites, gems, pickups, received }` of the newest received, or `null`) (worker), `versus` (`{ overlay, offline }` or `null`, main), `layout` (`{ layout, panes }`, main) and `state` (`'versusPlaying'`, `'versusResult'`).

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

- Journey 8 (#114, the view stream): `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "versus 8"`, and journey 8b (native hidden tab): `VERIFY_JOURNEYS=verification/issue-<N>/journeys/native VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "versus 8b"` (the `hidden-tab` project matches only files named `hidden-tab.spec.ts`; the spec still owns its headed native browser). Both need the server rebuilt for protocol 2 (`pnpm server:up`).

- Journey 9 (#115, split panes, headless): `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "versus 9"` (needs `versus-helpers.ts` beside it).
- Journey 11 (#150, picture-in-picture on touch devices) is checked in: `e2e/versus-pip.spec.ts`, run by `pnpm verify:e2e --with-server --project mobile-chromium` (or `VERIFY_URL=<url> VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts e2e/versus-pip.spec.ts --project=mobile-chromium` against a running client and server). Match 1: a Pixel 7 page and a 1024×768 touch page (#171) tap through Multiplayer, Create room / Join room / Join, Ready and Start (the lobby shows the touch hint), press `I` (precondition), play 10 s and each checks layout `pip` in both threads, the cover fit (`expectCoverFit`), the inset rect against the screen's right and top edges, the panel under it and on screen, the kill count's pixels above the inset, the white frame (pixels sampled across the inset's top edge) and `opponentPane.enemiesShown > 0`. The touch pages close, then match 2: a desktop page (keys) beside a phone; the desktop shows `columns` with "YOU" and equal panes, the phone `pip`; a CDP touch on the desktop page switches it to `pip` and `ArrowRight` back to `columns`, three times, with `opponentPane.paintsCreated` unchanged. Evidence in `versus-11-pip/a-phone|b-tablet|c-desktop|d-phone/` with `pip.json` (in `a-phone/`).
- Journey 10 (#115, render rate and paint counts) and 10b (single player at 1600 × 900): the same command with `-g "versus 10"`, still in the headless `chromium` project: the spec launches its own headed Chromium for the two measured pages with `--window-position=-2400,-2400 --window-size=1600,1000`, never brings it to the front and closes it at once; player B stays headless. Do not run it with `VERIFY_HEADED=1`. Record the load average with each run and rerun when it is above 20.

Evidence per journey and player: `versus-<n>-<name>/<a|b>/` with screenshots, `page-console.log`, `worker-console.log`, `ws-frames.log` and JSON (`spawn-logs.json`, `panel-rate.json`, `hp-seen-by-b.json`, `death.json`, `disconnect.json`, `time-limit.json`, `single.json`, `hidden-20s.json`, `hidden-35s.json`, `deadline.json`, `offline.json`, `view-rate.json`, `view-interference.json`, `single-view.json`, `view-hidden.json`, `split-panes.json`, `perf.json`, `single-view.json`).

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

`view-stream.spec.ts` (journeys 8 and 8c):

```ts
// versus-match.md journey 8 (#114, ADR 0018): the view stream between two browser contexts against the Docker server.
// Debug keys reach preconditions only: `I` (invulnerable) and `J` (an interference pickup 48 units right).
import { expect, test } from '@playwright/test';
import {
  answerLevelUps,
  noteEvidence,
  pageErrors,
  snapshot,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';
import { answerDialogs, meet, player, startMatch, type Frame, type Player } from './versus-helpers';

interface ViewOut {
  t: number;
  x: number;
  y: number;
  enemies: number;
  elites: number;
  gems: number;
  pickups: number;
  sent: number;
}
interface Feed extends Omit<ViewOut, 'sent'> {
  facing: number;
  character: number;
  hpPermille: number;
  received: number;
}
const viewOut = (s: GameSnapshot) => (s.viewOut as ViewOut | null | undefined) ?? null;
const feed = (s: GameSnapshot) => (s.opponentFeed as Feed | null | undefined) ?? null;
const px = (s: GameSnapshot) => (s.player as { x: number } | null)?.x ?? NaN;
const frames = (p: Player, dir: '→' | '←', type: string, from = 0, to = Infinity): Frame[] =>
  p.frames.filter((f) => f.dir === dir && f.type === type && f.t >= from && f.t < to);
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
const viewOf = (f: Frame) => JSON.stringify((JSON.parse(f.body) as { view: unknown }).view);

async function invulnerable(p: Player): Promise<void> {
  await p.page.keyboard.press('i');
  await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
}

/** Polls both pages together until `pred` holds; returns the pair and when. */
async function untilBoth(
  a: Player,
  b: Player,
  pred: (sa: GameSnapshot, sb: GameSnapshot) => boolean,
  ms: number,
): Promise<{ sa: GameSnapshot; sb: GameSnapshot; at: number }> {
  const end = Date.now() + ms;
  for (;;) {
    const [sa, sb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
    if (pred(sa, sb)) return { sa, sb, at: Date.now() };
    if (Date.now() > end) throw new Error('untilBoth: timed out');
    await a.page.waitForTimeout(20);
  }
}

test('versus 8: views stream at 9-10/s, relay exactly, match the sender and carry interference', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'versus-8-view-stream/a');
  const b = await player(browser, 'versus-8-view-stream/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) await invulnerable(p);
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    await waitForSnapshot(a.page, (s) => s.timeS > 2, 10_000);

    // 10 s window; B walks right for the first 3 s.
    const from = Date.now();
    await b.page.keyboard.down('ArrowRight');
    const samples: unknown[] = [];
    let bReleased = false;
    let worstDx = 0;
    let equalAtSameT = 0;
    while (Date.now() - from < 10_000) {
      if (!bReleased && Date.now() - from >= 3_000) {
        await b.page.keyboard.up('ArrowRight');
        bReleased = true;
      }
      const [sa, sb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
      const fa = feed(sa);
      const vb = viewOut(sb);
      if (fa) worstDx = Math.max(worstDx, Math.abs(fa.x - px(sb)));
      if (fa && vb && fa.t === vb.t) {
        expect([fa.enemies, fa.elites, fa.gems, fa.pickups]).toEqual([
          vb.enemies,
          vb.elites,
          vb.gems,
          vb.pickups,
        ]);
        equalAtSameT++;
      }
      samples.push({ at: Date.now() - from, aFeed: fa, bOut: vb, bX: px(sb) });
      await a.page.waitForTimeout(200);
    }
    const to = from + 10_000;
    const aSent = frames(a, '→', 'view', from, to);
    const aGot = frames(a, '←', 'peerView', from, to);
    const bSent = frames(b, '→', 'view', from, to);
    const gaps = aSent.slice(1).map((f, i) => f.t - (aSent[i]?.t ?? 0));
    const bSentViews = new Set(frames(b, '→', 'view').map(viewOf));
    const rate = {
      windowMs: to - from,
      aSent: aSent.length,
      aReceived: aGot.length,
      bSent: bSent.length,
      minGapMsA: Math.min(...gaps),
      maxBytesA: Math.max(...aSent.map((f) => bytes(f.body))),
      maxBytesB: Math.max(...bSent.map((f) => bytes(f.body))),
      relayedNotSent: aGot.filter((f) => !bSentViews.has(viewOf(f))).length,
      errors: [...a.frames, ...b.frames].filter((f) => f.type === 'error').map((f) => f.body),
      closes: [...a.log, ...b.log].filter((l) => l.endsWith(' close')),
      worstDx,
      equalAtSameT,
      samples,
    };
    a.ev.json('view-rate', rate);
    await a.ev.shot('a-window-end');
    await b.ev.shot('b-window-end');
    for (const n of [rate.aSent, rate.aReceived, rate.bSent]) {
      expect(n).toBeGreaterThanOrEqual(80);
      expect(n).toBeLessThanOrEqual(100);
    }
    expect(rate.minGapMsA).toBeGreaterThanOrEqual(100);
    expect(Math.max(rate.maxBytesA, rate.maxBytesB)).toBeLessThanOrEqual(3072);
    expect(rate.relayedNotSent).toBe(0);
    expect(rate.errors).toEqual([]);
    expect(rate.closes).toEqual([]);
    expect(rate.worstDx).toBeLessThanOrEqual(60);
    expect(rate.equalAtSameT).toBeGreaterThan(0);

    // Interference from B lands in A's world and shows in B's feed of A.
    const effects: Record<string, unknown> = {};
    const collect = async (kind: string) => {
      await b.page.keyboard.press('j');
      await waitForSnapshot(b.page, (s) => (s.interferenceOnGround as number) >= 1, 2_000);
      await b.page.keyboard.down('ArrowRight');
      await waitForSnapshot(b.page, (s) => s.interferenceOnGround === 0, 5_000);
      await b.page.keyboard.up('ArrowRight');
      effects[`${kind}CollectedAt`] = Date.now();
    };

    const before = await snapshot(a.page);
    await collect('swarm');
    const swarmed = await waitForSnapshot(
      a.page,
      (s) => (s.enemies as number) >= (before.enemies as number) + 30,
      5_000,
    );
    const outBefore = viewOut(before)?.enemies ?? 0;
    // A's view shows more enemies once the pack walks into range; then B's feed of A matches it at the same t.
    const swarmSync = await untilBoth(
      a,
      b,
      (sa, sb) => {
        const out = viewOut(sa);
        const f = feed(sb);
        return (
          out !== null &&
          f !== null &&
          out.enemies >= outBefore + 10 &&
          f.t === out.t &&
          f.enemies === out.enemies
        );
      },
      10_000,
    );
    effects.swarm = {
      aEnemiesBefore: before.enemies,
      aViewEnemiesBefore: outBefore,
      aEnemiesAfter: swarmed.enemies,
      syncedAfterMs: swarmSync.at - (effects.swarmCollectedAt as number),
      aOut: viewOut(swarmSync.sa),
      bFeed: feed(swarmSync.sb),
    };
    await a.ev.shot('a-after-swarm');

    await collect('gemThief');
    const noGems = await waitForSnapshot(a.page, (s) => s.gems === 0, 5_000);
    const gemsZeroAt = Date.now();
    const gemSync = await untilBoth(a, b, (_sa, sb) => feed(sb)?.gems === 0, 2_000);
    effects.gemThief = {
      aGems: noGems.gems,
      feedZeroAfterMs: gemSync.at - gemsZeroAt,
      bFeed: feed(gemSync.sb),
    };

    await collect('eliteCall');
    const eliteSync = await untilBoth(a, b, (_sa, sb) => (feed(sb)?.elites ?? 0) >= 1, 3_000);
    effects.eliteCall = {
      feedEliteAfterMs: eliteSync.at - (effects.eliteCallCollectedAt as number),
      aElites: eliteSync.sa.elites,
      bFeed: feed(eliteSync.sb),
    };
    a.ev.json('view-interference', effects);
    await b.ev.shot('b-after-elite');
    expect((effects.gemThief as { feedZeroAfterMs: number }).feedZeroAfterMs).toBeLessThanOrEqual(
      300,
    );

    await stopA();
    await stopB();
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('versus 8c: single player opens no WebSocket and posts no view', async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const solo = await player(browser, 'versus-8-single');
  noteEvidence(testInfo, solo.ev);
  try {
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'characterSelect', 5_000);
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'playing', 5_000);
    await solo.page.keyboard.press('i');
    // A level-up pauses a single-player run; answer it so the run keeps stepping.
    const stop = answerLevelUps(solo.page);
    const s = await waitForSnapshot(solo.page, (x) => x.timeS >= 5, 40_000);
    await stop();
    solo.ev.json('single-view', {
      mode: s.mode,
      viewOut: s.viewOut,
      opponentFeed: s.opponentFeed,
      gameSockets: solo.log,
    });
    expect(s.mode).toBe('single');
    expect(s.viewOut).toBeNull();
    expect(s.opponentFeed).toBeNull();
    expect(solo.log).toEqual([]);
    expect(pageErrors(solo.ev)).toEqual([]);
  } finally {
    await solo.close();
  }
});
```

`native/view-hidden.spec.ts` (journey 8b):

```ts
// versus-match.md journey 8b (#114): a natively hidden tab sends no `view` and resumes within 200 ms of showing.
// Player B runs in the task-owned headed browser of e2e/helpers/native-test.ts; A in a second headless browser.
import { expect } from '@playwright/test';
import { test } from '../../../../e2e/helpers/native-test';
import { hidePage } from '../../../../e2e/helpers/hide-page';
import { noteEvidence, pageErrors, waitForSnapshot } from '../../../../e2e/helpers';
import { answerDialogs, meet, player, startMatch } from '../versus-helpers';

test.use({
  launchOptions: {
    headless: false,
    ignoreDefaultArgs: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  },
});

test('versus 8b (native hidden tab): no view while hidden, the first within 200 ms of showing', async ({
  page,
  playwright,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const other = await playwright.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const url = baseURL ?? 'http://localhost:5180/';
  const a = await player(other, 'versus-8b-view-hidden/a', true, url);
  const b = await player(page, 'versus-8b-view-hidden/b', false, url);
  noteEvidence(testInfo, b.ev);
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
    await waitForSnapshot(b.page, (s) => s.timeS > 3, 10_000);
    const hiddenAt = Date.now();
    visibility = await hidePage(b.page);
    const docHidden = await b.page.evaluate(() => document.visibilityState);
    await b.page.waitForTimeout(5_000 - (Date.now() - hiddenAt));
    await visibility.show();
    const shownAt = Date.now();
    await b.page.waitForTimeout(1_000);
    // The window is B's own `visibility` frames: `hidePage` resolves a little after the tab is really hidden.
    const vis = b.frames.filter((f) => f.dir === '→' && f.type === 'visibility' && f.t >= hiddenAt);
    const hiddenFrameAt = vis.find((f) => f.body.includes('"hidden":true'))?.t ?? hiddenAt;
    const shownFrameAt = vis.find((f) => f.body.includes('"hidden":false'))?.t ?? shownAt;
    const views = b.frames.filter((f) => f.dir === '→' && f.type === 'view');
    const whileHidden = views.filter((f) => f.t > hiddenFrameAt && f.t < shownFrameAt);
    const firstAfter = views.find((f) => f.t >= shownFrameAt);
    const result = {
      docHidden,
      hiddenMs: shownFrameAt - hiddenFrameAt,
      viewsWhileHidden: whileHidden.length,
      firstAfterShowMs: firstAfter ? firstAfter.t - shownFrameAt : null,
      // A 50 ms margin at both ends: the two browsers' frame events are a few ms apart in time (2026-11-09).
      aPeerViewWhileHidden: a.frames.filter(
        (f) => f.type === 'peerView' && f.t > hiddenFrameAt + 50 && f.t < shownFrameAt - 50,
      ).length,
    };
    b.ev.json('view-hidden', result);
    expect(docHidden).toBe('hidden');
    expect(result.viewsWhileHidden).toBe(0);
    expect(result.aPeerViewWhileHidden).toBe(0);
    expect(result.firstAfterShowMs).not.toBeNull();
    expect(result.firstAfterShowMs ?? Infinity).toBeLessThanOrEqual(200);
    await stopA();
    await stopB();
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await visibility?.dispose().catch(() => undefined);
    await a.close();
    await b.close();
    await other.close();
  }
});
```

`split-panes.spec.ts` (journey 9):

```ts
// versus-match.md journey 9 (#115, ADR 0018): the split panes between two browser contexts against the Docker server.
// Debug keys reach preconditions only: `I` (invulnerable) and `J` (an interference pickup 48 units right).
import { expect, test, type Page } from '@playwright/test';
import {
  noteEvidence,
  pageErrors,
  snapshot,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';
import { answerDialogs, player, startMatch, type Player } from './versus-helpers';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface OpponentPane {
  cameraX: number;
  cameraY: number;
  enemiesShown: number;
  gemsShown: number;
  pickupsShown: number;
  state: string;
  paintsCreated: number;
}
const layoutOf = (s: GameSnapshot) => (s.layout as { layout: string; panes: number }).layout;
const panesOf = (s: GameSnapshot) =>
  s.panes as { layout: string; opponentVisible: boolean; youLabel: boolean };
const pane = (s: GameSnapshot) => s.opponentPane as OpponentPane;
const px = (s: GameSnapshot) => (s.player as { x: number } | null)?.x ?? NaN;
const viewOut = (s: GameSnapshot) =>
  (s.viewOut as { enemies: number; gems: number; elites: number } | null) ?? null;

/** The two pane rects in window CSS pixels, from the variables `main/index.ts` writes on `#screens`. */
async function paneRects(page: Page): Promise<{ self: Rect; opp: Rect; canvas: Rect }> {
  return page.evaluate(() => {
    const el = document.getElementById('screens');
    if (!el) throw new Error('#screens missing');
    const st = getComputedStyle(el);
    const read = (p: string): Rect => ({
      x: parseFloat(st.getPropertyValue(`--${p}-x`)),
      y: parseFloat(st.getPropertyValue(`--${p}-y`)),
      width: parseFloat(st.getPropertyValue(`--${p}-w`)),
      height: parseFloat(st.getPropertyValue(`--${p}-h`)),
    });
    const c = document.querySelector('canvas')?.getBoundingClientRect();
    if (!c) throw new Error('canvas missing');
    return {
      self: read('self'),
      opp: read('opp'),
      canvas: { x: c.x, y: c.y, width: c.width, height: c.height },
    };
  });
}

/**
 * Screenshots the page and returns the RGB of every device pixel along a line (window CSS coordinates), decoded in
 * the page itself (no image dependency in the journey).
 */
async function sampleLine(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  n: number,
): Promise<number[][]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, from, to, n }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      if (!g) throw new Error('2d');
      g.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const out: number[][] = [];
      for (let i = 0; i < n; i++) {
        const x = Math.round((from.x + ((to.x - from.x) * i) / (n - 1)) * k);
        const y = Math.round((from.y + ((to.y - from.y) * i) / (n - 1)) * k);
        const d = g.getImageData(x, y, 1, 1).data;
        out.push([d[0] ?? 0, d[1] ?? 0, d[2] ?? 0]);
      }
      return out;
    },
    { png, from, to, n },
  );
}

const isBackground = (rgb: number[]) => rgb.every((v) => v <= 8);

/** A creates a room as `nickA`, B joins as `nickB`; both end in the lobby. */
async function meetAs(a: Player, b: Player, nickA: string, nickB: string): Promise<string> {
  const toEntry = async (page: Page) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
    await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 5_000 });
  };
  await toEntry(a.page);
  await a.page.keyboard.type(nickA);
  await a.page.keyboard.press('Enter');
  await waitForSnapshot(a.page, (s) => s.state === 'lobby', 5_000);
  const code = (await a.page.locator('.room-code').textContent()) ?? '';
  await toEntry(b.page);
  await b.page.keyboard.type(nickB);
  await b.page.getByRole('button', { name: 'Join room' }).click();
  await b.page.keyboard.type(code);
  await b.page.keyboard.press('Enter');
  await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
  return code;
}

async function invulnerable(p: Player): Promise<void> {
  await p.page.keyboard.press('i');
  await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
}

/** The placeholder canvas's size (the last frame the worker presented) and its CSS box, in device pixels. */
async function canvasBacking(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) throw new Error('canvas missing');
    const box = c.getBoundingClientRect();
    return {
      width: c.width,
      height: c.height,
      boxWidth: Math.round(box.width * devicePixelRatio),
      boxHeight: Math.round(box.height * devicePixelRatio),
    };
  });
}

/**
 * Waits until the worker presented a frame at a new backing size that fills the canvas's new CSS box (#165): the
 * debounced resize was posted, applied and drawn. Under swiftshader the first frame after a resize can take seconds.
 */
async function waitForCanvasResize(
  page: Page,
  before: { width: number; height: number },
  timeoutMs: number,
) {
  const started = Date.now();
  for (;;) {
    const now = await canvasBacking(page);
    const moved = now.width !== before.width || now.height !== before.height;
    if (moved && now.width === now.boxWidth && now.height === now.boxHeight)
      return { ...now, afterMs: Date.now() - started };
    if (Date.now() - started > timeoutMs)
      throw new Error(`canvas never presented the new size: ${JSON.stringify(now)}`);
    await page.waitForTimeout(50);
  }
}

/** Layout, equal 16:9 panes and a background-only gap; returns what was measured. */
async function checkSplit(p: Player, expected: 'columns' | 'rows', name: string) {
  const s = await snapshot(p.page);
  const r = await paneRects(p.page);
  const gapLine =
    expected === 'columns'
      ? {
          from: {
            x: r.self.x + r.self.width + (r.opp.x - r.self.x - r.self.width) / 2,
            y: r.self.y + 4,
          },
          to: {
            x: r.self.x + r.self.width + (r.opp.x - r.self.x - r.self.width) / 2,
            y: r.self.y + r.self.height - 4,
          },
        }
      : {
          from: {
            x: r.self.x + 4,
            y: r.self.y + r.self.height + (r.opp.y - r.self.y - r.self.height) / 2,
          },
          to: {
            x: r.self.x + r.self.width - 4,
            y: r.self.y + r.self.height + (r.opp.y - r.self.y - r.self.height) / 2,
          },
        };
  const gap = await sampleLine(p.page, gapLine.from, gapLine.to, 60);
  // Inside both panes, next to the gap: world pixels (the ground), not background.
  const inside =
    expected === 'columns'
      ? await sampleLine(
          p.page,
          { x: r.self.x + r.self.width - 3, y: r.self.y + r.self.height / 2 },
          { x: r.opp.x + 3, y: r.opp.y + r.opp.height / 2 },
          2,
        )
      : await sampleLine(
          p.page,
          { x: r.self.x + r.self.width / 2, y: r.self.y + r.self.height - 3 },
          { x: r.opp.x + r.opp.width / 2, y: r.opp.y + 3 },
          2,
        );
  await p.ev.shot(name);
  const result = {
    layout: layoutOf(s),
    panes: panesOf(s),
    rects: r,
    gapBackground: gap.filter(isBackground).length,
    gapSamples: gap.length,
    gapNonBackground: gap.filter((c) => !isBackground(c)),
    inside,
  };
  expect(result.layout).toBe(expected);
  expect(result.panes).toEqual({ layout: expected, opponentVisible: true, youLabel: true });
  expect(r.self.width).toBeCloseTo(r.opp.width, 6);
  expect(r.self.height).toBeCloseTo(r.opp.height, 6);
  expect(r.self.width / r.self.height).toBeCloseTo(16 / 9, 3);
  expect(result.gapBackground).toBe(gap.length);
  for (const c of inside) expect(isBackground(c)).toBe(false);
  return result;
}

test('versus 9: split panes show both worlds, labelled, following, with interference and states', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'versus-9-split-panes/a');
  const b = await player(browser, 'versus-9-split-panes/b');
  noteEvidence(testInfo, a.ev);
  const evidence: Record<string, unknown> = {};
  let bOpen = true;
  try {
    for (const p of [a, b]) await p.page.setViewportSize({ width: 1600, height: 900 });
    await meetAs(a, b, '<b>Ann</b>', 'Bob');
    await startMatch(a, b);
    for (const p of [a, b]) await invulnerable(p);
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    await waitForSnapshot(
      a.page,
      (s) => s.timeS > 2 && ((s.opponentFeed as { received: number } | null)?.received ?? 0) > 5,
      10_000,
    );

    // Layout and labels at 1600 × 900, then 900 × 1400 within 300 ms, and back.
    evidence.columns = await checkSplit(a, 'columns', 'a-columns-1600x900');
    // Timed inside the page: from the window's resize event to the reply of the first snapshot that shows `rows` in
    // both threads (an upper bound), and when that snapshot was requested (a lower bound).
    const timing = a.page.evaluate(
      () =>
        new Promise<{ upperMs: number; lowerMs: number; roundTripMs: number; polls: number }>(
          (resolve) => {
            window.addEventListener(
              'resize',
              () => {
                const t0 = performance.now();
                let polls = 0;
                const poll = async (): Promise<void> => {
                  const asked = performance.now();
                  const s = await (
                    globalThis as unknown as {
                      __vsTest: { snapshot(): Promise<Record<string, unknown>> };
                    }
                  ).__vsTest.snapshot();
                  polls++;
                  const now = performance.now();
                  const main = (s.layout as { layout: string }).layout;
                  const worker = (s.panes as { layout: string }).layout;
                  if (main === 'rows' && worker === 'rows')
                    resolve({
                      upperMs: now - t0,
                      lowerMs: asked - t0,
                      roundTripMs: now - asked,
                      polls,
                    });
                  else setTimeout(() => void poll(), 10);
                };
                void poll();
              },
              { once: true },
            );
          },
        ),
    );
    await a.page.setViewportSize({ width: 900, height: 1400 });
    evidence.rowsTiming = await timing;
    const rows = await waitForSnapshot(a.page, (s) => panesOf(s).layout === 'rows', 2_000);
    evidence.rowsSnapshotLayout = { layout: rows.layout, panes: rows.panes };
    await a.page.waitForTimeout(150);
    evidence.rows = await checkSplit(a, 'rows', 'a-rows-900x1400');
    expect((evidence.rowsTiming as { lowerMs: number }).lowerMs).toBeLessThanOrEqual(300);
    // Same layout, so the debounced path: wait for the canvas to show a frame at the new size (#165), not a fixed time.
    const before = await canvasBacking(a.page);
    await a.page.setViewportSize({ width: 1440, height: 900 });
    evidence.rows1440Committed = await waitForCanvasResize(a.page, before, 20_000);
    evidence.rows1440 = await checkSplit(a, 'rows', 'a-rows-1440x900');
    await a.page.setViewportSize({ width: 1600, height: 900 });
    await waitForSnapshot(a.page, (s) => panesOf(s).layout === 'columns', 2_000);

    // B's label strip: the nickname as text, never markup.
    const name = b.page.locator('.opponent-panel .opponent-name').first();
    evidence.bLabelStrip = {
      text: await name.textContent(),
      elementChildren: await name.evaluate((el) => el.children.length),
      box: await b.page.locator('.opponent-panel').boundingBox(),
      oppPane: (await paneRects(b.page)).opp,
    };
    expect(await name.textContent()).toBe('<b>Ann</b>');
    expect(await name.evaluate((el) => el.children.length)).toBe(0);
    await b.ev.shot('b-label-strip');

    // B walks right for 3 s: A's opponent pane follows within 60 units.
    const follow: unknown[] = [];
    let worst = 0;
    await b.page.keyboard.down('ArrowRight');
    const walkFrom = Date.now();
    while (Date.now() - walkFrom < 3_000) {
      const [sa, sb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
      const d = Math.abs(pane(sa).cameraX - px(sb));
      worst = Math.max(worst, d);
      follow.push({ at: Date.now() - walkFrom, cameraX: pane(sa).cameraX, bX: px(sb), d });
      await a.page.waitForTimeout(100);
    }
    await b.page.keyboard.up('ArrowRight');
    await a.page.waitForTimeout(600);
    const [fa, fb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
    evidence.follow = {
      worstWhileWalking: worst,
      settled: pane(fa).cameraX - px(fb),
      samples: follow,
    };
    await a.ev.shot('a-after-b-walked');
    expect(worst).toBeLessThanOrEqual(60);
    expect(Math.abs(pane(fa).cameraX - px(fb))).toBeLessThanOrEqual(2);
    expect(Math.abs(pane(fa).cameraY - ((fb.player as { y: number }).y ?? 0))).toBeLessThanOrEqual(
      2,
    );

    // Interference from B: the toast in B's own pane, A's banner inside A's own pane, the effect in B's opponent pane.
    const collect = async (kind: string) => {
      await b.page.keyboard.press('j');
      await waitForSnapshot(b.page, (s) => (s.interferenceOnGround as number) >= 1, 2_000);
      await b.page.keyboard.down('ArrowRight');
      await waitForSnapshot(b.page, (s) => s.interferenceOnGround === 0, 5_000);
      await b.page.keyboard.up('ArrowRight');
      return { kind, at: Date.now() };
    };
    const swarm = await collect('swarm');
    await b.ev.shot('b-sent-swarm-toast');
    await waitForSnapshot(a.page, (s) => (s.banners as string[]).length > 0, 3_000);
    const banner = await a.page.locator('.interference-banners').boundingBox();
    const aRects = await paneRects(a.page);
    await a.ev.shot('a-incoming-banner');
    const inside = (r: Rect, box: Rect | null) =>
      box !== null &&
      box.x >= r.x &&
      box.y >= r.y &&
      box.x + box.width <= r.x + r.width &&
      box.y + box.height <= r.y + r.height;
    evidence.banner = { box: banner, self: aRects.self, inside: inside(aRects.self, banner) };
    expect(inside(aRects.self, banner)).toBe(true);
    const mirror = { tries: 0, last: null as unknown };
    const deadline = swarm.at + 10_000;
    let mirrored = false;
    while (Date.now() < deadline) {
      const [sa, sb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
      const want = Math.min(viewOut(sa)?.enemies ?? 0, 160);
      mirror.tries++;
      mirror.last = {
        aEnemies: sa.enemies,
        aViewEnemies: viewOut(sa)?.enemies,
        bShown: pane(sb).enemiesShown,
      };
      if (
        (sa.enemies as number) >= 30 &&
        Math.abs(pane(sb).enemiesShown - want) <= 5 &&
        want >= 30
      ) {
        mirrored = true;
        break;
      }
      await a.page.waitForTimeout(100);
    }
    evidence.swarm = { mirrored, afterMs: Date.now() - swarm.at, ...mirror };
    await b.ev.shot('b-opponent-pane-swarm');
    expect(mirrored).toBe(true);

    const gemsBefore = pane(await snapshot(b.page)).gemsShown;
    await collect('gemThief');
    await waitForSnapshot(a.page, (s) => s.gems === 0, 5_000);
    const gemsZeroAt = Date.now();
    await waitForSnapshot(b.page, (s) => pane(s).gemsShown === 0, 2_000);
    evidence.gemThief = { gemsShownBefore: gemsBefore, paneZeroAfterMs: Date.now() - gemsZeroAt };
    await b.ev.shot('b-opponent-pane-no-gems');
    expect(evidence.gemThief).toMatchObject({ paneZeroAfterMs: expect.any(Number) });
    expect((evidence.gemThief as { paneZeroAfterMs: number }).paneZeroAfterMs).toBeLessThanOrEqual(
      500,
    );

    await collect('eliteCall');
    const elite = await waitForSnapshot(
      b.page,
      (s) => ((s.opponentFeed as { elites: number } | null)?.elites ?? 0) >= 1,
      3_000,
    );
    await b.page.waitForTimeout(400);
    evidence.eliteCall = { feed: elite.opponentFeed, pane: pane(await snapshot(b.page)) };
    await b.ev.shot('b-opponent-pane-elite');

    // States and end: B's page closes; A's opponent pane dims "AWAY", then the result arrives.
    await stopB();
    await b.close();
    bOpen = false;
    const closedAt = Date.now();
    const away = await waitForSnapshot(a.page, (s) => pane(s).state === 'away', 2_000);
    evidence.away = { afterMs: Date.now() - closedAt, pane: pane(away) };
    await a.ev.shot('a-opponent-away');
    expect((evidence.away as { afterMs: number }).afterMs).toBeLessThanOrEqual(1_000);
    const result = await waitForSnapshot(a.page, (s) => s.state === 'versusResult', 20_000);
    evidence.result = {
      afterMs: Date.now() - closedAt,
      opponentState: pane(result).state,
      layout: result.layout,
      panes: panesOf(result),
    };
    await a.ev.shot('a-result-over-split');
    await stopA();
    await a.page.getByRole('button', { name: 'Leave' }).click();
    const back = await waitForSnapshot(a.page, (s) => s.state === 'title', 5_000);
    evidence.afterLeave = { layout: back.layout, panes: panesOf(back) };
    await a.ev.shot('a-title-single');
    expect(layoutOf(back)).toBe('single');
    expect(panesOf(back)).toEqual({ layout: 'single', opponentVisible: false, youLabel: false });
    expect(pageErrors(a.ev)).toEqual([]);
  } finally {
    a.ev.json('split-panes', evidence);
    await a.close();
    if (bOpen) await b.close();
  }
});
```

`split-perf.spec.ts` (journeys 10 and 10b):

```ts
// versus-match.md journey 10 (#115, ADR 0018): the split view's render rate against the single view's, headed with the
// real GPU, and the paint counts of both worlds. Run it in the headless `chromium` project: the two measured pages
// (the single-player baseline, then player A) each get their own headed Chromium launched here off-screen
// (`--window-position=-2400,-2400`, fixed `--window-size`), never brought to the front and closed at once; player B
// only sends its world and runs in the project's headless browser. Not minimized: macOS occlusion would throttle it. Debug keys reach preconditions only: `I`
// (invulnerable) and `]` (fast-forward 60 s).
import { cpus, loadavg, totalmem } from 'node:os';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import {
  answerLevelUps,
  forwardTo,
  noteEvidence,
  pageErrors,
  snapshot,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';
import {
  answerDialogs,
  forwardVersus,
  meet,
  player,
  startMatch,
  type Player,
} from './versus-helpers';

const WINDOW_MS = 10_000;
/** The off-screen headed launch for the measured pages (user request, 2026-11-09). */
export const OFFSCREEN_ARGS = ['--window-position=-2400,-2400', '--window-size=1600,1000'];
const launchOffscreen = (): Promise<Browser> =>
  chromium.launch({ headless: false, args: OFFSCREEN_ARGS });
interface OpponentPane {
  enemiesShown: number;
  paintsCreated: number;
}
const pane = (s: GameSnapshot) => s.opponentPane as OpponentPane;
const ownPaints = (s: GameSnapshot) => (s.debug as { paintsCreated: number }).paintsCreated;
const load = () => loadavg().map((v) => Math.round(v * 100) / 100);

async function invulnerable(page: Page): Promise<void> {
  await page.keyboard.press('i');
  await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
}

/** Renders per second over `WINDOW_MS` of wall time, with the smallest opponent pane enemy count seen meanwhile. */
async function renderRate(page: Page) {
  const loadBefore = load();
  const first = await snapshot(page);
  const t0 = Date.now();
  let minShown = Infinity;
  let minEnemies = Infinity;
  while (Date.now() - t0 < WINDOW_MS) {
    await page.waitForTimeout(500);
    const s = await snapshot(page);
    if (s.opponentPane) minShown = Math.min(minShown, pane(s).enemiesShown);
    minEnemies = Math.min(minEnemies, s.enemies as number);
  }
  const last = await snapshot(page);
  const ms = Date.now() - t0;
  return {
    rendersPerS: (((last.renders as number) - (first.renders as number)) * 1000) / ms,
    windowMs: ms,
    timeS: [first.timeS, last.timeS],
    ownEnemiesMin: minEnemies,
    opponentShownMin: Number.isFinite(minShown) ? minShown : null,
    loadBefore,
    loadAfter: load(),
  };
}

test('versus 10: the split view renders at least 90% of the single view rate and creates no paint', async ({
  browser,
}, testInfo) => {
  test.setTimeout(600_000);
  const evidence: Record<string, unknown> = {
    machine: { cpu: cpus()[0]?.model, cores: cpus().length, memGiB: totalmem() / 2 ** 30 },
    measuredBrowser: {
      headless: false,
      args: OFFSCREEN_ARGS,
      note: 'off-screen headed window, real GPU',
    },
    opponentBrowser: 'headless project browser (swiftshader)',
  };

  let soloBrowser: Browser | null = await launchOffscreen();
  let aBrowser: Browser | null = null;
  // B's 5:00 crowd within view range was about 90 (first run), under the plan's 120, so B forwards minute by minute
  // until A's pane shows 120; single player is measured at 5:00 (the plan's baseline) and at 9:00.
  const solo = await player(soloBrowser, 'versus-10-perf/single');
  noteEvidence(testInfo, solo.ev);
  let a: Player | null = null;
  let b: Player | null = null;
  try {
    await solo.page.setViewportSize({ width: 1600, height: 900 });
    evidence.ua = await solo.page.evaluate(() => navigator.userAgent);
    evidence.soloWindow = await solo.page.evaluate(() => ({
      screenX,
      screenY,
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
    }));
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'characterSelect', 5_000);
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'playing', 5_000);
    await invulnerable(solo.page);
    await forwardTo(solo.page, 300);
    const stopSolo = answerLevelUps(solo.page);
    await solo.page.waitForTimeout(1_000);
    evidence.single = await renderRate(solo.page);
    await solo.ev.shot('single-5min');
    await stopSolo();
    await forwardTo(solo.page, 540);
    const stopSolo2 = answerLevelUps(solo.page);
    await solo.page.waitForTimeout(1_000);
    evidence.singleHeavy = await renderRate(solo.page);
    await solo.ev.shot('single-heavy');
    await stopSolo2();
    evidence.singleLayout = (await snapshot(solo.page)).layout;
    await solo.close();
    await soloBrowser.close();
    soloBrowser = null;

    // Versus: B forwards to 5:00; A's opponent pane draws B's crowd.
    aBrowser = await launchOffscreen();
    a = await player(aBrowser, 'versus-10-perf/a');
    b = await player(browser, 'versus-10-perf/b');
    for (const p of [a, b]) await p.page.setViewportSize({ width: 1600, height: 900 });
    evidence.aWindow = await a.page.evaluate(() => ({
      screenX,
      screenY,
      visibility: document.visibilityState,
    }));
    await meet(a, b);
    await startMatch(a, b);
    const firstFrame = await snapshot(a.page);
    const firstAt = Date.now();
    evidence.paintsAtFirstFrame = {
      opponent: pane(firstFrame).paintsCreated,
      own: ownPaints(firstFrame),
    };
    for (const p of [a, b]) await invulnerable(p.page);
    const stopA = answerDialogs(a.page);
    await forwardVersus(b.page, 300);
    let shown = pane(await snapshot(a.page)).enemiesShown;
    const steps: unknown[] = [];
    for (let target = 360; target <= 840 && shown < 120; target += 60) {
      await forwardVersus(b.page, target);
      await a.page.waitForTimeout(1_500);
      shown = pane(await snapshot(a.page)).enemiesShown;
      steps.push({ bTimeS: (await snapshot(b.page)).timeS, shown });
    }
    evidence.bForward = steps;
    const stopB = answerDialogs(b.page);
    await waitForSnapshot(a.page, (s) => pane(s).enemiesShown >= 120, 30_000);
    evidence.bTimeS = (await snapshot(b.page)).timeS;
    evidence.splitOpponentAt5 = await renderRate(a.page);
    await a.ev.shot('a-split-opponent-at-5min');

    // Stricter, for the record: A's own world at 5:00 too.
    await stopA();
    await forwardVersus(a.page, 300);
    const stopA2 = answerDialogs(a.page);
    await a.page.waitForTimeout(1_000);
    evidence.splitBothAt5 = await renderRate(a.page);
    await a.ev.shot('a-split-both-at-5min');

    const wait = 60_000 - (Date.now() - firstAt);
    if (wait > 0) await a.page.waitForTimeout(wait);
    const later = await snapshot(a.page);
    evidence.paintsAfter60s = {
      afterS: (Date.now() - firstAt) / 1000,
      opponent: pane(later).paintsCreated,
      own: ownPaints(later),
    };
    await stopA2();
    await stopB();

    const single = (evidence.single as { rendersPerS: number }).rendersPerS;
    evidence.ratioVsHeavySingle =
      (evidence.splitOpponentAt5 as { rendersPerS: number }).rendersPerS /
      (evidence.singleHeavy as { rendersPerS: number }).rendersPerS;
    const split = (evidence.splitOpponentAt5 as { rendersPerS: number; opponentShownMin: number })
      .rendersPerS;
    evidence.ratio = split / single;
    evidence.ratioBothAt5 = (evidence.splitBothAt5 as { rendersPerS: number }).rendersPerS / single;
    expect(
      (evidence.splitOpponentAt5 as { opponentShownMin: number }).opponentShownMin,
    ).toBeGreaterThanOrEqual(120);
    expect(evidence.paintsAfter60s).toMatchObject(evidence.paintsAtFirstFrame as object);
    expect(evidence.ratio).toBeGreaterThanOrEqual(0.9);
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    solo.ev.json('perf', evidence);
    if (!solo.page.isClosed()) await solo.close();
    await a?.close();
    await b?.close();
    await soloBrowser?.close();
    await aBrowser?.close();
  }
});

test('versus 10b: single player at 1600 x 900 keeps one full view with no YOU label', async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const solo = await player(browser, 'versus-10-single-view');
  noteEvidence(testInfo, solo.ev);
  try {
    await solo.page.setViewportSize({ width: 1600, height: 900 });
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'characterSelect', 5_000);
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'playing', 5_000);
    await invulnerable(solo.page);
    const stop = answerLevelUps(solo.page);
    await solo.page.keyboard.down('ArrowRight');
    await solo.page.keyboard.down('ArrowDown');
    await solo.page.waitForTimeout(2_000);
    await solo.page.keyboard.up('ArrowDown');
    await solo.page.keyboard.up('ArrowRight');
    const s = await snapshot(solo.page);
    const canvas = await solo.page.locator('canvas').boundingBox();
    await solo.ev.shot('single-1600x900');
    await stop();
    const result = {
      layout: s.layout,
      panes: s.panes,
      opponentPane: s.opponentPane,
      mode: s.mode,
      canvas,
      screensLayout: await solo.page.locator('#screens').getAttribute('data-layout'),
    };
    solo.ev.json('single-view', result);
    expect(s.layout).toEqual({ layout: 'single', panes: 1 });
    expect(s.panes).toEqual({ layout: 'single', opponentVisible: false, youLabel: false });
    expect(result.screensLayout).toBe('single');
    expect(canvas?.width).toBeCloseTo(1600, 0);
    expect(canvas?.height).toBeCloseTo(900, 0);
    expect(pageErrors(solo.ev)).toEqual([]);
  } finally {
    await solo.close();
  }
});
```

## Gotchas

- Journey 11 (#150): Playwright Test applies the project's `use` (in `mobile-chromium` a Pixel 7: touch, mobile, DPR 2.625) to every `browser.newContext()`, so the desktop page passes `devices['Desktop Chrome']` explicitly; without it the "desktop" page started in touch mode at 1280 × 720 and DPR 2.625, and the next page's worker never answered (2026-11-10, #150).
- Journey 11's frame check samples a short vertical line across the inset's top edge per column: the 2-unit stroke is about 1 CSS pixel on a phone and is resampled from the DPR-2 backing store to the screenshot's 2.625, so a single row can miss it (2026-11-10, #150).
- A resize used to show a black canvas until the next frame was drawn (#165): resizing the worker's WebGL `OffscreenCanvas` clears its buffer, and the browser presented that buffer when the `resize` task ended, while the redraw waited for the next animation frame. Under swiftshader on a loaded machine the first `canvas.update()` after a resize takes 0.4-6 s (with `canvas.resize` itself at 0.3-2.6 s), so journey 9's third check (900 × 1400 → 1440 × 900, the debounced path) caught it black, and the worker answered no snapshot for seconds (load average 7-24, CPU throttle 1 and 4). Since #165 the worker draws in the same task as the resize (`worker/resize-frame.ts`), so the old frame stays (stretched to the new CSS box) until the new one replaces it. A wait on the layout alone proves nothing within one layout, so the third check waits until the placeholder canvas presents the new backing size (`waitForCanvasResize`). The worker can still be busy for seconds after a headless resize, so give such waits 20 s (2026-11-10, #165).
- The inset first sat at `PIP_TOP` 48, where its frame touched the kill count's digits (which end at y = 50 at 1280×720, outline included); it now starts at 64, so the backdrop leaves 12 units (2026-11-10, #150).

- Versus runs never change the personal records: the `records` snapshot field (`totals.runs`, `recent`) is the same before and after a match on both pages (`records.md` journey 6, 2026-11-09, #143).
- A Warden standing still dies in about 15–40 s; journeys that measure anything first press `I` in both pages, and journey 1 turns it off in A only for the death (2026-11-09, #20).
- Two pages that do the same thing (no movement, `1` on every dialog) play identical worlds, so their kills tie and the 15:00 result is a Draw; journey 3 walks B for 3 s first so the kills differ (2026-11-09, #20).
- The panel shows "forfeited" or "dead" only for the 100 ms between `playerEliminated` and `matchResult` when that ends the match; the result's ranking keeps the reason, so check it there (2026-11-09, #20).
- Hiding must be native: plain Playwright focus emulation (`bringToFront()` on a standard context) keeps pages visible. Journey 5 runs A in the task-owned browser and profile of `e2e/helpers/native-test.ts` (hidden by activating its owned blank target with `hidePage`) and B in a second, separately launched headless browser it closes itself. On a shared desktop the owned window can be covered by other windows, and Chrome then reports every tab hidden (occlusion), so `show()` never succeeds; journey 5 keeps `--disable-backgrounding-occluded-windows` (only occlusion tracking is off; the tab switch still hides the page natively). The checked-in `e2e/hidden-tab.spec.ts` failed the same way on that desktop (2026-11-09, #20).
- While hidden, the main thread's timers are throttled to about once a second, so the trailing status send slows to about 1 per second; the world itself keeps simulating in the worker (measured 22 `status` frames in 21 s hidden, `timeS` +19.8 s) (2026-11-09, #20).
- Measured against the local Docker server: 39 `status` sent and 39 `peerStatus` received per player in 10.3 s (3.8/s, minimum gap 260 ms); `away` seen 61 ms after hiding; disconnect → `disconnected` badge 109 ms, "Win" 10.5 s; AFK forfeit "Win" 30.5 s after hiding; deadline result 30.0 s after `startAt` with a 20 s limit (2026-11-09, #20).
- The deadline journey needs `NODE_ENV=test` and `MATCH_TIME_LIMIT_S_OVERRIDE` (journey 6 used 20 s) through a compose override (`room-server.md` § Deadline journey); the 15:00 journey 3 never reaches the server deadline because both players report `survived` first (2026-11-09, #20).
- In headless SwiftShader screenshots the ThorVG texts (the HUD timer and the defeat line alike) look dark with a light outline; judge their colour in a headed run (2026-11-09, #20).
- Journey 8 compares `opponentFeed` with the sender's `viewOut` only when their `t` match: two snapshots of two pages are never taken at the same instant, and a level-up dialog in either world holds its views (no `view` while the world does not step), so the 10 s count can fall towards the low end of 80–100 (2026-11-09, #114).
- Journey 8b measures the hidden window between the page's own `visibility` frames: `hidePage` resolves about 100 ms after the tab is really hidden, so a window from the call time counts a view sent while the tab was still visible (2026-11-09, #114).
- Frame timestamps of two browsers differ by a few ms (a `peerView` was logged 5 ms before its sender logged the `view`), so journey 8b counts the opponent's `peerView` with a 50 ms margin at both ends of the hidden window (2026-11-09, #114).
- Journey 10's plan precondition "B at 5:00 with at least 120 enemies in A's pane" does not hold: B's view at 5:00 holds about 90 enemies (single player at 5:22 had 89 alive). The journey forwards B minute by minute until A's pane shows 120 (B at 7:57 gave 130) and also measures single player at 5:00 and 9:00 (2026-11-09, #115).
- Measured render rates (Apple M4 Pro, 14 cores, 48 GiB, Chrome 156, headed with the real GPU at 1600 × 900, load average 8-11): single player 59.97/s at 5:00 and 59.98/s at 10:00 (170 enemies); split view 60.01/s with 130-150 enemies in the opponent pane, and 60.02/s with both worlds at 5:00. Ratio 1.00, at the display's vsync cap, so the measurement shows no cost but no headroom either (2026-11-09, #115).
- macOS clamps `--window-position=-2400,-2400` back onto the display (the page reported `screenX 0, screenY 30`), so journey 10's headed windows are visible for its 1.7 minutes; the rates were still the vsync cap. Batch headed runs (2026-11-09, #115).
- Headless (swiftshader) HUD text draws outlined but hollow-looking; colours are only meaningful in headed screenshots (2026-11-09, #115).
- Journey 9 times the `rows` switch inside the page: from the resize event to the reply of the first snapshot that shows `rows` in both threads. Headless (swiftshader) that reply took 583-1929 ms, nearly all of it the worker resizing and redrawing the canvas, so only headed runs measure the switch (journey 9r, `resize-headed.spec.ts`, a headed Chromium of its own, 60 s cap). With #115's first 100 ms debounce on every resize, 14 of 20 headed switches missed 300 ms (250-396 ms). Now a layout-crossing resize relayouts in the resize event itself: 10 headed `setViewportSize` switches (1600×900 ↔ 900×1400, 1440×900 ↔ 1600×900; M4 Pro, load 6.3) had both panes rendered 126-254 ms after the event. The main-thread change happens inside the event, before the spec's own listener, so the spec's `mainMs` only repeats the snapshot time. CDP `Browser.setWindowBounds` gave the page no `resize` event after clearing the viewport override, so real window drags are unmeasured. Journey 9d (`resize-drag.spec.ts`, headless) drags 30 steps 16 ms apart within one layout: 1 `resize` posted in single player and 1 in the split; mean frame interval 19 ms and 24 ms during the drag under swiftshader (2026-11-09, #115).
