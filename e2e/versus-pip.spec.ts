// Versus picture-in-picture on touch devices (#150, ADR 0024): drives `versus-match.md` journey 11 and the versus entry
// of `touch-controls.md`. Runs in the `mobile-chromium` project against the Docker server (`pnpm verify:e2e
// --with-server --project mobile-chromium`) and skips when no server answers /healthz, like `audio-versus.spec.ts`.
// Match 1: two phones (Pixel 7 in landscape) reach the match with taps only and both show their own world full size
// and the opponent's as a framed top-right inset. Match 2: a desktop page keeps ADR 0018's equal split beside a phone,
// switches to the inset on a touch and back on a key press, without creating a Paint. Debug key `I` (invulnerable)
// is used only as a precondition, so nobody dies before the checks.
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import {
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from './helpers';

const SERVER = process.env.VERIFY_SERVER_HTTP ?? 'http://localhost:8787';
/** ADR 0024's inset in logical units (`worker/constants.ts` `PIP_RECT`). */
const PIP = { x: 1280 - 16 - 1280 * 0.32, y: 64, width: 1280 * 0.32, height: 720 * 0.32 };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Player {
  page: Page;
  ev: Evidence;
  touch: boolean;
}

const layoutOf = (s: GameSnapshot) => s.layout as { layout: string; panes: number };
const panesOf = (s: GameSnapshot) =>
  s.panes as { layout: string; opponentVisible: boolean; youLabel: boolean };
const paneOf = (s: GameSnapshot) =>
  s.opponentPane as { enemiesShown: number; paintsCreated: number; state: string };
const modeOf = (s: GameSnapshot) => (s.touch as { mode: string }).mode;
const overlayOf = (s: GameSnapshot): string | null =>
  ((s.versus as { overlay: string | null } | null | undefined) ?? null)?.overlay ?? null;
const paintsOf = (s: GameSnapshot) => (s.debug as { paintsCreated: number }).paintsCreated;

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(`${SERVER}/healthz`)).ok;
  } catch {
    return false;
  }
}

async function open(browser: Browser, journey: string, touch: boolean): Promise<Player> {
  const context = await browser.newContext(
    // Every field explicitly: the project's `use` (a Pixel 7) is the default for every new context of the run.
    touch
      ? { ...devices['Pixel 7 landscape'] }
      : { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
  );
  const page = await context.newPage();
  const ev = startEvidence(page, journey);
  try {
    await openGame(page);
    await waitForSnapshot(page, (s) => s.state === 'title', 10_000);
  } catch (e) {
    await ev.shot('boot-failed').catch(() => undefined);
    ev.flush();
    throw e;
  }
  return { page, ev, touch };
}

/** Taps on a phone, clicks on the desktop page. */
async function press(p: Player, name: string): Promise<void> {
  const button = p.page.getByRole('button', { name, exact: true });
  await expect(button).toBeEnabled({ timeout: 10_000 });
  if (p.touch) await button.tap();
  else await button.click();
}

/** Title → Multiplayer → the default character → the entry screen, the nickname filled in. */
async function toEntry(p: Player, nickname: string): Promise<void> {
  await press(p, 'Multiplayer');
  await waitForSnapshot(p.page, (s) => s.state === 'characterSelect', 5_000);
  await press(p, 'Start');
  await waitForSnapshot(p.page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(p.page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 10_000 });
  await p.page.locator('#mp-nickname').fill(nickname);
}

/** A creates a room, B joins it, both ready, A starts; resolves once both play the match. */
async function startMatch(a: Player, b: Player, nickA: string, nickB: string): Promise<void> {
  await toEntry(a, nickA);
  await press(a, 'Create room');
  await waitForSnapshot(a.page, (s) => s.state === 'lobby', 10_000);
  const code = (await a.page.locator('.room-code').textContent()) ?? '';
  await toEntry(b, nickB);
  await press(b, 'Join room');
  await b.page.locator('#mp-code').fill(code);
  await press(b, 'Join');
  await waitForSnapshot(b.page, (s) => s.state === 'lobby', 10_000);
  for (const p of [a, b]) {
    // #150 (the issue thread): the lobby has a hint for the input mode in use.
    await expect(p.page.locator('.lobby .hint.touch-only')).toBeVisible({ visible: p.touch });
    await expect(p.page.locator('.lobby .hint.keys-only')).toBeVisible({ visible: !p.touch });
  }
  await a.ev.shot('lobby');
  for (const p of [a, b]) await press(p, 'Ready');
  await press(a, 'Start');
  for (const p of [a, b]) {
    await waitForSnapshot(p.page, (s) => s.state === 'versusPlaying', 20_000);
    // `I` is no movement key, so it keeps a phone in touch mode.
    await p.page.keyboard.press('KeyI');
  }
}

/** Answers versus level-ups with `1` and closes chests with Enter (neither switches the input mode) until stopped. */
function answerDialogs(page: Page): () => Promise<void> {
  const control = { running: true };
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        const overlay = overlayOf(await snapshot(page));
        if (overlay === 'levelUp') await page.keyboard.press('1');
        else if (overlay === 'chest') await page.keyboard.press('Enter');
      } catch {
        // closing
      }
      await page.waitForTimeout(100).catch(() => undefined);
    }
  })();
  return async () => {
    control.running = false;
    await loop;
  };
}

/** The pane rects (window CSS pixels) from `#screens`, the canvas and the opponent panel's box. */
async function boxes(page: Page): Promise<{ self: Rect; opp: Rect; canvas: Rect; panel: Rect }> {
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
    const box = (sel: string): Rect => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!r) throw new Error(`${sel} missing`);
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      self: read('self'),
      opp: read('opp'),
      canvas: box('canvas'),
      panel: box('.opponent-panel'),
    };
  });
}

/** RGB of the device pixel at each point (window CSS coordinates), decoded from one screenshot in the page. */
async function samplePoints(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, points }) => {
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
      return points.map(({ x, y }) => {
        const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
      });
    },
    { png, points },
  );
}

const white = (rgb: number[]) => rgb.every((v) => v >= 180);

/** Checks the `pip` layout on `p`: both threads, the inset rect, its frame, the panel under it, live enemies. */
async function expectPip(p: Player, log: Record<string, unknown>, key: string): Promise<void> {
  const s = await waitForSnapshot(
    p.page,
    (x) => layoutOf(x).layout === 'pip' && panesOf(x).layout === 'pip',
    5_000,
  );
  expect(panesOf(s)).toEqual({ layout: 'pip', opponentVisible: true, youLabel: false });
  const b = await boxes(p.page);
  await p.ev.shot(`pip-${key}`);
  // The own view fills the canvas; the inset is ADR 0024's rect at the canvas scale (CSS px per logical unit).
  const k = b.canvas.height / 720;
  expect(b.self.width).toBeCloseTo(1280 * k, 1);
  expect(b.self.height).toBeCloseTo(b.canvas.height, 1);
  expect(b.opp.x - b.canvas.x).toBeCloseTo(PIP.x * k, 1);
  expect(b.opp.y - b.canvas.y).toBeCloseTo(PIP.y * k, 1);
  expect(b.opp.width).toBeCloseTo(PIP.width * k, 1);
  expect(b.opp.height).toBeCloseTo(PIP.height * k, 1);
  expect(b.opp.width / b.self.width).toBeCloseTo(0.32, 3);
  // The panel sits directly under the inset, as wide as it.
  expect(b.panel.x).toBeCloseTo(b.opp.x, 0);
  expect(b.panel.y).toBeCloseTo(b.opp.y + b.opp.height + 4, 0);
  expect(b.panel.width).toBeCloseTo(b.opp.width, 0);
  // The white frame on the inset's top edge: 20 columns over its middle 80%, each a short vertical line across the
  // edge (the canvas is resampled to the screenshot's device pixels), framed when one of its samples is white.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 9; j++)
      points.push({
        x: b.opp.x + b.opp.width * (0.1 + (0.8 * i) / 19),
        y: b.opp.y + (j / 8 - 0.5) * 4 * k,
      });
  const rgb = await samplePoints(p.page, points);
  const columns = Array.from({ length: 20 }, (_, i) => rgb.slice(i * 9, i * 9 + 9).some(white));
  const whiteShare = columns.filter(Boolean).length / columns.length;
  expect(whiteShare).toBeGreaterThan(0.9);
  // ADR 0024: a gap of ground between the HUD's kill count (ends at y = 50) and the backdrop (starts at 62): the rows at
  // y = 53..59 across the inset's width hold neither HUD text (white or its black outline) nor the frame.
  const gapPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < 40; i++)
    for (const ly of [53, 56, 59])
      gapPoints.push({ x: b.opp.x + (b.opp.width * i) / 39, y: b.canvas.y + ly * k });
  const gap = await samplePoints(p.page, gapPoints);
  const hudOrFrame = gap.filter((c) => white(c) || c.every((v) => v <= 24));
  expect(hudOrFrame).toEqual([]);
  await p.page.screenshot({
    path: `${p.ev.dir}/pip-${key}-gap.png`,
    clip: {
      x: b.opp.x - 40 * k,
      y: b.canvas.y,
      width: b.opp.width + 40 * k + 16 * k,
      height: (PIP.y + 40) * k,
    },
  });
  const live = await waitForSnapshot(p.page, (x) => paneOf(x).enemiesShown > 0, 15_000);
  log[key] = {
    layout: layoutOf(live),
    panes: panesOf(live),
    opponentPane: paneOf(live),
    mode: modeOf(live),
    boxes: b,
    frameWhiteShare: whiteShare,
    gapSamples: gap.length,
  };
}

test('versus 11: touch devices show the opponent as a framed top-right inset; desktop keeps the split and switches live (mobile-chromium)', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-chromium',
    'opens its own phone and desktop contexts',
  );
  test.skip(!(await serverUp()), `no game server at ${SERVER}/healthz`);
  test.setTimeout(240_000);
  const log: Record<string, unknown> = {};
  const a = await open(browser, 'versus-11-pip/a-phone', true);
  const b = await open(browser, 'versus-11-pip/b-phone', true);
  noteEvidence(testInfo, a.ev);
  const players = [a, b];
  try {
    for (const p of [a, b]) expect(modeOf(await snapshot(p.page))).toBe('touch');
    await startMatch(a, b, 'Alice', 'Bob');
    const stops = [answerDialogs(a.page), answerDialogs(b.page)];
    // Both phones play for 10 s: the opponent's enemies reach the inset.
    await a.page.waitForTimeout(10_000);
    await expectPip(a, log, 'phoneA');
    await expectPip(b, log, 'phoneB');
    for (const stop of stops) await stop();
    for (const p of [a, b]) expect(pageErrors(p.ev)).toEqual([]);
    // The phones close before the next match, so at most two software-rendered pages run at once.
    a.ev.json('pip', log);
    for (const p of players.splice(0)) {
      p.ev.flush();
      await p.page.context().close();
    }

    // Match 2: a desktop page beside a phone.
    const c = await open(browser, 'versus-11-pip/c-desktop', false);
    const d = await open(browser, 'versus-11-pip/d-phone', true);
    players.push(c, d);
    expect(modeOf(await snapshot(c.page))).toBe('keys');
    await startMatch(c, d, 'Carol', 'Dave');
    const stops2 = [answerDialogs(c.page), answerDialogs(d.page)];
    const split = await waitForSnapshot(
      c.page,
      (x) => layoutOf(x).layout === 'columns' && paneOf(x).enemiesShown > 0,
      20_000,
    );
    expect(panesOf(split)).toEqual({ layout: 'columns', opponentVisible: true, youLabel: true });
    const splitBoxes = await boxes(c.page);
    expect(splitBoxes.opp.width).toBeCloseTo(splitBoxes.self.width, 1);
    await c.ev.shot('desktop-columns');
    await expectPip(d, log, 'phoneD');
    const before = { opponent: paneOf(split).paintsCreated, own: paintsOf(split) };

    // A touch on the desktop page (CDP touch emulation, so the browser sends real `touch` pointer events).
    const cdp = await c.page.context().newCDPSession(c.page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const t0 = Date.now();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 300, y: 400, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const toPip = await waitForSnapshot(
      c.page,
      (x) => modeOf(x) === 'touch' && layoutOf(x).layout === 'pip' && panesOf(x).layout === 'pip',
      3_000,
    );
    const pipMs = Date.now() - t0;
    await expectPip(c, log, 'desktopTouched');
    // A movement key: keys mode and the split again.
    const t1 = Date.now();
    await c.page.keyboard.press('ArrowRight');
    const back = await waitForSnapshot(
      c.page,
      (x) =>
        modeOf(x) === 'keys' && layoutOf(x).layout === 'columns' && panesOf(x).layout === 'columns',
      3_000,
    );
    const splitMs = Date.now() - t1;
    expect(panesOf(back).youLabel).toBe(true);
    await c.ev.shot('desktop-keys-columns');
    // Switch twice more; the opponent pane creates no Paint on any switch (ADR 0003, ADR 0024). The own view's count is
    // logged only: its pools are independent of the layout.
    for (let i = 0; i < 2; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 300, y: 400, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await waitForSnapshot(c.page, (x) => panesOf(x).layout === 'pip', 3_000);
      await c.page.keyboard.press('ArrowRight');
      await waitForSnapshot(c.page, (x) => panesOf(x).layout === 'columns', 3_000);
    }
    const after = await snapshot(c.page);
    const afterPaints = { opponent: paneOf(after).paintsCreated, own: paintsOf(after) };
    log.switches = {
      pipMs,
      splitMs,
      toPip: { layout: layoutOf(toPip), panes: panesOf(toPip) },
      back: { layout: layoutOf(back), panes: panesOf(back) },
      paints: { before, after: afterPaints },
    };
    expect(afterPaints.opponent).toBe(before.opponent);
    for (const stop of stops2) await stop();
    for (const p of [c, d]) expect(pageErrors(p.ev)).toEqual([]);
  } finally {
    a.ev.json('pip', log);
    for (const p of players) {
      p.ev.flush();
      await p.page.context().close();
    }
  }
});
