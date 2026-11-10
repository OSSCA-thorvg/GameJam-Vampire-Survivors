# XP gems

Experience gems (#11, ADRs 0007, 0008): every killed enemy drops a gem worth its `xp` where it died, coloured by tier; gems within the magnet radius fly to the player and add XP, which fills the XP bar along the top of the HUD; beyond 400 gems on the ground each new drop still lands at its kill site, and idle gems off screen (or, when none are, the one farthest from the player) are folded into one red merge gem (#151).

## Sub-features

- **Drops:** each kill (`kills` rises) adds a gem at the bat's position: `snapshot().gems` rises and `gemPositions` lists `[uid, tier, x, y, value]`. Bats are worth 1 XP: blue (`gem.blue`, tier 0); 5–9 XP is green (`gem.green`, tier 1), 10 or more red (`gem.red`, tier 2). A gem first shows under the grey death puff, visible 0.3 s later.
- **Lying still:** a gem more than 60 units (`BASE_PICKUP_RANGE`) from the player keeps its position (`gemPositions` x, y unchanged) for as long as the run lasts; gems never despawn.
- **Magnet and collection:** within 60 units a gem starts flying toward the player (150 units/s, +600 units/s²) and follows him even when he walks away; within 14 units it disappears and `player.xp` rises by its value.
- **XP bar:** the `ui.xpBar` frame spans the top edge of the view with a blue fill at `xp / xpToNext(level)` of its width, and `Lv n` at its right end; the `mm:ss` timer sits just below it. When `xp` reaches the requirement the level-up dialog opens (`level-up.md`).
- **Cap and merge gem:** at most `GEM_CAP` 400 normal gems plus one red merge gem live (`gems` at most 401); past the cap each drop still appears at its kill site as a normal gem: the overflow folds every idle gem more than 256 units (`GEM_SWEEP_MARGIN`) beyond the view into the merge gem in one pass (the first such gem turns red in place when no merge gem exists), which leaves room for the next drops; when every idle gem is on screen, only the one farthest from the player is folded; only when every gem is flying does a drop go into the merge gem directly (#151); collecting it can give several levels at once. Journey 5 (#17) reaches the cap live: with `I` on and `]` (via `forwardTo`), `gems` reaches 401 by about 4:00 of a standing run and the red row in `gemPositions` worth more than 10 XP is the merge gem; its value keeps growing while `gems` stays at 401 (573 → 1410 XP from 4:00 to 5:00 in #17's run, before #151), and since #151 new rows keep appearing near the player. Value conservation is level 4 (`gems.test.ts`).
- Snapshot fields: `gems` (live gem count), `gemPositions`, `player.xp`, `player.level`, registered in `worker/index.ts` (`worker/game/snapshot.ts`).

## How to get to it (user POV)

Open the game URL and press Enter on "Start". Standing still, the Whip kills bats within a few seconds; gems of bats that die near the player fly in at once, those farther out stay until the player walks toward them with the arrow keys. A level-up dialog may open while doing so: press `1` to continue. No server and no debug key are needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`.
2. `javascript_tool` `JSON.stringify((await window.__vsTest.waitFor((s) => s.gems > 0, 30000)).gemPositions)` → rows with tier 0 and value 1; wait 0.4 s and `screenshot`, `zoom` around the player → small blue gems lying right of the player. If `state` is `'levelUp'`, `computer` `key` `1` first.
3. Pick a `gemPositions` row more than 80 units from `player`; `computer` `key` `ArrowRight` (or `ArrowLeft`) with `repeat` until the player is within 60 units of it (the extension's presses are short taps, so it takes several); `javascript_tool` the snapshot again → that uid is gone and `player.xp` (or `player.level`) rose.
4. `zoom` the top edge → the blue fill of the XP bar and `Lv n` at the right.
5. Merge gem (#17): reload and start, `computer` `key` `i`, then `]` repeatedly (pressing `1` on level-ups and Enter on chests) until `gems` is 401; `javascript_tool` the snapshot → one `gemPositions` row with tier 2 and a value above 10; `screenshot`; one more `]` → `gems` still 401 and that row's value higher. `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/xp-gems.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g xp-gems`. Journey 5 needs the `I` and `]` debug keys as preconditions. Evidence: `xp-gems-5-merge/` (`merge.json` with `gems`, the merge gem row and `kills` per press; screenshots at the cap and a minute later), `xp-gems-1-collect/` (`collect.json` with the target gem before and after, the walk and the XP gained; `zoom-gem-on-ground.png`, `zoom-xp-bar.png` and full screenshots).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/xp-gems.md (#11; journey 5 since #17).
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  forwardTo,
  holdKeys,
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from '../../../e2e/helpers';

interface PlayerSnap {
  x: number;
  y: number;
  hp: number;
  level: number;
  xp: number;
}
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const gems = (s: GameSnapshot) => s.gems as number;

/** A zoomed screenshot of the view's centre (the player and the strike area) or of the XP bar along the top. */
async function zoom(page: Page, ev: Evidence, name: string, area: 'centre' | 'bar'): Promise<void> {
  const v = page.viewportSize() ?? { width: 1280, height: 720 };
  const clip =
    area === 'centre'
      ? { x: v.width / 2 - 240, y: v.height / 2 - 120, width: 480, height: 240 }
      : { x: 0, y: 0, width: v.width, height: 60 };
  await page.screenshot({ path: join(ev.dir, `zoom-${name}.png`), clip });
}

type GemRow = [uid: number, tier: number, x: number, y: number, value: number];
const gemRows = (s: GameSnapshot) => s.gemPositions as GemRow[];

/** Answers an open level-up with key 1 (the journeys here are about gems, `level-up.md` drives the choice). */
async function answerLevelUp(page: Page, s: GameSnapshot): Promise<GameSnapshot> {
  if (s.state !== 'levelUp') return s;
  await page.keyboard.press('1');
  return waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
}

test('xp-gems 1: kills drop gems where they die, walking near one pulls it in, XP rises and the bar fills', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const ev = startEvidence(page, 'xp-gems-1-collect');
  noteEvidence(testInfo, ev);
  try {
    const start = await startRun(page);
    expect(player(start)).toMatchObject({ level: 1, xp: 0 });
    expect(gems(start)).toBe(0);
    // Standing still facing right, the Whip kills bats up to 160 units away; gems beyond the 60-unit magnet stay put.
    let s = start;
    let target: GemRow | undefined;
    for (let i = 0; i < 600 && !target; i++) {
      s = await answerLevelUp(page, await snapshot(page));
      const p = player(s);
      target = gemRows(s).find(([, , x, y]) => {
        const d = Math.hypot(x - p.x, y - p.y);
        return d > 80 && Math.abs(x - p.x) < 220 && Math.abs(y - p.y) < 100;
      });
      if (!target) await page.waitForTimeout(50);
    }
    if (!target) throw new Error('no gem landed outside the magnet range within 30 s');
    // The grey death puff (0.3 s) covers a fresh gem.
    await page.waitForTimeout(350);
    await ev.shot('gem-on-ground');
    await zoom(page, ev, 'gem-on-ground', 'centre');
    const lying = await snapshot(page);
    // The gem has not moved: it lies where its bat died.
    const still = gemRows(lying).find((g) => g[0] === target[0]);
    const before = {
      player: player(s),
      target,
      xp: player(s).xp,
      level: player(s).level,
      tiers: gemRows(s).map((g) => [g[1], g[4]]),
    };
    // Walk toward it until it is within the magnet radius, then stop: it flies in by itself.
    const p = player(lying);
    const keys = [target[2] > p.x ? 'ArrowRight' : 'ArrowLeft'];
    if (Math.abs(target[3] - p.y) > 30) keys.push(target[3] > p.y ? 'ArrowDown' : 'ArrowUp');
    // Warden's speed (#14): 140 × 0.95.
    const walkMs = ((Math.hypot(target[2] - p.x, target[3] - p.y) - 50) / 133) * 1000;
    await holdKeys(page, keys, Math.max(100, walkMs));
    const after = await waitForSnapshot(
      page,
      (n) => n.state === 'levelUp' || !gemRows(n).some((g) => g[0] === target[0]),
      3_000,
    );
    const collected = { player: player(after), state: after.state };
    s = await answerLevelUp(page, after);
    // A screenshot of the XP bar with some XP in it.
    const filled = await waitForSnapshot(
      page,
      (n) => n.state === 'playing' && player(n).xp > 0,
      30_000,
    ).catch(() => null);
    await ev.shot('xp-bar');
    await zoom(page, ev, 'xp-bar', 'bar');
    ev.json('collect', {
      before,
      still,
      walk: { keys, walkMs },
      collected,
      filled: filled && { timeS: filled.timeS, player: player(filled) },
    });
    expect(still?.slice(2, 4)).toEqual(target.slice(2, 4));
    // Blue gems for bats (1 XP each).
    expect(
      before.tiers.every(([tier, value]) => tier === (value < 5 ? 0 : value < 10 ? 1 : 2)),
    ).toBe(true);
    const xpUp = collected.player.level > before.level || collected.player.xp > before.xp;
    expect(xpUp).toBe(true);
    expect(filled).not.toBeNull();
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('xp-gems 5: past 400 gems on the ground, further drops go into one red merge gem (I and ] as preconditions)', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'xp-gems-5-merge');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await page.keyboard.press('i'); // precondition only: invulnerability (#17)
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    const samples: { timeS: number; gems: number; merge: GemRow | null; kills: number }[] = [];
    // The merge gem is the only red gem worth more than any enemy drops (wraith, 10 XP).
    const merge = (s: GameSnapshot) =>
      gemRows(s).find(([, tier, , , v]) => tier === 2 && v > 10) ?? null;
    const record = (s: GameSnapshot) => {
      samples.push({ timeS: s.timeS, gems: gems(s), merge: merge(s), kills: s.kills as number });
    };
    // Standing still, gems of kills beyond the magnet pile up; `]` until the cap is reached and a merge gem exists.
    for (let minute = 1; minute <= 14; minute++) {
      const s = await forwardTo(page, minute * 60, record);
      record(s);
      if (gems(s) >= 400 && merge(s)) break;
    }
    const capped = samples.find((x) => x.gems >= 400 && x.merge);
    if (!capped) throw new Error('the gem cap was not reached by minute 14');
    await ev.shot('cap-and-merge-gem');
    // More drops: the count stays at the cap and the merge gem's value grows.
    const later = await forwardTo(page, capped.timeS + 60, record);
    record(later);
    await ev.shot('merge-gem-later');
    ev.json('merge', { samples, capped, later: samples.at(-1) });
    expect(Math.max(...samples.map((x) => x.gems))).toBeLessThanOrEqual(401);
    expect(samples.filter((x) => x.merge).length).toBeGreaterThan(0);
    const last = samples.at(-1);
    expect(last?.gems).toBeLessThanOrEqual(401);
    if (last?.merge && last.kills > capped.kills && last.merge[0] === capped.merge?.[0])
      expect(last.merge[4]).toBeGreaterThan(capped.merge[4]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- A fresh gem lies under the grey death puff for 0.3 s; the journey waits 0.35 s before its screenshot (2026-11-08, #11).
- Standing still, bats killed within 60 units are collected at once and the first level-up comes after 7–8 s; the journey answers dialogs with `1` while it looks for a gem outside the magnet range (2026-11-08, #11).
- The cap and merge gem were not reachable in a live run before #17: a standing player died within about 20 s, and `]` stops at the first level-up. Journey 5 now drives it with `I` and `forwardTo`; that XP is not lost past the cap stays level 4 (`gems.test.ts`), since the snapshot cannot sum XP across level-ups (2026-11-08, #11; journey 5 added 2026-11-08, #17).
- Magnet radius, fly speed and the cap are initial values, untuned against footage (`docs/reference/gameplay.md` § Experience gems) (2026-11-08, #11).
- Before #151 every drop past 400 gems went into a merge gem at the 401st drop's position, so a player who walked on saw no gems from kills after about 7 minutes (user report, 2026-11-10). Since #151 off-screen gems (or the farthest one) are folded into the merge gem instead; to see it live, the cap must be reached while walking, then compare `gemPositions` near the player before and after a few kills (2026-11-10, #151).
