# Weapons

The weapon system (#10, ADR 0008): owned weapons fire on their own cooldowns from data in `packages/shared/src/content/weapons.ts`; the player starts with the Whip, the dev key `G` grants the Magic Wand, and hits lower enemy HP, flash the enemy, push it back and, at 0 HP, remove it and count a kill.

## Sub-features

- **Starting Whip:** at run start `snapshot().weapons` is `[{ id: 'whip', level: 1 }]`. Standing still, the Whip strikes every 1.35 s of run time (first at 1.35 s): a white-and-yellow arc (`weapon.whip`, 160×40 at area 1) from the player toward the facing side, shown for 0.15 s. The player starts facing right (`player.facingX: 1`).
- **Facing side:** after a tap of ArrowLeft (`player.facingX: -1`) the next arc is on the left, mirrored. Whip L2+ adds a second strike on the opposite side 0.1 s later (reach it only through #11's level-ups; unit-tested in `whip.test.ts`).
- **Hits and kills:** every enemy whose circle overlaps the strike box loses the strike's damage once per strike. Bats (5 HP) die from one L1 strike (10 damage): they disappear with a grey puff (`fx.enemyDeath`) and `snapshot().kills` rises; the HUD skull counter shows the same number.
- **Flash and knockback:** a hit enemy shows a star spark (`fx.hit`) and is dimmed (opacity 140) for 0.1 s, then back to full; it is pushed away from the player at 200 units/s × `1 - knockbackResist` for 0.12 s (about 24 units for a bat). Observable on enemies that survive, so drive it with journey 5 (Whip L1 damage 1).
- **Magic Wand (`G`):** `G` adds `{ id: 'magicWand', level: 1 }` to `weapons` (worker log `[debug] grantWeapon: magicWand`; a second `G` grants nothing). Every 1.2 s a small cyan bolt (`weapon.magicWand`) leaves the player toward the nearest enemy within 900 units (or along the last movement direction), at 400 units/s, rotated along its flight, and the enemy nearest at launch dies (10 damage) shortly after.
- **Cap and expiry:** `snapshot().projectiles` (live bolts) never exceeds `PROJECTILE_CAP` 600; a bolt is removed after its hit (pierce 1) or after 2 s.
- **Results:** at death the results screen's Kills equal the last `kills` and the HUD counter (`run-flow.md`, `player-health.md`).
- **Data-driven:** changing a Whip level's `damage` or `cooldownSec` in `weapons.ts` changes the game on the next load with no other code change (journey 5: L1 damage 1, bats need five strikes).
- Snapshot fields: `weapons` (`{ id, level }[]` in slot order), `projectiles` (live count), `kills` (`world.stats.kills`), plus `player` (`facingX`), `enemyPositions` and `timeS`, all registered in `worker/index.ts` (`worker/game/snapshot.ts`).

## How to get to it (user POV)

Open the game URL and press Enter on "Start": the Whip is already equipped; stand still and bats arrive within a few seconds. Tap ArrowLeft to face left. The Magic Wand needs the dev key `G` (dev and e2e builds) as a precondition until #11's level-up choices exist. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).weapons)` → `[{"id":"whip","level":1}]`.
3. Wait about 6 s; take `screenshot`s in quick succession until one shows the arc to the right of the player (it shows for 0.15 s of every 1.35 s); `javascript_tool` `(await window.__vsTest.snapshot()).kills` → above 0 and equal to the HUD's skull counter on the screenshot (`zoom` the top right).
4. `computer` `key` `ArrowLeft`; `javascript_tool` `(await window.__vsTest.snapshot()).player.facingX` → `-1`; `screenshot`s until one shows the arc on the left.
5. `computer` `key` `g`; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).weapons)` → whip and magicWand at level 1; `screenshot`s → a cyan bolt leaving the player toward the nearest bat, which disappears with a puff; read `projectiles` a few times → at most 600.
6. `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'results', 90000))`; `get_page_text` → Kills equal to that snapshot's `kills`; `screenshot` (the HUD counter shows the same number behind the dialog).
7. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-weapons.gif" }`; `tabs_close_mcp` on the tab.

The timed strike capture, the knockback measurement and journey 5 need the Playwright journeys below.

### Playwright

Save the spec as `verification/issue-<N>/journeys/weapons.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g weapons` (`-g "weapons 1"` for one journey). Journey 5 is journey 1 again after changing the Whip's L1 `damage` from 10 to 1 in `packages/shared/src/content/weapons.ts` (Vite serves the new source on the next load), run with `VERIFY_WHIP_DAMAGE=1`; revert the edit afterwards. Evidence: `weapons-1-whip/` (`strikes.json` with the snapshot before each strike and right after its screenshot, the enemies in the strike box and their distance before and after; a screenshot at each strike and 100 and 200 ms later), `weapons-1-whip-damage-1/` (journey 5, same files), `weapons-2-turn-left/` (`turn.json`, the left strike), `weapons-3-magic-wand/` (`projectiles.json` with the count per 100 ms and each bolt's nearest enemy, burst screenshots per bolt), `weapons-4-kills/` (`kills.json`, HUD and results screenshots).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/weapons.md (#10).
import { expect, test, type Page } from '@playwright/test';
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

type EnemyRow = [uid: number, type: number, x: number, y: number];
interface PlayerSnap {
  x: number;
  y: number;
  facingX: -1 | 1;
  hp: number;
}
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const rows = (s: GameSnapshot) => s.enemyPositions as EnemyRow[];
const weapons = (s: GameSnapshot) => s.weapons as { id: string; level: number }[];

/** Whip L1 strikes every 1.35 s of run time, first at 1.35 s; its arc shows for 0.15 s (`weapons.ts`). */
const WHIP_COOLDOWN = 1.35;
const WHIP_SHOWN = 0.15;
const sinceStrike = (t: number) => t - Math.floor(t / WHIP_COOLDOWN + 1e-9) * WHIP_COOLDOWN;
/** Whip L1 damage in the data; journey 5 sets it to 1 and runs with `VERIFY_WHIP_DAMAGE=1`. */
const WHIP_DAMAGE = Number(process.env.VERIFY_WHIP_DAMAGE ?? 10);

/**
 * Waits for a whip strike at or after `minTimeS` and screenshots it at once, then takes a snapshot: when that snapshot
 * is still inside the arc's 0.15 s, so was the screenshot. Returns the snapshot just before the strike and the one
 * after the screenshot; retries the next strike when the screenshot was too slow.
 */
async function shootStrike(page: Page, minTimeS: number, shot: () => Promise<void>) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await page.evaluate(
      async ({ minTimeS, cooldown }) => {
        const bridge = globalThis.__vsTest;
        if (!bridge) throw new Error('no __vsTest');
        let last = await bridge.snapshot();
        const deadline = performance.now() + 20_000;
        for (;;) {
          const s = await bridge.snapshot();
          const k = Math.floor(s.timeS / cooldown + 1e-9);
          if (s.timeS >= minTimeS && s.timeS - k * cooldown < 0.03 && last.timeS < k * cooldown)
            return last;
          last = s;
          if (performance.now() > deadline) throw new Error(`no strike after ${String(minTimeS)}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      },
      { minTimeS, cooldown: WHIP_COOLDOWN },
    );
    await shot();
    const after = await snapshot(page);
    if (sinceStrike(after.timeS) < WHIP_SHOWN) return { before, after, attempt };
    minTimeS = after.timeS + 0.5;
  }
  throw new Error('no screenshot inside a strike in 8 attempts');
}

/** Enemies in the L1 strike box on `side` before the strike, and how far each moved from the player by the pause. */
function boxMoves(before: GameSnapshot, paused: GameSnapshot, side: -1 | 1) {
  const p = player(before);
  const after = new Map(rows(paused).map((r) => [r[0], r]));
  return rows(before)
    .filter(
      ([, , x, y]) => (x - p.x) * side >= -12 && (x - p.x) * side <= 172 && Math.abs(y - p.y) <= 32,
    )
    .map(([uid, , x, y]) => {
      const now = after.get(uid);
      return {
        uid,
        dx: x - p.x,
        dy: y - p.y,
        /** The centre is inside the box itself, so the strike certainly hit it. */
        core: (x - p.x) * side >= 0 && (x - p.x) * side <= 160 && Math.abs(y - p.y) <= 20,
        before: Math.hypot(x - p.x, y - p.y),
        after: now ? Math.hypot(now[2] - player(paused).x, now[3] - player(paused).y) : null,
      };
    });
}

test('weapons 1: standing still, the whip strikes the facing side, hit enemies are pushed back and kills rise', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(
    page,
    `weapons-1-whip${WHIP_DAMAGE === 10 ? '' : `-damage-${String(WHIP_DAMAGE)}`}`,
  );
  noteEvidence(testInfo, ev);
  try {
    const start = await startRun(page);
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    expect(start.renderer).toBe('gl');
    expect(weapons(start)).toEqual([{ id: 'whip', level: 1 }]);
    expect(player(start).facingX).toBe(1);
    const strikes: unknown[] = [];
    let minTimeS = 6;
    for (let n = 0; n < 4; n++) {
      const { before, after, attempt } = await shootStrike(page, minTimeS, () =>
        ev.shot(`strike-${String(n + 1)}`),
      );
      const moves = boxMoves(before, after, 1);
      strikes.push({
        attempt,
        before: { timeS: before.timeS, kills: before.kills },
        after: { timeS: after.timeS, kills: after.kills, sinceStrike: sinceStrike(after.timeS) },
        player: player(after),
        moves,
      });
      // Screenshots 100 ms apart after the strike: the arc is gone, flashed enemies are back to full opacity.
      for (let i = 0; i < 2; i++) {
        await page.waitForTimeout(100);
        await ev.shot(`strike-${String(n + 1)}-after-${String((i + 1) * 100)}ms`);
      }
      minTimeS = after.timeS + 1;
    }
    const later = await waitForSnapshot(
      page,
      (s) => s.timeS >= 20 || s.state === 'results',
      30_000,
    );
    await ev.shot('later');
    ev.json('strikes', {
      whipDamage: WHIP_DAMAGE,
      strikes,
      later: { timeS: later.timeS, kills: later.kills },
    });
    const all = strikes as {
      after: { kills: number };
      moves: { core: boolean; before: number; after: number | null }[];
    }[];
    if (WHIP_DAMAGE >= 5) {
      // A bat has 5 HP: one strike kills every bat inside the box.
      expect(later.kills as number).toBeGreaterThan(0);
      const core = all.flatMap((s) => s.moves).filter((m) => m.core);
      expect(core.length).toBeGreaterThan(0);
      expect(core.filter((m) => m.after !== null)).toEqual([]);
    } else {
      // A bat (5 HP) survives four strikes of 1: no kill yet by the strike after 6 s (the fifth strike), while at
      // damage 10 bats die from 1.35 s on; bats inside the box are pushed away instead.
      expect(all[0]?.after.kills).toBe(0);
      const pushed = all
        .flatMap((s) => s.moves)
        .filter((m) => m.core && m.after !== null && m.after > m.before);
      expect(pushed.length).toBeGreaterThan(0);
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('weapons 2: after turning left the next strike is on the left', async ({ page }, testInfo) => {
  const ev = startEvidence(page, 'weapons-2-turn-left');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await holdKeys(page, ['ArrowLeft'], 100);
    const turned = await waitForSnapshot(page, (s) => player(s).facingX === -1, 2_000);
    const { before, after } = await shootStrike(page, turned.timeS, () => ev.shot('strike-left'));
    ev.json('turn', {
      player: player(after),
      timeS: after.timeS,
      moves: boxMoves(before, after, -1),
    });
    expect(player(after).facingX).toBe(-1);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('weapons 3: G grants the Magic Wand, which fires bolts at the nearest enemy, never past the cap', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'weapons-3-magic-wand');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await waitForSnapshot(page, (s) => s.timeS >= 2, 5_000);
    await page.keyboard.press('g'); // precondition only: the `G` debug key
    const granted = await waitForSnapshot(page, (s) => weapons(s).length === 2, 2_000);
    expect(weapons(granted)).toEqual([
      { id: 'whip', level: 1 },
      { id: 'magicWand', level: 1 },
    ]);
    const counts: number[] = [];
    const bolts: { nearestGone: boolean }[] = [];
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      const s = await snapshot(page);
      counts.push(s.projectiles as number);
      if ((s.projectiles as number) > 0 && shots < 3) {
        // The bolt starts under the player sprite: a burst of screenshots shows it leaving toward the nearest enemy.
        shots++;
        for (let f = 1; f <= 4; f++) await ev.shot(`bolt-${String(shots)}-frame-${String(f)}`);
        const p = player(s);
        const nearest = rows(s)
          .map(([uid, , x, y]) => ({ uid, x, y, d: Math.hypot(x - p.x, y - p.y) }))
          .sort((a, b) => a.d - b.d)[0];
        await page.waitForTimeout(400);
        const later = await snapshot(page);
        const nearestGone = !rows(later).some(([uid]) => uid === nearest?.uid);
        bolts.push({
          timeS: s.timeS,
          player: p,
          nearest,
          nearestGone,
          kills: [s.kills, later.kills],
        });
      }
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    const end = await snapshot(page);
    ev.json('projectiles', { counts, bolts, weapons: end.weapons });
    expect(shots).toBeGreaterThan(0);
    // A bolt kills a bat (10 damage, 5 HP): the enemy nearest at launch is gone shortly after.
    expect(bolts.some((b) => b.nearestGone)).toBe(true);
    expect(Math.max(...counts)).toBeLessThanOrEqual(600);
    // A second G has nothing left to grant.
    expect(weapons(end)).toHaveLength(2);
    expect(ev.workerLog.some((l) => l.includes('[debug] grantWeapon: magicWand'))).toBe(true);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('weapons 4: the results kills equal the last snapshot kills and the HUD counter', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'weapons-4-kills');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    const samples: { timeS: number; kills: number; hp: number }[] = [];
    let last = await snapshot(page);
    while (last.state === 'playing' || last.state === 'levelUp') {
      samples.push({ timeS: last.timeS, kills: last.kills as number, hp: player(last)?.hp ?? 0 });
      if (samples.length % 50 === 0) await ev.shot(`hud-${String(Math.floor(last.timeS))}s`);
      await page.waitForTimeout(200);
      last = await snapshot(page);
      if (samples.length > 1200) break;
    }
    const dead = await waitForSnapshot(page, (s) => s.state === 'results', 5_000);
    await ev.shot('results');
    const shown = await page.locator('[data-stat="kills"]').textContent();
    ev.json('kills', { samples, dead: { timeS: dead.timeS, kills: dead.kills }, shown });
    expect(dead.kills as number).toBeGreaterThan(0);
    expect(shown).toBe(String(dead.kills));
    expect(dead.kills as number).toBeGreaterThanOrEqual(samples.at(-1)?.kills ?? 0);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- The arc shows for only 0.15 s, so journey 1 waits in the page for the step a strike happens (run time a multiple of 1.35 s), screenshots at once, then checks that the snapshot taken after the screenshot is still inside the 0.15 s; otherwise it retries the next strike. Pausing with Escape to freeze the arc does not help: the pause dialog covers the player (2026-11-08, #10).
- Bats have 5 HP and the Whip L1 deals 10, so hit bats die in the same step: their flash and knockback are only observable on survivors, hence journey 5 (damage 1). The `moves` in `strikes.json` show bats in the box about 23 units farther from the player after the strike (200 units/s for 0.12 s) (2026-11-08, #10).
- A bolt spawns at the player's feet under the sprite and reaches a bat about 100 units away in 0.25 s; single screenshots often miss it, so journey 3 takes a burst of four (2026-11-08, #10).
- The player still dies in about 15 s standing still at minute 0, since the Whip covers only one side: long journeys need #17's invulnerability (`KeyI`), as in `enemies.md` (2026-11-08, #10).
- Weapon numbers are the issue's initial values, untuned against footage (`docs/reference/gameplay.md` § Weapons) (2026-11-08, #10).
