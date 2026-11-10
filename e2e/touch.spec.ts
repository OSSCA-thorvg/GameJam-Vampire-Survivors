// Touch journeys (#149): drives .claude/skills/verify-game/features/touch-controls.md. Runs in the `mobile-chromium`
// project (a Pixel 7 in landscape: taps, and joystick drags through CDP `Input.dispatchTouchEvent`) and the opt-in
// `mobile-webkit` project (an iPhone 14 in landscape: taps only, since Playwright's WebKit has no touch drag). The
// desktop journey runs in the `chromium` project and checks that a mouse never sees a touch control.
// #171 (ADR 0025): the touch journeys also check the cover fit (the canvas is the window, the view is cropped evenly
// and the HUD is drawn inside it), touch 5 does so on a 1024×768 touch page, and the desktop journeys check that a
// mouse keeps the letterbox and that a switch of input mode switches the fit at once without creating a Paint.
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
  coverFormula,
  expectCoverFit,
  fitBoxes,
  gridPoints,
  layoutOf,
  noteEvidence,
  openGame,
  pageErrors,
  samplePoints,
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

type Rgb = number[];
const count = (pixels: Rgb[], test: (r: number, g: number, b: number) => boolean): number =>
  pixels.filter(([r = 0, g = 0, b = 0]) => test(r, g, b)).length;
/** The ground is green-dominant; the HUD's dark frames, white texts and black outlines are not. */
const ground = (r: number, g: number, b: number): boolean => g > r + 15 && g > b + 15;

/**
 * #171, ADR 0025: the cover fit on a touch page in a run. The canvas is the window and `visible` is the formula's
 * rect (`expectCoverFit`); then the HUD is sampled from a screenshot at the places its anchors give, all inside the
 * window: the XP bar across the top edge, the timer at the top centre, the yellow "Weapons" heading at the top left,
 * the skull and kill count at the top right (with the pause button under them) and the red HP bar under the player.
 */
async function expectCoveredHud(
  page: Page,
  ev: ReturnType<typeof startEvidence>,
  name: string,
): Promise<void> {
  const { visible, k, boxes, layout } = await expectCoverFit(page);
  const w = visible.width;
  /** Where the visible area's top left is in the window: the canvas's corner (below a bar on a narrow window). */
  const o = { x: boxes.canvas.x, y: boxes.canvas.y };
  const areas = {
    // Rects in logical units from the visible area's top left (`render/hud.ts`).
    xpBar: gridPoints({ x: 8, y: 4, width: w - 16, height: 4 }, k, 24, 1, o),
    timer: gridPoints({ x: w / 2 - 56, y: 30, width: 112, height: 34 }, k, 56, 17, o),
    weapons: gridPoints({ x: 14, y: 28, width: 80, height: 20 }, k, 40, 10, o),
    hpBar: gridPoints({ x: w / 2 - 16, y: 360 - visible.y + 7, width: 32, height: 4 }, k, 16, 2, o),
    // The skull and the kill count, 132 to 60 units from the visible right edge.
    kills: gridPoints({ x: w - 132, y: 16, width: 72, height: 34 }, k, 36, 17, o),
  };
  for (const points of Object.values(areas))
    for (const { x, y } of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(boxes.innerWidth);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(boxes.innerHeight);
    }
  const all = Object.values(areas).flat();
  const rgb = await samplePoints(page, all);
  let at = 0;
  const take = (n: number): Rgb[] => rgb.slice(at, (at += n));
  const xpBar = take(areas.xpBar.length);
  const timer = take(areas.timer.length);
  const weapons = take(areas.weapons.length);
  const hpBar = take(areas.hpBar.length);
  const kills = take(areas.kills.length);
  // The pause button starts under the kill count (50 units from the visible top), so it covers no HUD element.
  const pause = await page.locator('#pause-button').boundingBox();
  if (!pause) throw new Error('pause button missing');
  expect(pause.y).toBeGreaterThanOrEqual(o.y + 50 * k);
  expect(pause.x + pause.width).toBeLessThanOrEqual(boxes.innerWidth);
  expect(pause.y + pause.height).toBeLessThan(boxes.innerHeight / 2);
  // Every HUD text ends before the next one starts (level 4 for every width: `hud-extents.test.ts`).
  expect(w).toBeGreaterThanOrEqual(1220 - 1e-6);
  const found = {
    pauseTop: pause.y,
    killCounter:
      count(kills, (r, g, b) => r >= 170 && g >= 170 && b >= 170) +
      count(kills, (r, g, b) => r <= 40 && g <= 40 && b <= 40),
    xpBarColumnsOnBar: count(xpBar, (r, g, b) => !ground(r, g, b)),
    timerWhite: count(timer, (r, g, b) => r >= 200 && g >= 200 && b >= 200),
    timerOutline: count(timer, (r, g, b) => r <= 40 && g <= 40 && b <= 40),
    weaponsYellow: count(weapons, (r, g, b) => r >= 190 && g >= 150 && b <= 170 && r > b + 50),
    hpRed: count(hpBar, (r, g, b) => r >= 140 && g <= 100 && b <= 90),
  };
  ev.json(`cover-${name}`, { layout, boxes, k, found });
  await ev.shot(`cover-${name}`);
  // The XP bar spans the visible width: nearly every column along the top edge is bar, not ground.
  expect(found.xpBarColumnsOnBar).toBeGreaterThanOrEqual(22);
  expect(found.timerWhite).toBeGreaterThanOrEqual(5);
  expect(found.timerOutline).toBeGreaterThanOrEqual(5);
  expect(found.weaponsYellow).toBeGreaterThanOrEqual(3);
  expect(found.hpRed).toBeGreaterThanOrEqual(4);
  expect(found.killCounter).toBeGreaterThanOrEqual(12);
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
    await expectCoveredHud(page, ev, 'phone');
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
    await expectCoveredHud(page, ev, 'phone');
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
    // #171, ADR 0025: desktop keeps the letterbox: the whole 1280×720 view in the old canvas box.
    expect(layoutOf(playing)).toMatchObject({
      fit: 'contain',
      layout: 'single',
      visible: { x: 0, y: 0, width: 1280, height: 720 },
    });
    expect((playing.panes as { visible: unknown }).visible).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
    expect((await fitBoxes(page)).canvas).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    await ev.shot('desktop-playing');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('touch 5: a 1024×768 touch page crops only down to the minimum width of the HUD and keeps bars above and below (mobile-chromium)', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'opens its own tablet context');
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const ev = startEvidence(page, 'touch-5-tablet');
  noteEvidence(testInfo, ev);
  try {
    await openGame(page);
    await tapIntoRun(page, ev);
    // Precondition (dev keys, no movement keys): a full inventory, so the longest rows are on screen.
    await page.keyboard.press('i');
    for (let i = 0; i < 6; i++) await page.keyboard.press('g');
    for (let i = 0; i < 6; i++) await page.keyboard.press('p');
    await page.waitForTimeout(300);
    await expectCoveredHud(page, ev, 'tablet');
    const { visible, boxes, full } = await expectCoverFit(page);
    // 4:3 would cover at 960 units of width; ADR 0025's floor keeps 1220 (30 cropped on each side), the whole height
    // of the view, and the canvas is 1024 × 604 between two 82 pixel bars.
    expect(full).toBe(false);
    expect(visible.y).toBe(0);
    expect(visible.width).toBeCloseTo(1220, 6);
    expect(visible.x).toBeCloseTo(30, 0);
    expect(visible.height).toBeCloseTo(720, 0);
    expect(boxes.canvas).toEqual({ x: 0, y: 82, width: 1024, height: 604 });
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
    await context.close();
  }
});

test('touch 6: the full boot splash and its held loading text stay inside the covered screen (mobile-chromium)', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the Pixel 7 page');
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'touch-6-splash');
  noteEvidence(testInfo, ev);
  interface Boot {
    splash?: { state: string; frame: number };
    loading?: { visible: boolean; held: boolean };
  }
  const boot = (s: GameSnapshot): Boot => s as unknown as Boot;
  try {
    // Precondition (as in splash.spec.ts): one asset is held back, so loading outlasts the 7 s splash.
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/enemies/bat.json', async (route) => {
      await released;
      await route.continue();
    });
    await page.goto('/?splash=full');
    await waitForSnapshot(page, (s) => boot(s).splash?.state === 'holding', 120_000);
    const s = await waitForSnapshot(page, (x) => boot(x).loading?.visible === true, 30_000);
    expect(boot(s).loading).toMatchObject({ visible: true, held: true });
    // The boot page is already covered: touch mode starts from the coarse pointer, before any tap. The `layout`
    // snapshot field exists only once the app has started, so the visible rect comes from the formula here and is
    // compared with the field on the title below.
    const boxes = await fitBoxes(page);
    expect(Math.abs(boxes.canvas.width - boxes.innerWidth)).toBeLessThan(1);
    expect(Math.abs(boxes.canvas.height - boxes.innerHeight)).toBeLessThan(1);
    const layout = {
      visible: coverFormula(boxes.innerWidth, boxes.innerHeight, boxes.dpr).visible,
    };
    const k = boxes.canvas.width / layout.visible.width;
    const text = await page.locator('#loading').boundingBox();
    if (!text) throw new Error('#loading missing');
    // Logical y 610, or higher when the crop would push it off the screen: its bottom ends at the visible bottom edge.
    const top = Math.min(610, layout.visible.y + layout.visible.height - 24);
    const geometry = { text, boxes, layout, expectedTop: (top - layout.visible.y) * k };
    ev.json('geometry-holding', geometry);
    expect(Math.abs(text.y - geometry.expectedTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(text.x + text.width / 2 - boxes.innerWidth / 2)).toBeLessThanOrEqual(2);
    expect(text.y + text.height).toBeLessThanOrEqual(boxes.innerHeight + 1);
    // The logo and wordmark (449..833 × 150..561 in the full view) are inside the screen: the rows just inside the
    // visible top and bottom edges are black, and the logo's middle is not.
    const row = (y: number) =>
      gridPoints({ x: 0, y, width: layout.visible.width, height: 1 }, k, 64, 1);
    const height = layout.visible.height;
    const [topRow, bottomRow, middle] = [row(3), row(height - 30), row(360 - layout.visible.y)];
    const rgb = await samplePoints(page, [...topRow, ...bottomRow, ...middle]);
    const lit = (pixels: number[][]): number => pixels.filter((c) => c.some((v) => v > 40)).length;
    const found = {
      topRowLit: lit(rgb.slice(0, 64)),
      bottomRowLit: lit(rgb.slice(64, 128)),
      middleLit: lit(rgb.slice(128)),
    };
    ev.json('splash-rows', found);
    expect(found.topRowLit).toBe(0);
    expect(found.bottomRowLit).toBe(0);
    expect(found.middleLit).toBeGreaterThan(0);
    await ev.shot('holding');
    release();
    await waitForSnapshot(page, (x) => x.state === 'title', 120_000);
    await expect(page.locator('#loading')).toHaveCount(0);
    expect((await expectCoverFit(page)).visible).toEqual(layout.visible);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('touch desktop 2: a letterboxed window switches to the cover fit at once on a touch and back on a key, creating no Paint (chromium)', async ({
  browser,
}, testInfo) => {
  test.skip(isMobile(testInfo.project.name), 'desktop only');
  // 1000×700: the letterboxed view is 1000×563 with bars above and below.
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  const ev = startEvidence(page, 'touch-desktop-2');
  noteEvidence(testInfo, ev);
  const paints = (s: GameSnapshot): number => (s.debug as { paintsCreated: number }).paintsCreated;
  try {
    await openGame(page);
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await page.keyboard.press('Enter');
    const playing = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    await page.keyboard.press('i'); // precondition: nobody dies during the switches
    expect(layoutOf(playing).fit).toBe('contain');
    const boxed = await fitBoxes(page);
    expect(boxed.canvas).toEqual({ x: 0, y: 68.5, width: 1000, height: 563 });
    await ev.shot('letterboxed');
    const log: unknown[] = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (let i = 0; i < 3; i++) {
      // A touch: touch mode, and the cover fit at once (larger, cropped left and right).
      const t0 = Date.now();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 300, y: 400, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const cover = await expectCoverFit(page);
      const coverMs = Date.now() - t0;
      expect(touchOf(await snapshot(page)).mode).toBe('touch');
      // 1000×700 is narrower than the floor's aspect ratio: 1220 units wide, 1000 × 590 with thinner bars.
      expect(cover.visible.y).toBe(0);
      expect(cover.visible.width).toBeCloseTo(1220, 6);
      expect(cover.boxes.canvas).toEqual({ x: 0, y: 55, width: 1000, height: 590 });
      if (i === 0) await ev.shot('covered-after-touch');
      // A movement key: keys mode, and the letterbox again.
      const t1 = Date.now();
      await page.keyboard.press('ArrowRight');
      const back = await waitForSnapshot(
        page,
        (s) => layoutOf(s).fit === 'contain' && touchOf(s).mode === 'keys',
        3_000,
      );
      const containMs = Date.now() - t1;
      expect(layoutOf(back).visible).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
      expect((back.panes as { visible: unknown }).visible).toEqual(layoutOf(back).visible);
      expect((await fitBoxes(page)).canvas).toEqual(boxed.canvas);
      log.push({ coverMs, containMs, paints: paints(back) });
    }
    await ev.shot('letterboxed-again');
    const after = await snapshot(page);
    ev.json('fit-switches', { before: paints(playing), after: paints(after), log });
    // ADR 0003: a fit switch only moves paints. Every pool is prewarmed past what a few seconds of a run use, so the
    // count of created pooled paints stays what it was before the first switch.
    expect(paints(after)).toBe(paints(playing));
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
    await context.close();
  }
});
