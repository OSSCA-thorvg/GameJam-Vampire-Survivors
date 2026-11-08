# Lobby

The multiplayer lobby (#19, ADRs 0004, 0006, 0009, 0011): from the title, Multiplayer leads through the character select to a nickname and room-code entry, then a lobby where two players meet by a 6-character code, ready up, and the host's Start shows a countdown in both browsers. Starting the versus match at zero is #20 (`app.startVersus` is a stub that logs `[vs] startVersus is not wired yet (#20)` in dev).

## Sub-features

- **Entry:** the title has "Start" (focused, first) and "Multiplayer"; Multiplayer opens the character select (`state: 'characterSelect'`, `purpose: 'versus'` in the app state), Enter there opens `state: 'multiplayerEntry'`: heading "Multiplayer", a "Nickname" textbox (focused, `maxlength` 12, pre-filled with the last nickname from this session or `localStorage` `vs.nickname`), "Create room", "Join room", "Back". The socket opens only now: status "Connecting to the game server…", then empty; on failure "Cannot reach the game server" with "Retry". Escape or Back returns to the title and closes the socket.
- **Validation:** Create and Join room stay disabled until `normalizeNickname` accepts the nickname (blank, zero-width or control characters, more than 12 characters fail; "Use 1–12 visible characters" shows under the field). "Join room" reveals a "Room code" textbox that upper-cases, drops characters outside `ABCDEFGHJKMNPQRSTUVWXYZ23456789` and keeps 6; "Join" is enabled only with 6 characters. Enter in the nickname field creates (or joins once a full code is entered), Enter in the code field joins.
- **Server errors:** fixed English text under the field, the screen stays `multiplayerEntry`, the server's `message` is never shown: `roomNotFound` "Room not found or not joinable" (also full and in-match rooms, ADR 0011), `nicknameTaken` "That nickname is taken in this room", `invalidNickname` "Use 1–12 visible characters", `wrongPhase` "That room has already started", `rateLimited` "Too many attempts — wait a minute" (`roomFull` "That room is full" is never sent by the server). Editing the field clears the message.
- **Lobby:** `state: 'lobby'`: "Room code" with the code (`.room-code`), "Copy" (clipboard, "Copied" for 1.5 s, or selects the code), the players as nickname, "(you)", host ★ and ready ✓ (text nodes only; `<b>x</b>` shows literally), "Ready"/"Not ready" (`aria-pressed`), "Start" (host only; enabled when there are 2 players and all are ready), "Leave". Status line: "Waiting for another player…", "Waiting for every player to be ready", "Waiting for the host to start", "Reconnecting…", or "Waiting for the room to reset" when the room is not in `lobby`. Arrows or WASD move focus between Ready, Start, Leave and Copy; Escape opens an inline "Leave the room?" row ("Leave the room", "Stay").
- **Countdown:** the host's Start sends `startMatch`; on `matchStart` both pages show a `role="timer"` overlay "Match starts in 3/2/1" until `startAt` (clamped to 0–5 s); the two overlays appear within 300 ms of each other. At zero the dev console logs the `startVersus` stub line and the lobby stays.
- **Connection loss:** the server going away in the lobby shows "Reconnecting…", retries after 1, 2 and 4 s, then returns to `multiplayerEntry` with the notice "Connection lost — the room was left" and the nickname kept; the room is never rejoined. With the server still down the entry shows "Cannot reach the game server" and Retry.
- **Single player:** Start never opens a WebSocket (only Vite's dev HMR socket, `/?token=`, exists in dev and e2e builds).
- Snapshot fields: `state` (main thread) is `'multiplayerEntry'` or `'lobby'`; everything else is read from the DOM (ARIA roles and names) and the WebSocket frames.

## How to get to it (user POV)

Server needed: `cp -n .env.example .env`, then `pnpm verify:launch --with-server` (starts or reuses the Docker server on :8787; the client on :5180, an allowed origin). Open the game in two separate browser contexts (two Playwright contexts, or two Chrome windows with separate profiles or one incognito), press ArrowDown and Enter on the title (Multiplayer), Enter on the character select. Journey 5 stops the server: only when you started it yourself with `pnpm server:up`.

## Driving it

### Claude in Chrome

The extension drives one Chrome profile, whose tabs share `localStorage` but not sockets, so two tabs are two players.

1. `tabs_context_mcp` `{ createIfEmpty: true }`; create tabs A and B (`tabs_create_mcp`); `gif_creator` `start_recording` on A; `navigate` both to `http://localhost:5180/`; `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'title', 30000)).state` in each.
2. A: `computer` `key` `ArrowDown`, `key` `Enter`, `key` `Enter` → `state: "multiplayerEntry"`; `computer` `type` `Alice`, `key` `Enter` → `state: "lobby"`; `get_page_text` → the code; `screenshot`.
3. B: same to the entry; `type` a zero-width nickname is not typeable here, so type three spaces and `find` "Create room button" → disabled; select all, `type` `Bob`, `left_click` "Join room", `type` `zzzzzz`, `key` `Enter` → "Room not found or not joinable"; select the code field, `type` A's code in lower case, select the nickname field, `type` `Alice`, `key` `Enter` → "That nickname is taken in this room"; change it to `Bob`, `key` `Enter` → `state: "lobby"`, both tabs list Alice and Bob; `screenshot` each.
4. In both tabs `key` `Enter` (Ready) → ✓ on both rows; B: `find` "Start button" → none; A: `key` `ArrowDown`, `key` `Enter` → both tabs show "Match starts in"; `read_console_messages` `{ pattern: "startVersus" }` after 4 s → the stub line.
5. Markup: in a third tab, join A's room after one player leaves, with nickname `<b>x</b>` → shown literally (`read_page`: no `b` element in the list).
6. Connection loss (own server only): in a terminal `pnpm server:down`; both tabs show "Reconnecting…", then within about 10 s the entry with "Connection lost — the room was left" and the nickname; `pnpm server:up`, then "Retry".
7. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-lobby.gif" }`; close the tabs.

### Playwright

Save the spec as `verification/issue-<N>/journeys/lobby.spec.ts`. After `pnpm verify:launch --with-server` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g lobby`; add `VERIFY_SERVER_CONTROL=1` to run journey 5, which runs `pnpm server:down` and `pnpm server:up`. Evidence per journey and context: `lobby-<n>-<name>/<a|b>/` with screenshots, `page-console.log`, `worker-console.log`, `ws-frames.log` (every game-socket frame with its time) and JSON (`meet.json`, `errors.json`, `countdown.json` with each page's overlay time and `deltaMs`, `single.json`).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/lobby.md (#19). Two browser contexts against the
// Docker server on :8787; keyboard first. Journey 5 stops and restarts the server, so it runs only with
// VERIFY_SERVER_CONTROL=1 (set it only when you started the server with `pnpm server:up` yourself).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  answerLevelUps,
  noteEvidence,
  openGame,
  pageErrors,
  startEvidence,
  waitForSnapshot,
  type Evidence,
} from '../../../e2e/helpers';

interface Player {
  page: Page;
  ev: Evidence;
  frames: string[];
  close(): Promise<void>;
}

/** A fresh browser context on the title screen, recording its WebSocket frames. */
async function player(browser: Browser, journey: string): Promise<Player> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const ev = startEvidence(page, journey);
  const frames: string[] = [];
  const t0 = Date.now();
  page.on('websocket', (ws) => {
    // Only the game server's socket (path /ws); Vite's dev HMR socket (`/?token=`) is not the game's.
    if (new URL(ws.url()).pathname !== '/ws') {
      frames.push(`${String(Date.now() - t0)} (not the game server: ${ws.url()})`);
      return;
    }
    frames.push(`${String(Date.now() - t0)} open ${ws.url()}`);
    ws.on('framesent', (f) => frames.push(`${String(Date.now() - t0)} → ${String(f.payload)}`));
    ws.on('framereceived', (f) => frames.push(`${String(Date.now() - t0)} ← ${String(f.payload)}`));
    ws.on('close', () => frames.push(`${String(Date.now() - t0)} close`));
  });
  expect((await openGame(page)).renderer).toBe('gl');
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  return {
    page,
    ev,
    frames,
    async close() {
      writeFileSync(joinPath(ev.dir, 'ws-frames.log'), frames.join('\n') + '\n');
      ev.flush();
      await context.close();
    },
  };
}

/** Title → Multiplayer → the select (Enter on Warden) → the entry screen, connected. */
async function toEntry(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Multiplayer' })).toBeFocused();
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(page.getByRole('textbox', { name: 'Nickname' })).toBeFocused();
  await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 5_000 });
}

async function typeNickname(page: Page, nickname: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Nickname' });
  await field.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(nickname);
}

async function create(page: Page, nickname: string): Promise<string> {
  await toEntry(page);
  await typeNickname(page, nickname);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'lobby', 5_000);
  const code = (await page.locator('.room-code').textContent()) ?? '';
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  return code;
}

async function join(page: Page, nickname: string, code: string): Promise<void> {
  await typeNickname(page, nickname);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('textbox', { name: 'Room code' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(code.toLowerCase());
  await page.keyboard.press('Enter');
}

const names = (page: Page) => page.locator('.players .player-name').allTextContents();

test('lobby 1: two contexts meet in one room by nickname and the creator’s code', async ({
  browser,
}, testInfo) => {
  const a = await player(browser, 'lobby-1-meet/a');
  const b = await player(browser, 'lobby-1-meet/b');
  noteEvidence(testInfo, a.ev);
  try {
    const code = await create(a.page, 'Alice');
    await a.ev.shot('a-lobby-alone');
    await toEntry(b.page);
    await join(b.page, 'Bob', code);
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
    await expect.poll(() => names(a.page)).toEqual(['Alice', 'Bob']);
    await expect.poll(() => names(b.page)).toEqual(['Alice', 'Bob']);
    await expect(b.page.locator('.room-code')).toHaveText(code);
    await a.ev.shot('a-lobby-both');
    await b.ev.shot('b-lobby-both');
    a.ev.json('meet', { code, a: await names(a.page), b: await names(b.page) });
    expect(a.frames.some((f) => f.includes('"type":"createRoom"'))).toBe(true);
    expect(b.frames.some((f) => f.includes(`"type":"joinRoom","code":"${code}"`))).toBe(true);
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('lobby 2: invalid nickname cannot be submitted; wrong code and taken nickname show their message and stay', async ({
  browser,
}, testInfo) => {
  const a = await player(browser, 'lobby-2-errors/a');
  const b = await player(browser, 'lobby-2-errors/b');
  noteEvidence(testInfo, b.ev);
  try {
    const code = await create(a.page, 'Alice');
    await toEntry(b.page);
    const createBtn = b.page.getByRole('button', { name: 'Create room' });
    await typeNickname(b.page, '   ');
    await expect(createBtn).toBeDisabled();
    await typeNickname(b.page, 'a​b');
    await expect(createBtn).toBeDisabled();
    await expect(b.page.locator('#mp-nickname-error')).toHaveText('Use 1–12 visible characters');
    await b.page.keyboard.press('Enter');
    await b.ev.shot('invalid-nickname');
    const wrong = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    await join(b.page, 'Bob', wrong);
    await expect(b.page.locator('#mp-code-error')).toHaveText('Room not found or not joinable');
    await b.ev.shot('wrong-code');
    await typeNickname(b.page, 'Alice');
    const codeField = b.page.getByRole('textbox', { name: 'Room code' });
    await codeField.fill('');
    await codeField.focus();
    await b.page.keyboard.type(code);
    await b.page.keyboard.press('Enter');
    await expect(b.page.locator('#mp-nickname-error')).toHaveText(
      'That nickname is taken in this room',
    );
    await b.ev.shot('nickname-taken');
    const state = await waitForSnapshot(b.page, (s) => s.state === 'multiplayerEntry', 1_000);
    b.ev.json('errors', {
      state: state.state,
      sent: b.frames.filter((f) => f.includes('→')),
      received: b.frames.filter((f) => f.includes('"type":"error"')),
    });
    // No invalid nickname ever reached the socket.
    expect(b.frames.some((f) => f.includes('\\u200b') || f.includes('"nickname":"   "'))).toBe(
      false,
    );
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('lobby 3: only the host sees Start, enabled when all are ready; the countdown shows in both within 300 ms', async ({
  browser,
}, testInfo) => {
  const a = await player(browser, 'lobby-3-start/a');
  const b = await player(browser, 'lobby-3-start/b');
  noteEvidence(testInfo, a.ev);
  try {
    const code = await create(a.page, 'Alice');
    await toEntry(b.page);
    await join(b.page, 'Bob', code);
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
    const start = a.page.getByRole('button', { name: 'Start' });
    await expect(start).toBeVisible();
    await expect(start).toBeDisabled();
    await expect(b.page.getByRole('button', { name: 'Start' })).toBeHidden();
    // Record, in each page, the wall-clock time the countdown overlay appears.
    for (const p of [a.page, b.page])
      await p.evaluate(() => {
        const w = window as unknown as { countdownAt?: number };
        const timer = document.querySelector('[role="timer"]');
        if (!timer) throw new Error('no timer');
        new MutationObserver(() => {
          if (!timer.hasAttribute('hidden') && w.countdownAt === undefined)
            w.countdownAt = Date.now();
        }).observe(timer, { attributes: true });
      });
    await expect(a.page.getByRole('button', { name: 'Ready' })).toBeFocused();
    await a.page.keyboard.press('Enter');
    await expect(start).toBeDisabled();
    await b.page.keyboard.press('Enter');
    await expect(b.page.locator('.players li[data-ready="true"]')).toHaveCount(2);
    await expect(start).toBeEnabled();
    await a.ev.shot('a-all-ready');
    await b.ev.shot('b-all-ready-no-start');
    await a.page.keyboard.press('ArrowDown');
    await expect(start).toBeFocused();
    await a.page.keyboard.press('Enter');
    await expect(a.page.getByRole('timer')).toBeVisible();
    await expect(b.page.getByRole('timer')).toBeVisible();
    await a.ev.shot('a-countdown');
    await b.ev.shot('b-countdown');
    const at = await Promise.all(
      [a.page, b.page].map((p) =>
        p.evaluate(() => (window as unknown as { countdownAt?: number }).countdownAt),
      ),
    );
    // The stub (#20) logs in dev when the countdown ends.
    await expect
      .poll(() => a.ev.pageLog.some((l) => l.includes('startVersus is not wired yet')), {
        timeout: 7_000,
      })
      .toBe(true);
    await a.ev.shot('a-after-countdown');
    const delta = Math.abs((at[0] ?? 0) - (at[1] ?? 1e9));
    a.ev.json('countdown', { a: at[0], b: at[1], deltaMs: delta });
    expect(at[0]).toBeDefined();
    expect(at[1]).toBeDefined();
    expect(delta).toBeLessThanOrEqual(300);
    expect(a.frames.some((f) => f.includes('"type":"startMatch"'))).toBe(true);
    expect(b.frames.some((f) => f.includes('"type":"matchStart"'))).toBe(true);
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('lobby 4: a nickname with markup shows literally', async ({ browser }, testInfo) => {
  const a = await player(browser, 'lobby-4-markup/a');
  const b = await player(browser, 'lobby-4-markup/b');
  noteEvidence(testInfo, b.ev);
  try {
    const code = await create(a.page, 'Alice');
    await toEntry(b.page);
    await join(b.page, '<b>x</b>', code);
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
    for (const p of [a.page, b.page]) {
      await expect.poll(() => names(p)).toEqual(['Alice', '<b>x</b>']);
      expect(await p.locator('.players b, .players img').count()).toBe(0);
    }
    await a.ev.shot('a-markup-literal');
    await b.ev.shot('b-markup-literal');
    expect([...pageErrors(a.ev), ...pageErrors(b.ev)]).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('lobby 5: stopping the server in the lobby returns both to the entry screen with the notice and nickname', async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.VERIFY_SERVER_CONTROL !== '1',
    'needs VERIFY_SERVER_CONTROL=1 and your own server',
  );
  test.setTimeout(180_000);
  const a = await player(browser, 'lobby-5-lost/a');
  const b = await player(browser, 'lobby-5-lost/b');
  noteEvidence(testInfo, a.ev);
  try {
    const code = await create(a.page, 'Alice');
    await toEntry(b.page);
    await join(b.page, 'Bob', code);
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 5_000);
    execFileSync('pnpm', ['server:down'], { stdio: 'inherit' });
    await expect(a.page.locator('.lobby .status')).toHaveText('Reconnecting…', { timeout: 5_000 });
    await a.ev.shot('a-reconnecting');
    for (const [p, nick] of [
      [a.page, 'Alice'],
      [b.page, 'Bob'],
    ] as const) {
      // 1 + 2 + 4 s of backoff plus the connect attempts.
      await waitForSnapshot(p, (s) => s.state === 'multiplayerEntry', 20_000);
      await expect(p.locator('.notice')).toHaveText('Connection lost — the room was left');
      await expect(p.getByRole('textbox', { name: 'Nickname' })).toHaveValue(nick);
      await expect(p.locator('.multiplayer-entry .status')).toHaveText(
        'Cannot reach the game server',
        { timeout: 10_000 },
      );
    }
    await a.ev.shot('a-lost');
    await b.ev.shot('b-lost');
    execFileSync('pnpm', ['server:up'], { stdio: 'inherit' });
    await expect
      .poll(async () => (await fetch('http://localhost:8787/healthz').catch(() => null))?.status, {
        timeout: 60_000,
      })
      .toBe(200);
    await a.page.getByRole('button', { name: 'Retry' }).click();
    await expect(a.page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 5_000 });
    await expect(a.page.getByRole('button', { name: 'Create room' })).toBeEnabled();
    await a.ev.shot('a-retry-connected');
  } finally {
    await a.close();
    await b.close();
  }
});

test('lobby 6: single player never opens a WebSocket', async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const solo = await player(browser, 'lobby-6-single');
  noteEvidence(testInfo, solo.ev);
  try {
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'characterSelect', 5_000);
    await solo.page.keyboard.press('Enter');
    await waitForSnapshot(solo.page, (s) => s.state === 'playing', 5_000);
    const stop = answerLevelUps(solo.page);
    await solo.page.waitForTimeout(10_000);
    await stop();
    const s = await waitForSnapshot(solo.page, (n) => n.timeS > 5, 5_000);
    await solo.ev.shot('single-10s');
    solo.ev.json('single', { timeS: s.timeS, websockets: solo.frames });
    expect(solo.frames.filter((f) => !f.includes('(not the game server'))).toEqual([]);
    expect(pageErrors(solo.ev)).toEqual([]);
  } finally {
    await solo.close();
  }
});
```

## Gotchas

- Vite's dev server opens its own HMR WebSocket (`ws://localhost:5180/?token=…`) in dev and e2e builds; the single-player check counts only sockets whose path is `/ws` (2026-11-08, #19).
- The countdown overlay times are taken with a `MutationObserver` in each page and compared by `Date.now()`; both contexts run on one machine, so the clocks agree. Measured delta: 0 ms against the local Docker server (2026-11-08, #19).
- Journey 5 stops the server with `pnpm server:down`; never run it against a server another person or agent started. The reconnect backoff (1 + 2 + 4 s plus the attempts) takes 7–10 s before the entry screen returns (2026-11-08, #19).
- The Claude in Chrome driver cannot type a zero-width character, so the invalid-nickname check there uses spaces; the Playwright journey also types `a​b` (2026-11-08, #19).
- After `startVersus` (#20 stub) the server's room is `playing` for up to 15 minutes; leave and create a new room for the next journey (2026-11-08, #19).
