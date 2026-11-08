# Enemies

Enemies spawn just outside the view from the per-minute wave table (`STAGE.waves`), chase the player while keeping apart, are relocated ahead of the player when left far behind, and never exceed `ENEMY_CAP` (400) alive (#8).

## Sub-features

- **Spawning off-screen:** every enemy UID appears for the first time outside the view (`|x - player.x| >= 640` or `|y - player.y| >= 360`); spawns are on the perimeter of the view expanded by 64 units. At minute 0 the first step tops up to `minAlive` 15 (`enemies` reads 15 on the first sample), then a batch of 3 arrives every 2 s. Minute 0 spawns bats and ghouls 3:1 (types `0` and `1`, #17).
- **Chase:** enemies walk toward the player at their speed (bat 140, ghoul 70 units/s since #17; skeleton 90, wisp 160, brute 55, wraith 80); after 10 s the mean distance to the player is well below the spawn ring's (about 110 measured against about 400+ at spawn).
- **Separation:** a standing player gets a crowd around it with no two enemies at the same point (no pair closer than 2 units after 60 s); enemies may overlap partly at the crowd's centre.
- **Density follows the data:** changing a wave's `minAlive` in `packages/shared/src/content/stage.ts` changes the crowd on the next load with no other code change (minute 0 at 40: the first sample reads 40 instead of 15).
- **Cap:** `enemies` never exceeds 400, also after `]` (fast-forward). Weapons kill enemies since #10 (`weapons.md`), so the live count depends on the kill rate; a fast-forward to minute 5 still reaches the cap when the Whip cannot keep up.
- **Relocation:** while the player runs in one direction, enemies farther than 1360 units are moved every 0.5 s to the spawn ring on the side the player is moving toward (a UID jumping more than 600 units lands at `x > player.x` when running right); the count never falls to zero and, after stopping, every enemy is within 1360 units.
- **Art:** `enemy.bat`, `enemy.ghoul`, `enemy.skeleton`, `enemy.wisp`, `enemy.brute` and `enemy.wraith`, mirrored when walking left. The wave mix per minute and the timed events are in `stage-and-finale.md` (#17).
- Snapshot fields: `enemies` (live count) and `enemyPositions` (`[uid, type, x, y]` per live enemy, `type` indexes `ENEMY_LIST`: 0 bat, 1 ghoul, 2 reaper5, 3 reaper10, 4 skeleton, 5 wisp, 6 brute, 7 wraith, 8 death; positions rounded), both registered in `worker/index.ts` (`worker/game/snapshot.ts`). `player` (#7) gives the view centre.

## How to get to it (user POV)

Open the game URL and press Enter on the title screen's "Start" (#9): enemies start arriving at once. Stand still or hold arrow keys. Later minutes are reached only with `]` (fast-forward 60 s, dev and e2e builds), as a precondition, after `I` (invulnerability, #17) so the player survives; `forwardTo(page, seconds)` in `e2e/helpers.ts` presses `]` and answers level-ups and chests on the way. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter` (Start, #9); `javascript_tool` `JSON.stringify((await window.__vsTest.waitFor((s) => s.state === 'playing', 5000)).enemies)` → 15 or a little more; `computer` `screenshot` every second for a few seconds → bats enter from the view edges, none appear inside the view.
3. `computer` `key` `i` (invulnerability, #17); wait 60 s pressing `1` on level-ups, `screenshot` → a crowd around the player, sprites not stacked on one point; `javascript_tool` reading `enemyPositions` → no two rows at the same `x`, `y`.
4. `computer` `key` `]` with `repeat: 5`; read `enemies` every 500 ms for 10 s → at most 400.
5. `computer` `key` `ArrowRight` with `repeat: 60`, `screenshot` → enemies still arrive from the edges; the long run that triggers relocation needs Playwright (Gotchas).
6. `gif_creator` `stop_recording` and `export` `{ download: true, filename: "issue-<N>-enemies.gif" }`; `tabs_close_mcp` on the tab.

The timed run, the pop-in check per UID and the fps measurement need the Playwright journeys below.

### Playwright

Save the spec as `verification/issue-<N>/journeys/enemies.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium` (`-g "enemies 1"` for one journey). Journey 5 is journey 1 again after changing minute 0's `minAlive` to 40 in `stage.ts` (Vite serves the new source on the next load), with `VERIFY_MIN_ALIVE=40`; revert the edit afterwards. Run journey 6 (fps) with `VERIFY_HEADED=1` for the real GPU; headless SwiftShader numbers mean nothing. Evidence: `enemies-1-spawn/` (`spawns.json` with `popIns` and the count per 100 ms, screenshots each second), `enemies-2-crowd/`, `enemies-3-cap/`, `enemies-4-relocate/` (`relocate.json` with every relocation), `enemies-6-fps/` (`fps.json` with the median and user agent).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/enemies.md (#8; invulnerable long runs since #17).
import { expect, test, type Page } from '@playwright/test';
import {
  answerLevelUps,
  forwardTo,
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';

type EnemyRow = [uid: number, type: number, x: number, y: number];
const enemyRows = (s: GameSnapshot): EnemyRow[] => s.enemyPositions as EnemyRow[];
const player = (s: GameSnapshot) => s.player as { x: number; y: number };
const HALF_W = 640;
const HALF_H = 360;
const inView = (s: GameSnapshot, [, , x, y]: EnemyRow): boolean =>
  Math.abs(x - player(s).x) < HALF_W && Math.abs(y - player(s).y) < HALF_H;

/**
 * Samples the snapshot every `everyMs` for `ms`, tracking enemy UIDs: every UID seen for the first time must be outside
 * the view (no pop-in). Calls `onSample` with each snapshot.
 */
async function watchSpawns(
  page: Page,
  ms: number,
  everyMs: number,
  onSample?: (s: GameSnapshot, i: number) => Promise<void> | void,
) {
  const seen = new Set<number>();
  const popIns: { uid: number; x: number; y: number; px: number; py: number }[] = [];
  const counts: number[] = [];
  const samples = Math.round(ms / everyMs);
  for (let i = 0; i <= samples; i++) {
    const s = await snapshot(page);
    counts.push(s.enemies as number);
    for (const row of enemyRows(s)) {
      if (seen.has(row[0])) continue;
      seen.add(row[0]);
      if (inView(s, row))
        popIns.push({ uid: row[0], x: row[2], y: row[3], px: player(s).x, py: player(s).y });
    }
    await onSample?.(s, i);
    if (i < samples) await page.waitForTimeout(everyMs);
  }
  return { seen: seen.size, popIns, counts };
}

/** `I` (#17, precondition only): the player takes no contact damage, so long and fast-forwarded runs survive. */
const invulnerable = async (page: Page) => {
  await page.keyboard.press('i');
  await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
};

test('enemies 1: spawn just outside the view and close in', async ({ page }, testInfo) => {
  const ev = startEvidence(page, 'enemies-1-spawn');
  noteEvidence(testInfo, ev);
  try {
    const ready = await startRun(page);
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    expect(ready.renderer).toBe('gl');
    const minAlive = Number(process.env.VERIFY_MIN_ALIVE ?? 15);
    const result = await watchSpawns(page, 10_000, 100, async (_s, i) => {
      if (i % 10 === 0) await ev.shot(`t${String(i / 10).padStart(2, '0')}s`);
    });
    const end = await snapshot(page);
    ev.json('spawns', { ...result, minAlive, end: { enemies: end.enemies, timeS: end.timeS } });
    expect(result.popIns).toEqual([]);
    expect(end.enemies as number).toBeGreaterThanOrEqual(minAlive);
    // Minute 0 is bats and ghouls (types 0 and 1, 3:1; #17).
    expect(enemyRows(end).every(([, type]) => type === 0 || type === 1)).toBe(true);
    // They chase: the mean distance to the player is below the spawn ring's.
    const mean =
      enemyRows(end).reduce(
        (sum, [, , x, y]) => sum + Math.hypot(x - player(end).x, y - player(end).y),
        0,
      ) / enemyRows(end).length;
    ev.json('mean-distance', { mean });
    expect(mean).toBeLessThan(500);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('enemies 2: standing still for 60 s, the crowd surrounds the player without fully overlapping', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'enemies-2-crowd');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await invulnerable(page);
    const stop = answerLevelUps(page);
    // 60 s of run time: level-up dialogs pause the run, so wait on the run clock, not the wall clock.
    await waitForSnapshot(page, (s) => s.timeS >= 60 && s.state === 'playing', 120_000);
    await stop();
    const end = await snapshot(page);
    await ev.shot('after-60s');
    const rows = enemyRows(end);
    let closest = Infinity;
    let coincident = 0;
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const d = Math.hypot(
          (rows[i]?.[2] ?? 0) - (rows[j]?.[2] ?? 0),
          (rows[i]?.[3] ?? 0) - (rows[j]?.[3] ?? 0),
        );
        closest = Math.min(closest, d);
        if (d < 2) coincident++;
      }
    const near = rows.filter(
      ([, , x, y]) => Math.hypot(x - player(end).x, y - player(end).y) < 200,
    ).length;
    ev.json('crowd', { enemies: end.enemies, near, closest, coincident, rows });
    expect(end.enemies as number).toBeGreaterThanOrEqual(15);
    expect(near).toBeGreaterThanOrEqual(10);
    expect(coincident).toBe(0);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('enemies 3: at minute 5 the count tops up to at least minAlive (90) and never exceeds 400', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'enemies-3-cap');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await invulnerable(page);
    const at5 = await forwardTo(page, 300); // precondition only: `]` until 5:00
    const stop = answerLevelUps(page);
    const counts: number[] = [];
    for (let i = 0; i <= 20; i++) {
      counts.push((await snapshot(page)).enemies as number);
      if (i < 20) await page.waitForTimeout(500);
    }
    await stop();
    await ev.shot('minute-5');
    ev.json('counts', { timeS: at5.timeS, counts });
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(90);
    expect(Math.max(...counts)).toBeLessThanOrEqual(400);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('enemies 4: running right for 30 s strands no enemies; relocated ones reappear ahead', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'enemies-4-relocate');
  noteEvidence(testInfo, ev);
  try {
    // Swift (161 units/s, #14) outruns bats (140 since #17); `I` (precondition only) keeps the long run alive.
    await startRun(page, '/', 2);
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    await waitForSnapshot(page, (s) => (s.enemies as number) >= 15, 15_000);
    const stop = answerLevelUps(page);
    const last = new Map<number, [number, number]>();
    const relocations: { uid: number; from: [number, number]; to: [number, number]; px: number }[] =
      [];
    const counts: number[] = [];
    await page.keyboard.down('ArrowRight');
    // Every 100 ms: an enemy moves less than the 64-unit spawn margin between samples (Gotchas).
    const result = await watchSpawns(page, 30_000, 100, async (s, i) => {
      counts.push(s.enemies as number);
      for (const [uid, , x, y] of enemyRows(s)) {
        const prev = last.get(uid);
        if (prev && Math.hypot(x - prev[0], y - prev[1]) > 600)
          relocations.push({ uid, from: prev, to: [x, y], px: player(s).x });
        last.set(uid, [x, y]);
      }
      if (i % 50 === 0) await ev.shot(`run-${String(i / 10).padStart(2, '0')}s`);
    });
    await page.keyboard.up('ArrowRight');
    await stop();
    await page.waitForTimeout(3000);
    const end = await snapshot(page);
    await ev.shot('stopped');
    const near = enemyRows(end).filter(
      ([, , x, y]) => Math.hypot(x - player(end).x, y - player(end).y) < 1360,
    ).length;
    ev.json('relocate', {
      popIns: result.popIns,
      counts,
      relocations,
      end: { enemies: end.enemies, player: end.player, near },
    });
    expect(Math.min(...counts)).toBeGreaterThan(0);
    expect(relocations.length).toBeGreaterThan(0);
    expect(relocations.every((r) => r.to[0] > r.px)).toBe(true);
    expect(result.popIns).toEqual([]);
    expect(near).toBe(end.enemies);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('enemies 6: fps at minute 14 with about 300 enemies', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'enemies-6-fps');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await invulnerable(page);
    await forwardTo(page, 14 * 60); // precondition only: `]` until 14:00
    const stop = answerLevelUps(page);
    await page.waitForTimeout(3000);
    const samples: { fps: number; enemies: number }[] = [];
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const s = await snapshot(page);
      samples.push({ fps: s.fps, enemies: s.enemies as number });
    }
    await stop();
    await ev.shot('minute-14');
    const sorted = samples.map((s) => s.fps).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    ev.json('fps', { median, samples, userAgent: await page.evaluate(() => navigator.userAgent) });
    expect(Math.min(...samples.map((s) => s.enemies))).toBeGreaterThanOrEqual(280);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Since #9 enemies hurt the player, and a standing player dies in 15–30 s: journeys 2, 3 and 6 press `I` (`toggleInvulnerable`, #17) first, answer level-ups, and reach later minutes with `forwardTo` instead of `]` × N, since a fast-forward stops at the first level-up (2026-11-08, #9; re-enabled 2026-11-08, #17).
- Journey 2's "at least 10 enemies within 200 units after 60 s" fails since level-ups are answered: by 1:00 the answered cards give the player Garlic and other weapons, which kill everything that comes close (#17's run: 25 alive, 6 within 200 units, closest pair 20.6 units, no coincident pairs). Separation itself is proven at level 4 (`separation.test.ts`) and by the journey's `coincident` 0; the crowd check needs a run without weapons, which no user path gives. Reported as failing, not weakened (2026-11-08, #17).
- The extension's `key` presses are instant down and up, so it cannot hold `ArrowRight` for 20 s; relocation needs the Playwright hold (2026-11-08, #8).
- Before #10 nothing killed enemies, so the count kept growing past `minAlive` with each batch, and `]` × 5 fills the cap with minute 0–2 bats; at minute 5 and 14 the field held 400 enemies, almost all bats, instead of the wave's mix, so the fps journey measured 400 enemies, a harder case than the issue's "about 300" (2026-11-08, #8). Since #10 the Whip thins the crowd on the facing side, so the counts read lower; journeys 2, 3 and 6 now use #17's invulnerability (2026-11-08, #10).
- Since #17 bats fly at 140 units/s, faster than the Warden (133), so only ghouls fall 1360 units behind; in 20 s one run in two saw no relocation. Journey 4 now plays Swift (161 units/s) with `I` on and runs for 30 s (2026-11-08, #17).
- Journey 4 samples every 100 ms, like journey 1. The player runs toward new spawns (closing speed about 240 units/s plus separation), so at the 250 ms it used before, a bat spawned ahead could drift up to about 60 units before its first sample, nearly the whole 64-unit margin; since #10 kills cause more top-up spawns ahead, and 1 of 3 runs failed with two first sightings 0.3 units inside the view edge (2026-11-08, #10). At 100 ms the drift is at most about 30 units, so each UID's first sighting, compared with the view of that same sample, stays outside the view (5 of 5 runs passed, 2026-11-08, #86).
- Pop-in is checked per UID between samples 100 ms apart; an enemy moves at most about 30 units (speed plus separation push) between its spawn and the sample, inside the 64-unit spawn margin (2026-11-08, #8).
- `camera.viewRect` returns one shared object: copy a result before calling it again (unit tests, 2026-11-08, #8).
