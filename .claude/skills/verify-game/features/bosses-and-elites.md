# Bosses and elites

Bosses and elite enemies (#15, ADRs 0005, 0007, 0008): `reaper5` and `reaper10` are bosses that are never left behind (tethered to the player) and always drop a chest; any normal enemy can be an elite with 10× HP, 1.5× contact damage and 1.5× size over a red marker, and it drops a chest too. When they appear in the stage is #17; #21's Elite Call reuses `spawnElite`.

## Sub-features

- **Bosses:** `reaper5` (`boss.reaper5`, 2000 HP, speed 60, contact 20, radius 40, xp 100) and `reaper10` (`boss.reaper10`, 6000 HP, speed 70, contact 30, radius 48, xp 250); initial values, untuned. `snapshot().bosses` lists `{ id, distance }` per live boss (distance from the player, whole units).
- **Tether:** every 0.5 s a boss farther than 1360 units from the player moves to the spawn ring (just outside the view), on the side the player is walking toward; its HP is kept and it is never despawned. Walking one way for 30 s, `bosses[0].distance` stays below about 1440 (1360 plus one interval of walking) and the boss keeps reappearing on screen (distance below 640).
- **Elites:** drawn at 1.5× their base art over a red circle (opacity 90) the size of their 1.5× collision circle; HP is 10× (an elite bat has 50), contact damage 1.5×. No art of their own (ADR 0007).
- **Chests:** a boss or an elite that dies leaves one chest (`chests`, `chestPositions`); opening it is `chests-and-evolutions.md`.
- **Hits:** contact damage, projectiles and the whip, garlic and book queries reach bosses and elites at their full radius (`MAX_ENEMY_RADIUS` is 48; level 4, `bosses-elites.test.ts`).
- **Debug key `B` (dev builds):** spawns `reaper5` on the spawn ring (worker log `[debug] spawnBoss: reaper5`); `E` spawns an elite in front of the player (`chests-and-evolutions.md`). Only for preconditions.
- Snapshot fields: `bosses`, `enemies`, `enemyPositions`, `chests`, `chestPositions`, `state`, `player`.

## How to get to it (user POV)

Open the game URL and start a run (Enter on "Start", then on the character select once #14 is in). Press `B` for a boss and hold one arrow key: it keeps reappearing ahead. Press `E` for an elite in front of the player. In normal play bosses and elites come from #17's schedule. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter` (and `Enter` again on a character select).
2. `computer` `key` `b`; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).bosses)` → one `reaper5`; `screenshot`.
3. Hold right: `computer` `key` `ArrowRight` repeatedly (or `left_mouse_down`-free key holds with `computer` `key` and `duration`) for 30 s, reading `bosses[0].distance` every few seconds and pressing `1` on any level-up → never above about 1440; `screenshot` when the boss is back on screen.
4. Retry or start a new run, `computer` `key` `e`; `screenshot` → the elite at 1.5× over its red marker; wait until `chests > 0` or `state === 'chest'`; `screenshot`. `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/bosses-and-elites.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g bosses`. Evidence: `bosses-1-tether/` (`tether.json` with a distance sample every 250 ms; spawned, on-screen and end screenshots) and `bosses-2-elite/` (`elite.json`; marker and chest screenshots).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/bosses-and-elites.md (#15).
import { expect, test } from '@playwright/test';
import {
  answerLevelUps,
  holdKeys,
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';

type Boss = { id: string; distance: number };
const bosses = (s: GameSnapshot) => s.bosses as Boss[];
const player = (s: GameSnapshot) => s.player as { x: number; y: number; hp: number };

test('bosses 1: B spawns reaper5, and walking right for 30 s never leaves it behind', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'bosses-1-tether');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const stop = answerLevelUps(page);
    await page.keyboard.press('b'); // precondition only: the `B` debug key
    const spawned = await waitForSnapshot(page, (s) => bosses(s).length === 1, 3_000);
    await ev.shot('spawned');
    const samples: { timeS: number; x: number; state: string; bosses: Boss[] }[] = [];
    const start = Date.now();
    await page.keyboard.down('ArrowRight');
    let shots = 0;
    while (Date.now() - start < 30_000) {
      // A short sidestep now and then, so the walk does not run straight into the boss each time it is tethered ahead.
      if (samples.length % 8 === 4) await holdKeys(page, ['ArrowDown'], 150);
      const s = await snapshot(page);
      samples.push({ timeS: s.timeS, x: player(s).x, state: s.state, bosses: bosses(s) });
      if (s.state === 'results') break;
      const d = bosses(s)[0]?.distance ?? Infinity;
      if (d < 640 && shots < 6) {
        shots++;
        await ev.shot(`boss-on-screen-${String(shots)}`);
      }
      await page.waitForTimeout(250);
    }
    await page.keyboard.up('ArrowRight');
    await stop();
    const last = await snapshot(page);
    await ev.shot('end');
    const playing = samples.filter((s) => s.state !== 'results');
    const distances = playing.map((s) => s.bosses[0]?.distance ?? Infinity);
    ev.json('tether', {
      spawned: { bosses: bosses(spawned), player: player(spawned) },
      samples,
      max: Math.max(...distances),
      walked: (playing.at(-1)?.x ?? 0) - player(spawned).x,
      last: { state: last.state, bosses: bosses(last) },
    });
    expect(playing.every((s) => s.bosses.length === 1)).toBe(true);
    // The tether runs every 0.5 s: at most one interval of walking (70 units) past 1360.
    expect(Math.max(...distances)).toBeLessThan(1360 + 80);
    // It reappears on screen (the view is 1280×720, so within about 640 units).
    expect(distances.some((d) => d < 640)).toBe(true);
    expect((playing.at(-1)?.x ?? 0) - player(spawned).x).toBeGreaterThan(2000);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('bosses 2: an elite is drawn 1.5× over a red marker and drops a chest (E as precondition)', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const ev = startEvidence(page, 'bosses-2-elite');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const stop = answerLevelUps(page);
    await page.keyboard.press('e'); // precondition only: spawns an elite in front of the player
    const near = await waitForSnapshot(page, (s) => s.enemies >= 1 && s.timeS >= 300, 3_000);
    await ev.shot('elite-marker');
    const dropped = await waitForSnapshot(
      page,
      (s) => (s.chests as number) > 0 || s.state === 'chest',
      20_000,
    );
    await ev.shot('chest');
    await stop();
    ev.json('elite', {
      near: { enemies: near.enemies, enemyPositions: near.enemyPositions },
      dropped: {
        state: dropped.state,
        chests: dropped.chests,
        chestPositions: dropped.chestPositions,
      },
    });
    expect(dropped.state === 'chest' || (dropped.chests as number) === 1).toBe(true);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- The tether runs every 0.5 s, so a boss can be up to one interval of walking past 1360 units before it moves; the journey allows 80 units over. In #15's run the largest distance was 1358 over 30 s and 4110 units walked (2026-11-08, #15).
- Walking straight runs into the boss each time it is placed ahead (contact 20); the journey sidesteps down briefly every 2 s so the player survives the 30 s (2026-11-08, #15).
- The boss's death and its chest are covered at level 4 (`chest-open.test.ts`); killing 2000 HP with starting weapons is not practical in a journey until #17 brings bosses at their minute (2026-11-08, #15).
- Bosses count toward `ENEMY_CAP`: `B` at the cap spawns nothing and logs `not spawned` (2026-11-08, #15).
