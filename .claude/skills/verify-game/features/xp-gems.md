# XP gems

Experience gems (#11, ADRs 0007, 0008): every killed enemy drops a gem worth its `xp` where it died, coloured by tier; gems within the magnet radius fly to the player and add XP, which fills the XP bar along the top of the HUD; beyond 400 gems on the ground one red merge gem absorbs the rest.

## Sub-features

- **Drops:** each kill (`kills` rises) adds a gem at the bat's position: `snapshot().gems` rises and `gemPositions` lists `[uid, tier, x, y, value]`. Bats are worth 1 XP: blue (`gem.blue`, tier 0); 5–9 XP is green (`gem.green`, tier 1), 10 or more red (`gem.red`, tier 2). A gem first shows under the grey death puff, visible 0.3 s later.
- **Lying still:** a gem more than 60 units (`BASE_PICKUP_RANGE`) from the player keeps its position (`gemPositions` x, y unchanged) for as long as the run lasts; gems never despawn.
- **Magnet and collection:** within 60 units a gem starts flying toward the player (150 units/s, +600 units/s²) and follows him even when he walks away; within 14 units it disappears and `player.xp` rises by its value.
- **XP bar:** the `ui.xpBar` frame spans the top edge of the view with a blue fill at `xp / xpToNext(level)` of its width, and `Lv n` at its right end; the `mm:ss` timer sits just below it. When `xp` reaches the requirement the level-up dialog opens (`level-up.md`).
- **Cap and merge gem:** at most `GEM_CAP` 400 normal gems plus one red merge gem live (`gems` at most 401); drops beyond the cap add their value to the merge gem, created at the first overflowing drop's position; collecting it can give several levels at once. Unit-tested only (`gems.test.ts`), see Gotchas.
- Snapshot fields: `gems` (live gem count), `gemPositions`, `player.xp`, `player.level`, registered in `worker/index.ts` (`worker/game/snapshot.ts`).

## How to get to it (user POV)

Open the game URL and press Enter on "Start". Standing still, the Whip kills bats within a few seconds; gems of bats that die near the player fly in at once, those farther out stay until the player walks toward them with the arrow keys. A level-up dialog may open while doing so: press `1` to continue. No server and no debug key are needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`.
2. `javascript_tool` `JSON.stringify((await window.__vsTest.waitFor((s) => s.gems > 0, 30000)).gemPositions)` → rows with tier 0 and value 1; wait 0.4 s and `screenshot`, `zoom` around the player → small blue gems lying right of the player. If `state` is `'levelUp'`, `computer` `key` `1` first.
3. Pick a `gemPositions` row more than 80 units from `player`; `computer` `key` `ArrowRight` (or `ArrowLeft`) with `repeat` until the player is within 60 units of it (the extension's presses are short taps, so it takes several); `javascript_tool` the snapshot again → that uid is gone and `player.xp` (or `player.level`) rose.
4. `zoom` the top edge → the blue fill of the XP bar and `Lv n` at the right; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/xp-gems.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g xp-gems`. Evidence: `xp-gems-1-collect/` (`collect.json` with the target gem before and after, the walk and the XP gained; `zoom-gem-on-ground.png`, `zoom-xp-bar.png` and full screenshots).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/xp-gems.md (#11).
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
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
    const walkMs = ((Math.hypot(target[2] - p.x, target[3] - p.y) - 50) / 140) * 1000;
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
```

## Gotchas

- A fresh gem lies under the grey death puff for 0.3 s; the journey waits 0.35 s before its screenshot (2026-11-08, #11).
- Standing still, bats killed within 60 units are collected at once and the first level-up comes after 7–8 s; the journey answers dialogs with `1` while it looks for a gem outside the magnet range (2026-11-08, #11).
- The cap and merge gem (more than 400 gems on the ground) are not reachable in a live run yet: a standing player dies within about 20 s with about 40 kills, and `]` stops at the first level-up and ends in death. Until #17's invulnerability (`KeyI`) exists, the cap is proven at level 4 only (`packages/client/src/worker/game/gems.test.ts`: value conservation past the cap, over a whole simulated run, and a new merge gem after the first is collected). With `KeyI`: press it, then `]` several times answering level-ups, and read `gems` (at most 401) and the red row in `gemPositions` (2026-11-08, #11).
- Magnet radius, fly speed and the cap are initial values, untuned against footage (`docs/reference/gameplay.md` § Experience gems) (2026-11-08, #11).
