# Stage and finale

The one stage's schedule and its end (#17, ADRs 0005, 0007, 0008): a wave per minute from the six-enemy roster, a chest carrier per full minute before the finale (#156), two swarms, and at 15:00 the screen clears and Death appears in single player; every run ends on the results screen with the time, kills, level, character and each weapon's damage.

## Sub-features

- **Wave table:** `STAGE.waves` in `packages/shared/src/content/stage.ts`, 15 waves (minute 0–14), `minAlive` 12 → 230 and a live cap `maxAlive` of 2 × `minAlive`, at most 400 (the periodic batch is skipped at or above it, #148), a batch of 3 → 16 every 2.2 → 0.7 s, the mix moving from bats and ghouls to skeletons (from 3:00), wisps (5:00), brutes (7:00) and wraiths (10:00). Initial values, tuned for playability with the balance probe (#148), not against the original. `enemies` rises over the run and never exceeds 400 (#17's run before the retune: 15 at 0:00, about 90 at 5:00, about 200 at 10:00, about 390 at 14:00).
- **Events:** `STAGE.events` fires each event once at its time (`eventsFired` counts them, 0 → 17). Every minute from 1:00 through 14:00 has an elite or boss. The 1:00 carrier is an elite bat with a red marker. `bosses` lists `reaper5` after 5:00 and `reaper10` after 10:00 until defeated. The 6:30 ring of bats, 12:00 line of wisps and 13:30 pair of elite wraiths remain. At 12:00 both a swarm and an elite event fire. A boss or a scheduled elite at the 400 cap takes the farthest normal enemy’s slot. Since #148 the ring has 30 bats and the line 45 wisps; elites (the chest carriers included) neither count toward nor are held back by the wave's `maxAlive`.
- **Clear and Death (single player):** at 15:00 `cleared` turns true, every normal enemy disappears without gems or kills, the spawner and the events stop, and Death (`boss.death`, speed 200, contact 65535, ignores armor) spawns; bosses still alive stay. `enemies` equals `bosses.length`. Death cannot be damaged (#174): weapon hits and every other source only flash it, so its `bosses` entry keeps `hp` at its maximum (655350) and `death` never leaves `bosses`; check it by leaving invulnerability on with a levelled build for a while after the clear and reading `bosses[].hp`. The run goes on until Death (or anything else) kills the player.
- **Versus finale (`startRun.finale: 'end'`, #20):** the run ends at 15:00 with `cleared: true` and no Death (ADR 0005); a `'versus'` run always uses it (#20); driven at level 5 in `versus-match.md` journey 3.
- **Results:** heading "Stage cleared" when the run reached 15:00 (even if Death killed the player afterwards), otherwise "Game over"; Survived (`mm:ss`), Kills, Level, Character (display name), then Weapons (`<name> Lv n`, `<damage> dmg`, most damage first; damage counts only up to each enemy's remaining HP) and Passives (`<name>`, `Lv n`) side by side; Retry and Title as in `run-flow.md`.
- **Debug key `I` (dev builds):** toggles invulnerability (`debugInvulnerable` snapshot field, worker log `[debug] invulnerable: on`); precondition only, for long or fast-forwarded runs.
- Snapshot fields: `cleared`, `eventsFired`, `debugInvulnerable` (#17); `enemies`, `bosses` (#15; each entry `{ id, distance, hp }`, `hp` since #174), `kills`, `timeS`, `state`, `fps`.

## How to get to it (user POV)

Open the game URL, start a run (Enter on "Start", Enter on the character select). Normal play reaches 15:00 only after 15 real minutes; to reach later minutes press `I` (invulnerability) and then `]` (fast-forward 60 s) repeatedly, answering level-ups with `1` and chests with Enter; `forwardTo(page, seconds)` in `e2e/helpers.ts` does this. At 15:00 press `I` again and let Death reach the player. For an early death, start a run and stand still. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`, then `Enter` on the character select.
2. `computer` `key` `i`; `javascript_tool` `(await window.__vsTest.snapshot()).debugInvulnerable` → `true`.
3. Repeat: `computer` `key` `]`; `javascript_tool` `JSON.stringify((({ timeS, enemies, bosses, eventsFired, cleared, state }) => ({ timeS, enemies, bosses, eventsFired, cleared, state }))(await window.__vsTest.snapshot()))`; press `1` when `state` is `levelUp` and `Enter` when it is `chest`. `screenshot` after 3:00, 8:00 and 14:00 → `enemies` rises and stays at most 400, `reaper5` listed after 5:00, `reaper10` after 10:00.
4. At 14:00 press `` ` `` (perf overlay), wait 5 s, `screenshot`, read `fps`; press `` ` `` again.
5. Keep pressing `]` until `cleared` is true → `screenshot`: only Death and surviving bosses, gems lying around. `computer` `key` `i` → `debugInvulnerable` false; wait for `state === 'results'`; `screenshot` → "Stage cleared", the stats, weapons by damage, passives.
6. Enter on Retry (a fresh run), stand still, press `1` on level-ups, wait for `results` → "Game over" and the survived time. `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/stage-and-finale.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_HEADED=1 VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g stage` (headed for the real GPU frame rate; headless SwiftShader fps means nothing). Evidence: `stage-1-full-run/` (`full-run.json` with a sample per press, the minute-14 fps samples and median, the results DOM; screenshots at minutes 3, 8, 14, the perf overlay, the cleared field with Death and the results) and `stage-3-early-death/` (`early-death.json`, the results screenshot).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/stage-and-finale.md (#17).
import { expect, test } from '@playwright/test';
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

type Boss = { id: string; distance: number };
const bosses = (s: GameSnapshot) => (s.bosses as Boss[]).map((b) => b.id);

test('stage 1+2: density, events, bosses, clear at 15:00, Death and "Stage cleared"', async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const ev = startEvidence(page, 'stage-1-full-run');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await page.keyboard.press('i'); // precondition only: invulnerability for the fast-forwarded run
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    const samples: {
      timeS: number;
      enemies: number;
      bosses: string[];
      eventsFired: number;
      cleared: boolean;
    }[] = [];
    const record = (s: GameSnapshot) => {
      samples.push({
        timeS: Math.round(s.timeS * 10) / 10,
        enemies: s.enemies as number,
        bosses: bosses(s),
        eventsFired: s.eventsFired as number,
        cleared: s.cleared as boolean,
      });
    };
    record(await snapshot(page));
    for (const minute of [3, 8, 14]) {
      await forwardTo(page, minute * 60, record);
      await ev.shot(`minute-${String(minute)}`);
    }
    // Frame rate at minute 14 with the perf overlay shown; the real loop runs for 5 s.
    await page.keyboard.press('Backquote');
    const fps: number[] = [];
    const stop = answerLevelUps(page);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      fps.push((await snapshot(page)).fps);
    }
    await stop();
    await ev.shot('minute-14-perf-overlay');
    await page.keyboard.press('Backquote');
    const at900 = await forwardTo(page, 900, record);
    const cleared = await waitForSnapshot(page, (s) => s.cleared === true, 5_000);
    await ev.shot('cleared-death');
    record(cleared);
    expect(at900.state).toBe('playing');
    expect(cleared.enemies).toBe(bosses(cleared).length);
    expect(bosses(cleared)).toContain('death');
    expect(cleared.eventsFired).toBe(17);
    // Invulnerability off: Death (speed 200) catches the standing player.
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === false, 2_000);
    const over = await waitForSnapshot(page, (s) => s.state === 'results', 30_000);
    const heading = page.getByRole('heading', { level: 2 });
    await expect(heading).toHaveText('Stage cleared');
    const dom = {
      heading: await heading.textContent(),
      time: await page.locator('[data-stat="time"]').textContent(),
      kills: await page.locator('[data-stat="kills"]').textContent(),
      level: await page.locator('[data-stat="level"]').textContent(),
      character: await page.locator('[data-stat="character"]').textContent(),
      weapons: await page
        .locator('[data-list="weapons"] dt, [data-list="weapons"] dd')
        .allTextContents(),
      passives: await page
        .locator('[data-list="passives"] dt, [data-list="passives"] dd')
        .allTextContents(),
    };
    await ev.shot('results-stage-cleared');
    const sorted = [...fps].sort((a, b) => a - b);
    ev.json('full-run', {
      samples,
      fpsMinute14: fps,
      fpsMedian: sorted[Math.floor(sorted.length / 2)],
      over: { timeS: over.timeS, kills: over.kills, state: over.state },
      dom,
    });
    // Density rises and stays within the cap; both bosses on time; every event fired.
    for (const s of samples) expect(s.enemies).toBeLessThanOrEqual(400);
    const before = samples.filter((s) => s.timeS < 60).at(-1)?.enemies ?? 0;
    const late = samples.filter((s) => s.timeS >= 780 && s.timeS < 900).at(-1)?.enemies ?? 0;
    expect(late).toBeGreaterThan(before);
    for (const s of samples.filter((s) => s.timeS > 300 && s.timeS < 600 && !s.cleared))
      expect(s.eventsFired).toBeGreaterThanOrEqual(5);
    expect(samples.some((s) => s.timeS > 300 && s.bosses.includes('reaper5'))).toBe(true);
    expect(samples.some((s) => s.timeS > 600 && s.bosses.includes('reaper10'))).toBe(true);
    expect(dom.character).toBe('Warden');
    expect(Number(dom.kills)).toBe(over.kills);
    // Weapon rows are name/level then damage, most damage first; the Whip (Warden's start) is among them.
    const names = dom.weapons.filter((_, i) => i % 2 === 0);
    const damage = dom.weapons
      .filter((_, i) => i % 2 === 1)
      .map((d) => Number(d.replace(' dmg', '')));
    expect(names.some((n) => /^Whip Lv \d$/.test(n))).toBe(true);
    expect(damage).toEqual([...damage].sort((a, b) => b - a));
    expect(damage.every((d) => d > 0)).toBe(true);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('stage 3: dying early shows "Game over" with the survived time', async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000); // a standing Warden could live over 2 minutes in #148
  const ev = startEvidence(page, 'stage-3-early-death');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const stop = answerLevelUps(page);
    const over = await waitForSnapshot(page, (s) => s.state === 'results', 300_000);
    await stop();
    const heading = page.getByRole('heading', { level: 2 });
    await expect(heading).toHaveText('Game over');
    const time = await page.locator('[data-stat="time"]').textContent();
    const mm = Math.floor(over.timeS / 60);
    const ss = Math.floor(over.timeS % 60);
    await ev.shot('results-game-over');
    ev.json('early-death', { timeS: over.timeS, time, kills: over.kills, cleared: over.cleared });
    expect(time).toBe(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    expect(over.timeS).toBeLessThan(900);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- A fast-forward stops at the first pending level-up or chest, so `]` advances less than 60 s when a dialog opens; `forwardTo` answers and presses again, and its samples are per press, not per exact minute. It overshoots its target by up to 60 s, so the cleared screenshot is taken some seconds after 15:00 (2026-11-08, #17).
- `reaper5` is usually killed within seconds of 5:00 by the weapons an invulnerable, levelled player has, so it shows in only one or two samples; `reaper10` lasted until the finale in #17's runs. The journey checks that each was present after its time, not that it lives (2026-11-08, #17).
- The weapon damage totals are large in a fast-forwarded invulnerable run (the Cross dealt about 1.3 million over 15:45 in #17's run, about 15 000 kills), because the crowd stays packed around the player; they are untuned (2026-11-08, #17).
- The wave densities and event times are the issue's initial values; the owner decided not to tune them against footage, so `gameplay.md` § Enemies and waves records them as untuned (2026-11-08, #17). #148 retuned them for playability against the headless balance probe, still not against footage (2026-11-09, #148).
- Since #148 a Warden standing still dies in about 1–2 minutes (balance probe, seeds 1–30: 39–206 s, over 2 minutes in 2 of 30; 0:14–0:16 before), so journey 3's standing-still death ("stage 3") can take over 3 real minutes with the dialogs; so it waits up to 300 s (2026-11-10, #148). Since #173 a standing Warden dies at about 0:15 again (balance probe, seeds 1–3: 14.7–14.9 s); the 300 s wait stays as headroom (2026-11-10, #173).
- Since #148 the batches stop while `maxAlive` normal enemies live, so an invulnerable fast-forwarded run with few kills holds a smaller crowd than #17's samples; bosses and elites do not count toward the cap (2026-11-09, #148).
