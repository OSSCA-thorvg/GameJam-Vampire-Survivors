# Movement

The player walks in eight directions at one constant speed from the arrow keys or WASD, the camera keeps the player centred, and the tiled ground scrolls underneath without gaps or seams (#7).

## Sub-features

- **Straight movement:** holding `ArrowRight` for 1 s raises `player.x` by 133 ± 10 (`BASE_MOVE_SPEED` 140 × the character's `moveSpeed`, 0.95 for the default Warden, #14; world units per second) and leaves `player.y` unchanged. W, A, S and D move up, left, down and right the same way.
- **Diagonals:** holding two keys (`ArrowRight` + `ArrowDown`, `w` + `a`, `s` + `d`) for 1 s moves 133 ± 10 units of distance, with equal `|dx|` and `|dy|` (diagonal equals straight, not 188). Other characters' speeds are in `character-select.md`.
- **Facing:** `player.facingX` is `-1` after a left input and `1` after a right input; it keeps its value when the input becomes vertical or stops. The `player.warden` sprite is mirrored when facing left (its darker shield side swaps from right to left on screen).
- **Stop:** releasing every key stops the player at once: `player` is unchanged over the next 500 ms while `steps` keep rising.
- **Tab switch stops movement:** holding a key and switching to another tab and back leaves the player stopped (#2's input clearing on blur and hide); the `'pause'` policy steps nothing while hidden, and the run comes back under the pause overlay (#9): after "Resume" the player stays where it was while `steps` rise.
- **Camera and ground:** the sprite stays at the centre of the view (feet at 640, 360 logical) wherever the player is, including negative coordinates; the `stage.ground` tiles cover the whole view with no seam (no full row or column darker than the ground) and no gap at the view edges, also at fractional view scales (tile edges between device pixels).
- **One full view in single player (#115):** a single-player run keeps `layout: { layout: 'single', panes: 1 }` (main) and `panes: { layout: 'single', opponentVisible: false, youLabel: false }` (worker) at any window size; no "YOU" label, and the ground still covers the view edges. The split view is versus only (`versus-match.md` journey 9; `versus-match.md` journey 10b checks this at 1600 × 900).
- Snapshot fields: `player` (`{ x, y, facingX, hp, maxHp, invulnerable }`, `worker/game/snapshot.ts`, `null` outside a run; #11 adds fields) and `timeS` (the run's simulated seconds, `world.time`), both registered in `worker/index.ts`. The base `steps` keeps counting steps since boot.

## How to get to it (user POV)

Open the game URL, press Enter on the title screen's "Start" (#9) and Enter on the character select (the default Warden, #14): the run starts with the player at `(0, 0)` facing right. Hold arrow keys or WASD. No server and no debug key are needed. `?gallery` and `?stress` show no title screen and create no run. Enemies hurt the player from about 5 s on and a player standing still dies in 15–30 s (`player-health.md`), so keep journeys short or keep moving.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab (or `tabs_create_mcp`); `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter` twice (Start, #9; Warden, #14); `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'playing', 5000))` → `player: { x: 0, y: 0, facingX: 1, hp: 120, maxHp: 120, invulnerable: false }`, no `testScene`; `computer` `screenshot`.
3. `computer` `key` `ArrowLeft` with `repeat: 30`, `screenshot`, then read the snapshot → `player.x` below 0, `facingX: -1`, the sprite mirrored and still at the centre.
4. `computer` `key` `ArrowUp` with `repeat: 30` → `facingX` still `-1`, `player.y` below 0; read the snapshot twice 500 ms apart → `player` unchanged, `steps` higher; `screenshot` and zoom on tile corners near the view edges.
5. `gif_creator` `stop_recording` and `export` `{ download: true, filename: "issue-<N>-movement.gif" }`; `tabs_close_mcp` on the tab.

Timed holds (the 1 s distances and the 30 s run) and the native tab switch need the Playwright journeys below.

### Playwright

Save the first spec as `verification/issue-<N>/journeys/movement.spec.ts` and the second as `verification/issue-<N>/journeys/movement/hidden-tab.spec.ts` (the file name `hidden-tab.spec.ts` routes it to the native headed `hidden-tab` project, which owns its browser; the subfolder keeps it apart from the checked-in hidden-tab journey). After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts` (both projects; `--project chromium` or `--project hidden-tab` for one). Evidence: `movement/` (distances per key as JSON, facing screenshots, six long-run screenshots with `seams-*.json`), `movement-fractional-scale/` and `movement-tab-switch/`.

```ts
// Feature-map journey for .claude/skills/verify-game/features/movement.md (#7).
import { expect, test, type Page } from '@playwright/test';
import {
  answerLevelUps,
  holdKeys,
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  type GameSnapshot,
} from '../../../e2e/helpers';

interface PlayerSnap {
  x: number;
  y: number;
  facingX: -1 | 1;
}
const player = (s: GameSnapshot): PlayerSnap => s.player as PlayerSnap;

/** Holds `keys` for `ms` and returns the snapshots before and after, plus the simulated time between them. */
async function hold(page: Page, keys: string[], ms: number) {
  const level = (s: GameSnapshot) => (s.player as { level: number }).level;
  for (let attempt = 1; ; attempt++) {
    const before = await snapshot(page);
    await holdKeys(page, keys, ms);
    await page.waitForTimeout(100); // let the release reach the worker
    const after = await snapshot(page);
    const dx = player(after).x - player(before).x;
    const dy = player(after).y - player(before).y;
    // #11: a level-up during the hold froze the run until `answerLevelUps` chose; hold again for a full distance.
    if (level(after) === level(before) || attempt === 3)
      return { before, after, dx, dy, dist: Math.hypot(dx, dy) };
  }
}

/**
 * Seam and gap check on a screenshot, decoded on a throwaway 2D canvas in the page (never the game canvas). The ground's
 * base colour is the most common pixel; a seam is a full row or column that is mostly darker than it (the clear
 * colour showing through), and a gap at a view edge is a border pixel much darker than it.
 */
async function seams(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const { width: w, height: h } = bitmap;
    const ctx = new OffscreenCanvas(w, h).getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const lum = (i: number) =>
      0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const base = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const baseLum = 0.299 * (base >> 16) + 0.587 * ((base >> 8) & 255) + 0.114 * (base & 255);
    const dark = (x: number, y: number) => lum((y * w + x) * 4) < baseLum - 12;
    const rows: number[] = [];
    const cols: number[] = [];
    // The XP bar along the top edge (#11, 12 view units of 720, plus the `Lv n` outline) is HUD, not ground.
    const top = Math.ceil((16 * h) / 720);
    for (let y = top; y < h; y++) {
      let n = 0;
      for (let x = 0; x < w; x++) if (dark(x, y)) n++;
      if (n > w / 2) rows.push(y);
    }
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = top; y < h; y++) if (dark(x, y)) n++;
      if (n > (h - top) / 2) cols.push(x);
    }
    // The top edge is under the XP bar and the HUD texts since #11, so only the other three edges are checked. A gap
    // darkens most of an edge line; an enemy sprite crossing the edge (dark ghouls from minute 0 since #17) darkens a
    // few dozen pixels, so an edge counts as a gap when more than half of it is dark, as for `rows` and `cols`.
    let bottom = 0;
    let left = 0;
    let right = 0;
    for (let x = 0; x < w; x++) if (dark(x, h - 1)) bottom++;
    for (let y = top; y < h; y++) {
      if (dark(0, y)) left++;
      if (dark(w - 1, y)) right++;
    }
    const edgeGap = bottom > w / 2 || left > (h - top) / 2 || right > (h - top) / 2;
    return { width: w, height: h, baseLum, rows, cols, edgeGap, edgeDark: { bottom, left, right } };
  }, png.toString('base64'));
}

/** Screenshots the page as evidence and asserts the ground shows no seam and no gap at the view edges. */
async function shotWithoutSeams(page: Page, ev: ReturnType<typeof startEvidence>, name: string) {
  // #11: the level-up dialog dims the whole view; check the ground only in frames without it.
  const clear = async () => (await snapshot(page)).state !== 'levelUp';
  let png = await page.screenshot();
  for (let i = 0; i < 20; i++) {
    const before = await clear();
    png = await page.screenshot();
    if (before && (await clear())) break;
    await page.waitForTimeout(100);
  }
  await ev.shot(name);
  const result = await seams(page, png);
  ev.json(`seams-${name}`, result);
  expect(result).toMatchObject({ rows: [], cols: [], edgeGap: false });
}

test('movement: 8 directions at one speed, facing, stop, camera and ground', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'movement');
  noteEvidence(testInfo, ev);
  try {
    const ready = await startRun(page);
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    expect(ready.renderer).toBe('gl');
    expect(player(ready)).toMatchObject({ facingX: 1 });
    expect(ready.testScene).toBeUndefined();
    await shotWithoutSeams(page, ev, 'start');

    // 1. ArrowRight for 1 s: x grows by 133 ± 10 (Warden, 140 × 0.95, #14), y unchanged.
    const right = await hold(page, ['ArrowRight'], 1000);
    ev.json('01-arrow-right', right);
    expect(right.dx).toBeGreaterThan(123);
    expect(right.dx).toBeLessThan(143);
    expect(right.dy).toBe(0);

    // 2. ArrowRight + ArrowDown for 1 s: the distance is 133 ± 10 (diagonal equals straight).
    const diagonal = await hold(page, ['ArrowRight', 'ArrowDown'], 1000);
    ev.json('02-diagonal', diagonal);
    expect(diagonal.dist).toBeGreaterThan(123);
    expect(diagonal.dist).toBeLessThan(143);
    expect(Math.abs(diagonal.dx - diagonal.dy)).toBeLessThan(1e-6);

    // 3. W, A, S, D, each and diagonally.
    const wasd: Record<string, unknown> = {};
    for (const [keys, sx, sy] of [
      [['w'], 0, -1],
      [['a'], -1, 0],
      [['s'], 0, 1],
      [['d'], 1, 0],
      [['w', 'a'], -1, -1],
      [['s', 'd'], 1, 1],
    ] as const) {
      const r = await hold(page, [...keys], 1000);
      wasd[keys.join('+')] = r;
      expect(r.dist).toBeGreaterThan(130);
      expect(r.dist).toBeLessThan(150);
      expect(Math.sign(Math.round(r.dx))).toBe(sx);
      expect(Math.sign(Math.round(r.dy))).toBe(sy);
    }
    ev.json('03-wasd', wasd);

    // 4. Facing left after ArrowLeft, kept after release; the player stops.
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(400);
    await ev.shot('holding-left-faces-left');
    const holding = await snapshot(page);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(100);
    const released = await snapshot(page);
    await ev.shot('released-still-faces-left');
    await page.waitForTimeout(500);
    const still = await snapshot(page);
    ev.json('04-facing-stop', { holding, released, still });
    expect(player(holding).facingX).toBe(-1);
    expect(player(released).facingX).toBe(-1);
    // Position and facing only: contact damage (#9) may change hp meanwhile.
    const pose = ({ x, y, facingX }: PlayerSnap) => ({ x, y, facingX });
    expect(pose(player(still))).toEqual(pose(player(released)));
    expect(still.steps).toBeGreaterThan(released.steps + 20);

    // 5. ArrowLeft + ArrowUp for 30 s into negative coordinates, a screenshot every 5 s. A fresh run (#9): the
    // first one has taken contact damage by now and could die on the way.
    await startRun(page);
    await page.keyboard.press('i'); // precondition only (#17): invulnerable, so the 30 s run cannot end in death
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    const trail: PlayerSnap[] = [];
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(5000);
      trail.push(player(await snapshot(page)));
      await shotWithoutSeams(page, ev, `long-run-${String(i * 5)}s`);
    }
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');
    ev.json('05-long-run', trail);
    const last = trail.at(-1);
    expect(last?.x).toBeLessThan(-2500);
    expect(last?.y).toBeLessThan(-2500);

    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test.describe('at a fractional view scale', () => {
  // 1005 × 565 CSS pixels: the root scale is about 0.785 and a tile spans 100.5 device pixels, so tile edges fall
  // between pixels, where edge-to-edge tiles showed seams in #5.
  test.use({ viewport: { width: 1005, height: 565 } });
  test('movement: the ground has no seams or gaps while scrolling into negative coordinates', async ({
    page,
  }, testInfo) => {
    const ev = startEvidence(page, 'movement-fractional-scale');
    noteEvidence(testInfo, ev);
    try {
      await startRun(page);
      answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
      await page.keyboard.down('ArrowLeft');
      await page.keyboard.down('ArrowUp');
      for (let i = 1; i <= 4; i++) {
        await page.waitForTimeout(2500);
        await shotWithoutSeams(page, ev, `scrolling-${String(i)}`);
      }
      await page.keyboard.up('ArrowUp');
      await page.keyboard.up('ArrowLeft');
      const end = await snapshot(page);
      ev.json('end', end);
      expect(player(end).x).toBeLessThan(-500);
      expect(pageErrors(ev)).toEqual([]);
    } finally {
      ev.flush();
    }
  });
});
```

```ts
// Journey 6 of .claude/skills/verify-game/features/movement.md (#7): switching tabs while a key is held stops the
// player. Saved as `hidden-tab.spec.ts` in a subfolder so the native `hidden-tab` project (its own headed browser)
// runs it.
import { expect } from '@playwright/test';
import { test } from '../../../../e2e/helpers/native-test';
import {
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
} from '../../../../e2e/helpers';
import { hidePage } from '../../../../e2e/helpers/hide-page';

test('movement: switching tabs while holding a key stops the player', async ({
  page,
  baseURL,
}, testInfo) => {
  const ev = startEvidence(page, 'movement-tab-switch');
  noteEvidence(testInfo, ev);
  let visibility;
  try {
    await startRun(page, baseURL);
    visibility = await hidePage(page); // creates the owned blank tab and starts hidden
    await visibility.show();
    // Hiding the tab paused the run (#9): resume from the overlay first.
    const paused = page.getByRole('dialog', { name: 'Paused' });
    await paused.waitFor();
    await page.keyboard.press('Enter');
    await paused.waitFor({ state: 'detached' });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    const moving = await snapshot(page);
    await ev.shot('holding-right');
    await visibility.hide();
    await page.waitForTimeout(1000);
    await visibility.show();
    await paused.waitFor();
    await page.keyboard.press('Enter');
    await paused.waitFor({ state: 'detached' });
    const back = await snapshot(page);
    await page.waitForTimeout(1000);
    const later = await snapshot(page);
    await ev.shot('back-stopped');
    await page.keyboard.up('ArrowRight');
    ev.json('tab-switch', { moving, back, later });
    const x = (s: typeof back) => (s.player as { x: number }).x;
    expect(x(moving)).toBeGreaterThan(30);
    expect(later.steps).toBeGreaterThan(back.steps + 30);
    expect(x(later)).toBe(x(back));
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    await visibility?.dispose();
    ev.flush();
  }
});
```

## Gotchas

- Since #11 the HUD's XP bar spans the top edge: the seam check skips the top band (16 view units) and no longer checks the top edge for gaps, and the journeys answer level-up dialogs with `answerLevelUps`; a hold during which the level rose is repeated (up to 3 times), since the dialog froze part of it, and the seam check skips frames with the dialog, which dims the whole view (2026-11-08, #11).
- The 30 s diagonal run (step 5) runs into relocated enemies ahead: one #9 run ended it at 15 HP of 100. It starts a fresh run for that reason and, since #17, presses `I` (invulnerability) first, so it can no longer die on the way (2026-11-08, #9; `I` added 2026-11-08, #17).
- The edge-gap check used to fail on any single border pixel darker than the ground. Since #17 ghouls (dark sprites) spawn from minute 0 and one crossing the bottom edge failed the 30 s run's check at 25 s with no gap in the ground; an edge now counts as a gap when more than half of its line is dark (`edgeDark` in the seams JSON has the counts). The fractional-scale journey then failed on `main` (92f81aa) with a dark left column (`cols: [0]`); #103 fixed it (2026-11-08, #17).
- The dark left column at 1005 × 565 (#17) was not a tile seam: it stayed fixed on screen, and with the page background set to magenta it turned magenta. `computeViewport` fitted the canvas to 1004.44 × 565 CSS pixels (1365.33 × 768 at 1366 × 768) with a 1004-pixel backing store, centred 0.28 px from the left edge, and the GPU compositor left device column 0 to the page. It only shows with the real GPU (`VERIFY_HEADED=1`): headless SwiftShader passed the same journey 6 times out of 6 on `main` a57e9b2, so run seam journeys headed as well. Since #103 the canvas covers whole device pixels at exactly its backing size and fills an axis whose letterbox would be under 2 device pixels (`main/viewport.ts`). A second edge case behind it: with the camera exactly on a tile boundary (the run's start at `(0, 0)`), snapping the world translate to whole device pixels moved the first tile up to half a pixel inside the view and left column 0 partly covered at 1366 × 768. The ground grid has therefore started one tile before the view since #103 (13 × 9 tiles, 117 paints). To tell a seam from an edge gap, inject `html,body{background:#f0f !important}` and screenshot standing still: magenta at an edge is a canvas or letterbox gap, a dark line that moves with the camera is a seam (2026-11-09, #103).
- Under heavy machine load (several agents or verify runs at once), the headless 1280 × 720 journey misses its 1 s hold distances and the diagonal `dx === dy` check by a few units, on `main` too (3 of 3 runs on a57e9b2's ground and viewport code); this is `holdKeys` timing, not movement. The headed run passed; rerun when the machine is quiet before treating it as a regression (2026-11-09, #103).
- Since #9 the run starts from the title screen and the player takes contact damage: `startRun` (`e2e/helpers.ts`) presses Enter on "Start" and, since #14, Enter on the character select (Warden); a long journey that stands still dies and ends on the results screen. Hiding the tab mid-run brings the pause overlay back (2026-11-08, #9).
- Each extension `key` press is an instant down and up, so the extension cannot prove distances per second; use the Playwright holds (2026-11-08, #7).
- `holdKeys` timing jitters by tens of milliseconds, and the release reaches the worker a step or two later: one hold measured 142.3 units for a nominal 1 s. The journey allowed 140 ± 10 (133 ± 10 since #14 made Warden, at 0.95 move speed, the default); one run of five failed once in #7 (its evidence was overwritten before it was read), so rerun once before treating a single miss as a regression (2026-11-08, #7).
- Seams only show at view scales where a tile edge falls between device pixels: at 1280 × 720 or 1000 × 563 the tiles land on whole pixels and edge-to-edge tiles look seamless. The fractional journey uses 1005 × 565 (100.5 device pixels per tile); with the 1-unit overlap removed it finds seam rows and columns in every screenshot, with it none (2026-11-08, #7).
- `hidePage` starts hidden: call `show()` before pressing keys, or the presses go to a hidden page and the player never moves (2026-11-08, #7).
- The starter `player.warden` art is small and nearly symmetric; facing is read from `player.facingX` and confirmed on screenshots by the darker shield side (2026-11-08, #7).
