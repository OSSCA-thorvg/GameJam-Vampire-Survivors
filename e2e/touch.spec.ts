// Touch journeys (#149): drives .claude/skills/verify-game/features/touch-controls.md. Runs in the `mobile-chromium`
// project (a Pixel 7 in landscape: taps, and joystick drags through CDP `Input.dispatchTouchEvent`) and the opt-in
// `mobile-webkit` project (an iPhone 14 in landscape: taps only, since Playwright's WebKit has no touch drag). The
// desktop journey runs in the `chromium` project and checks that a mouse never sees a touch control.
import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type GameSnapshot,
} from './helpers';

interface TouchSnapshot {
  mode: 'touch' | 'keys';
  stickActive: boolean;
  axis: [number, number];
  pauseButton: boolean;
  rotateHint: boolean;
}

const touchOf = (s: GameSnapshot): TouchSnapshot =>
  (s as unknown as { touch: TouchSnapshot }).touch;
const audioUnlocked = (s: GameSnapshot): boolean =>
  (s as unknown as { audio: { unlocked: boolean } }).audio.unlocked;
const playerOf = (s: GameSnapshot) => s.player as { x: number; y: number };
const isMobile = (name: string): boolean => name.startsWith('mobile-');

/** One finger through CDP (Chromium only): the same touch events a phone sends, so pointer events are `touch`. */
function finger(cdp: CDPSession) {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  return {
    down: (x: number, y: number) => send('touchStart', x, y),
    /** Moves in `steps` small moves, as a real drag does. */
    async move(fromX: number, fromY: number, x: number, y: number, steps = 6) {
      for (let i = 1; i <= steps; i++)
        await send(
          'touchMove',
          fromX + ((x - fromX) * i) / steps,
          fromY + ((y - fromY) * i) / steps,
        );
    },
    up: () => send('touchEnd', 0, 0),
  };
}

const pausedDialog = (page: Page): Locator => page.locator('[role="dialog"][aria-label="Paused"]');

/** Title → character → run with taps only; asserts sound unlocked on the first tap. */
async function tapIntoRun(page: Page, ev: ReturnType<typeof startEvidence>): Promise<GameSnapshot> {
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  await ev.shot('title');
  await page.getByRole('button', { name: 'Start' }).tap();
  const select = await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  expect(touchOf(select).mode).toBe('touch');
  // ADR 0021: the first tap is a trusted gesture that creates the AudioContext (touchend/click on iOS Safari).
  await waitForSnapshot(page, audioUnlocked, 5_000);
  await page.getByRole('option', { name: 'Swift' }).tap();
  await expect(page.getByRole('option', { name: 'Swift', selected: true })).toHaveCount(1);
  await ev.shot('character-select');
  await page.getByRole('button', { name: 'Start' }).tap();
  const playing = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
  expect(playing.characterId).toBe('swift');
  const t = touchOf(playing);
  expect(t.stickActive).toBe(true);
  expect(t.pauseButton).toBe(true);
  return playing;
}

/** `L` (dev precondition) opens a level-up; a tap on the first card answers it. */
async function tapLevelUp(page: Page, ev: ReturnType<typeof startEvidence>): Promise<void> {
  await page.keyboard.press('l');
  await waitForSnapshot(page, (s) => s.state === 'levelUp', 5_000);
  const after = await snapshot(page);
  expect(touchOf(after).mode).toBe('touch'); // `L` is not a movement key
  expect(touchOf(after).stickActive).toBe(false);
  await ev.shot('level-up');
  await page.locator('[role="dialog"][aria-label="Level up"] button.card').first().tap();
  await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
}

/** The pause button pauses; Resume resumes. */
async function tapPause(page: Page, ev: ReturnType<typeof startEvidence>): Promise<void> {
  await page.locator('#pause-button').tap();
  await expect(pausedDialog(page)).toBeVisible();
  expect(touchOf(await snapshot(page)).pauseButton).toBe(false);
  await expect(page.locator('#pause-button')).toBeHidden();
  await ev.shot('paused');
  await page.getByRole('button', { name: 'Resume' }).tap();
  await expect(pausedDialog(page)).toHaveCount(0);
  expect(touchOf(await snapshot(page)).pauseButton).toBe(true);
}

/** Portrait shows the rotate hint and pauses the run; landscape again hides it and Resume continues. */
async function rotate(page: Page, ev: ReturnType<typeof startEvidence>): Promise<void> {
  const landscape = page.viewportSize() ?? { width: 863, height: 360 };
  await page.setViewportSize({ width: 412, height: 915 });
  await waitForSnapshot(page, (s) => touchOf(s).rotateHint, 5_000);
  await expect(page.locator('#rotate-hint')).toBeVisible();
  await expect(page.locator('#rotate-hint')).toHaveText('Rotate your device to landscape');
  await expect(pausedDialog(page)).toHaveCount(1);
  const held = await snapshot(page);
  await page.waitForTimeout(500);
  expect((await snapshot(page)).timeS).toBe(held.timeS);
  await ev.shot('rotate-hint');
  await page.setViewportSize(landscape);
  await waitForSnapshot(page, (s) => !touchOf(s).rotateHint, 5_000);
  await expect(pausedDialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).tap();
  await expect(pausedDialog(page)).toHaveCount(0);
}

test('touch 1: taps start a run, the joystick moves in 8 directions, level-up, pause, portrait and no scrolling (mobile-chromium)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'CDP touch drags need Chromium');
  const ev = startEvidence(page, 'touch-1');
  noteEvidence(testInfo, ev);
  try {
    const ready = await openGame(page);
    expect(ready.renderer).toBe('gl');
    await tapIntoRun(page, ev);
    const cdp = await page.context().newCDPSession(page);
    const f = finger(cdp);

    // Right by 60 px, held 2 s: axis [1, 0] and the player moves right.
    await f.down(300, 200);
    await f.move(300, 200, 360, 200);
    const start = await waitForSnapshot(page, (s) => touchOf(s).axis[0] === 1, 2_000);
    expect(touchOf(start).axis).toEqual([1, 0]);
    await ev.shot('joystick-right');
    await page.waitForTimeout(2_000);
    const right = await snapshot(page);
    ev.json('snapshot-joystick-right', { start, right });
    expect(touchOf(right).axis).toEqual([1, 0]);
    expect(playerOf(right).x - playerOf(start).x).toBeGreaterThanOrEqual(200);
    expect(playerOf(right).y).toBe(playerOf(start).y);

    // Up-left (from the same finger), then release.
    await f.move(360, 200, 250, 150);
    const upLeft = await waitForSnapshot(page, (s) => touchOf(s).axis[0] === -1, 2_000);
    expect(touchOf(upLeft).axis).toEqual([-1, -1]);
    await page.waitForTimeout(500);
    const movedUpLeft = await snapshot(page);
    expect(playerOf(movedUpLeft).x).toBeLessThan(playerOf(upLeft).x);
    expect(playerOf(movedUpLeft).y).toBeLessThan(playerOf(upLeft).y);
    await ev.shot('joystick-up-left');
    await f.up();
    const released = await waitForSnapshot(page, (s) => touchOf(s).axis[0] === 0, 2_000);
    expect(touchOf(released).axis).toEqual([0, 0]);
    await page.waitForTimeout(300);
    const still = await snapshot(page);
    const later = await (async () => {
      await page.waitForTimeout(500);
      return snapshot(page);
    })();
    expect([playerOf(later).x, playerOf(later).y]).toEqual([playerOf(still).x, playerOf(still).y]);

    // A swipe and a pinch over the game neither scroll nor zoom the page, and no text can be selected.
    await f.down(500, 300);
    await f.move(500, 300, 500, 40, 10);
    await f.up();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 400, y: 180, id: 1 },
        { x: 440, y: 180, id: 2 },
      ],
    });
    for (let i = 1; i <= 6; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: 400 - i * 30, y: 180, id: 1 },
          { x: 440 + i * 30, y: 180, id: 2 },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const page_ = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scale: window.visualViewport?.scale ?? 1,
      userSelect: getComputedStyle(document.body).userSelect,
      touchAction: getComputedStyle(document.body).touchAction,
      selection: String(window.getSelection() ?? ''),
    }));
    ev.json('page-after-swipe-and-pinch', page_);
    expect(page_).toEqual({
      scrollX: 0,
      scrollY: 0,
      scale: 1,
      userSelect: 'none',
      touchAction: 'none',
      selection: '',
    });

    await tapLevelUp(page, ev);
    await tapPause(page, ev);
    await rotate(page, ev);
    expect(touchOf(await snapshot(page)).stickActive).toBe(true);

    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('touch 2: taps start a run, answer a level-up, pause and resume, and portrait pauses (every mobile project)', async ({
  page,
}, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'touch devices only');
  const ev = startEvidence(page, `touch-2-${testInfo.project.name}`);
  noteEvidence(testInfo, ev);
  try {
    const ready = await openGame(page);
    expect(ready.renderer).toBe('gl');
    await tapIntoRun(page, ev);
    await tapLevelUp(page, ev);
    await tapPause(page, ev);
    await rotate(page, ev);
    ev.json('snapshot-end', await snapshot(page));
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('touch 3: a chest closes with a tap (I and E as preconditions, every mobile project)', async ({
  page,
}, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'touch devices only');
  test.setTimeout(120_000);
  const ev = startEvidence(page, `touch-3-${testInfo.project.name}`);
  noteEvidence(testInfo, ev);
  try {
    await openGame(page);
    await tapIntoRun(page, ev);
    // Preconditions only (dev keys, not movement keys, so the mode stays touch): invulnerable, then an elite whose chest
    // the maxed weapon drops near the player (features/chests-and-evolutions.md).
    await page.keyboard.press('i');
    await page.keyboard.press('e');
    const deadline = Date.now() + 60_000;
    let s = await snapshot(page);
    while (s.state !== 'chest' && Date.now() < deadline) {
      if (s.state === 'levelUp')
        await page.locator('[role="dialog"][aria-label="Level up"] button.card').first().tap();
      else if ((s.chests as number) > 0 && s.player) {
        // Walk into the chest with short arrow pulses (a precondition; WebKit has no touch drag).
        const [cx, cy] = (s.chestPositions as [number, number][])[0] ?? [0, 0];
        const p = playerOf(s);
        const keys = [
          ...(Math.abs(cx - p.x) > 8 ? [cx > p.x ? 'ArrowRight' : 'ArrowLeft'] : []),
          ...(Math.abs(cy - p.y) > 8 ? [cy > p.y ? 'ArrowDown' : 'ArrowUp'] : []),
        ];
        for (const k of keys) await page.keyboard.down(k);
        await page.waitForTimeout(120);
        for (const k of keys) await page.keyboard.up(k);
      }
      await page.waitForTimeout(100);
      s = await snapshot(page);
    }
    expect(s.state).toBe('chest');
    await expect(page.locator('[role="dialog"][aria-label="Treasure"]')).toBeVisible();
    await ev.shot('chest');
    await page.locator('[role="dialog"][aria-label="Treasure"]').tap();
    const closed = await waitForSnapshot(page, (x) => x.state !== 'chest', 2_000);
    ev.json('snapshot-after-chest-tap', closed);
    expect(['playing', 'levelUp']).toContain(closed.state);
    expect(touchOf(closed).mode).toBe('touch');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

const SERVER = process.env.VERIFY_SERVER_HTTP ?? 'http://localhost:8787';

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(`${SERVER}/healthz`)).ok;
  } catch {
    return false;
  }
}

/** A second phone of the same project (its device descriptor), on the title screen. */
async function phone(browser: Browser, testInfo: TestInfo, journey: string) {
  const {
    viewport,
    deviceScaleFactor,
    isMobile: mobile,
    hasTouch,
    userAgent,
  } = testInfo.project.use;
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
    ...(mobile === undefined ? {} : { isMobile: mobile }),
    ...(hasTouch === undefined ? {} : { hasTouch }),
    ...(userAgent === undefined ? {} : { userAgent }),
  });
  const page = await context.newPage();
  const ev = startEvidence(page, journey);
  await openGame(page);
  await waitForSnapshot(page, (s) => s.state === 'title', 10_000);
  return { page, ev };
}

/**
 * Taps a control on a screen that may be taller than a landscape phone: scrolls it to the centre first and lets the
 * scroll settle, because a touch on a still-moving scroller stops the scroll instead of clicking (as on a real phone).
 */
async function settledTap(target: Locator): Promise<void> {
  await target.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
  });
  await target.page().waitForTimeout(250);
  await target.tap();
}

/** Title → Multiplayer → a character → Start, by taps; the entry screen connects. */
async function tapToEntry(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Multiplayer' }).tap();
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.getByRole('option', { name: 'Ember' }).tap();
  await page.getByRole('button', { name: 'Start' }).tap();
  await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 10_000 });
}

test('touch 4: the versus entry and lobby work by taps; versus has the joystick but no pause button (server on :8787)', async ({
  browser,
}, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), 'touch devices only');
  test.skip(!(await serverUp()), `no game server at ${SERVER}/healthz`);
  test.setTimeout(120_000);
  const a = await phone(browser, testInfo, `touch-4-${testInfo.project.name}/a`);
  const b = await phone(browser, testInfo, `touch-4-${testInfo.project.name}/b`);
  noteEvidence(testInfo, a.ev);
  try {
    await tapToEntry(a.page);
    // The nickname is typed as with the phone's keyboard; every action is a tap.
    await a.page.locator('input.nickname').tap();
    await a.page.keyboard.type('Alice');
    await a.ev.shot('entry');
    await settledTap(a.page.getByRole('button', { name: 'Create room' }));
    await waitForSnapshot(a.page, (s) => s.state === 'lobby', 10_000);
    const code = (await a.page.locator('.room-code').textContent()) ?? '';
    await tapToEntry(b.page);
    await b.page.locator('input.nickname').tap();
    await b.page.keyboard.type('Bob');
    await settledTap(b.page.getByRole('button', { name: 'Join room' }));
    await settledTap(b.page.locator('input.code'));
    await b.page.keyboard.type(code);
    await b.ev.shot('join');
    await settledTap(b.page.getByRole('button', { name: 'Join', exact: true }));
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 10_000);
    for (const p of [a, b]) {
      const ready = p.page.getByRole('button', { name: 'Ready' });
      await expect(ready).toBeEnabled({ timeout: 10_000 });
      await settledTap(ready);
    }
    const start = a.page.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled();
    await a.ev.shot('lobby');
    await settledTap(start);
    for (const p of [a, b]) {
      const s = await waitForSnapshot(p.page, (x) => x.state === 'versusPlaying', 20_000);
      const t = touchOf(s);
      expect(t.mode).toBe('touch');
      expect(t.stickActive).toBe(true);
      expect(t.pauseButton).toBe(false);
      await expect(p.page.locator('#pause-button')).toBeHidden();
    }
    await a.ev.shot('versus');
    if (testInfo.project.name === 'mobile-chromium') {
      const f = finger(await a.page.context().newCDPSession(a.page));
      const before = await snapshot(a.page);
      await f.down(300, 200);
      await f.move(300, 200, 300, 260);
      const moving = await waitForSnapshot(a.page, (s) => touchOf(s).axis[1] === 1, 2_000);
      expect(touchOf(moving).axis).toEqual([0, 1]);
      await a.page.waitForTimeout(800);
      const after = await snapshot(a.page);
      await f.up();
      a.ev.json('versus-joystick', { before: before.player, after: after.player });
      expect(playerOf(after).y).toBeGreaterThan(playerOf(before).y + 50);
      await a.ev.shot('versus-joystick');
    }
    expect(pageErrors(a.ev)).toEqual([]);
    expect(pageErrors(b.ev)).toEqual([]);
  } finally {
    a.ev.flush();
    b.ev.flush();
    await a.page.context().close();
    await b.page.context().close();
  }
});

test('touch desktop: a mouse and the keyboard never see a touch control (chromium)', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'desktop only');
  const ev = startEvidence(page, 'touch-desktop');
  noteEvidence(testInfo, ev);
  try {
    await openGame(page);
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await expect(page.locator('#fullscreen')).toBeHidden();
    await page.getByRole('button', { name: 'Start' }).click();
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await page.keyboard.press('Enter');
    const playing = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    const t = touchOf(playing);
    ev.json('snapshot-playing', playing);
    expect(t.mode).toBe('keys');
    expect(t.stickActive).toBe(false);
    expect(t.pauseButton).toBe(false);
    expect(t.rotateHint).toBe(false);
    await expect(page.locator('#pause-button')).toBeHidden();
    await expect(page.locator('#touch-layer')).toBeHidden();
    await ev.shot('desktop-playing');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
