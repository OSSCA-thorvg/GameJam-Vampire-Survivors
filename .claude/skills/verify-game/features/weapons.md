# Weapons

The weapon system (#10, #13, ADR 0008): owned weapons fire on their own cooldowns from data in `packages/shared/src/content/weapons.ts`; the player starts with the Whip, level-up cards offer the other seven (Magic Wand, Knife, Axe, Cross, King Bible, Fire Wand, Garlic) up to level 8, the dev key `G` grants the next one in `WEAPON_LIST` order, and hits lower enemy HP, flash the enemy, push it back and, at 0 HP, remove it and count a kill.

## Sub-features

- **Starting Whip:** at run start `snapshot().weapons` is `[{ id: 'whip', level: 1 }]`. Standing still, the Whip strikes every 1.35 s of run time (first at 1.35 s): a white-and-yellow arc (`weapon.whip`, 160×40 at area 1) from the player toward the facing side, shown for 0.15 s. The player starts facing right (`player.facingX: 1`).
- **Facing side:** after a tap of ArrowLeft (`player.facingX: -1`) the next arc is on the left, mirrored. Whip L2+ adds a second strike on the opposite side 0.1 s later (reach it only through #11's level-ups; unit-tested in `whip.test.ts`).
- **Hits and kills:** every enemy whose circle overlaps the strike box loses the strike's damage once per strike. Bats (5 HP) die from one L1 strike (10 damage): they disappear with a grey puff (`fx.enemyDeath`) and `snapshot().kills` rises; the HUD skull counter shows the same number.
- **Flash and knockback:** a hit enemy shows a star spark (`fx.hit`) and is dimmed (opacity 140) for 0.1 s, then back to full; it is pushed away from the player at 200 units/s × `1 - knockbackResist` for 0.12 s (about 24 units for a bat). Observable on enemies that survive, so drive it with journey 5 (Whip L1 damage 1).
- **Magic Wand (`G`):** `G` adds `{ id: 'magicWand', level: 1 }` to `weapons` (worker log `[debug] grantWeapon: magicWand`). Each further `G` grants the next weapon of `WEAPON_LIST` (Knife, Axe, Cross, King Bible) until the six slots are full; Fire Wand and Garlic, last in the list, come only from level-up cards then. Every 1.2 s a small cyan bolt (`weapon.magicWand`) leaves the player toward the nearest enemy within 900 units (or along the last movement direction), at 400 units/s, rotated along its flight, and the enemy nearest at launch dies (10 damage) shortly after.
- **Knife (#13, `G` twice):** every 1.0 s a burst of thin knives (`weapon.knife`, 20×6) flies along the last movement direction at 500 units/s, 0.05 s apart, shot k offset 6 × ceil(k/2) units sideways on alternating sides, so a burst reads as parallel lines; 1 knife at L1, 6 at L8 (pierce 1 → 3, damage 6.5 → 16.5).
- **Axe (`G` three times):** every 4 s an axe (`weapon.axe`, spinning) is thrown upward at 600 units/s with a random sideways drift up to 120 units/s, peaks about 200 units above the player and falls off the bottom of the view (removed 100 units below it, about 1.8 s); 1 → 3 axes, pierce 3 → 7, damage 20 → 80.
- **Cross (`G` four times):** every 2 s a spinning cross (`weapon.cross`) flies at the nearest enemy within 900 units (else along the last movement direction), slows, turns about 120 units out after 0.6 s and flies back past the player, accelerating, until it leaves the view; it hits an enemy once on the way out and once on the way back. 1 → 2 crosses, area 1 → 1.2 (bigger art), speed 400 → 600, damage 50 → 70.
- **King Bible (`G` five times):** after its 3 s cooldown, books (`weapon.kingBible`) orbit the player at 75 units × area, 180°/s, evenly spaced, for 3 s, then vanish for the 3 s cooldown (the visible gap); an enemy touching a book loses 10 HP at most once per 0.5 s and is pushed out. 1 → 4 books, area 1 → 1.5, 180 → 270°/s, out 3 → 4 s, damage 10 → 30.
- **Fire Wand (card):** every 3 s three fireballs (`weapon.fireWand`) fly at random enemies inside the view (each shot draws its own), or along the last movement direction with none on screen, at 375 → 600 units/s; damage 20 → 90.
- **Garlic (card):** a translucent ring (`weapon.garlic`, 100×100 at area 1, drawn under the enemies) is always centred on the player while owned; every 1.3 s (1.1 s at L8) every enemy overlapping the 50 × area unit circle loses 5 → 9 HP and is pushed out. Area 1 → 1.8 at L8, so the ring grows by 1.8×.
- **Stats (#12):** every new weapon reads the level after the player's stats: Spinach raises damage, Candelabrador the projectile radius, the drawn size of crosses, axes, knives, fireballs and books, the book orbit and the garlic ring; Empty Tome shortens cooldowns (and the King Bible's gap), Bracer speeds projectiles and the book orbit, Spellbinder lengthens lifetimes and the books' time out.
- **Cap and expiry:** `snapshot().projectiles` (live bolts) never exceeds `PROJECTILE_CAP` 600; a bolt is removed after its hit (pierce 1) or after 2 s.
- **Results:** at death the results screen's Kills equal the last `kills` and the HUD counter (`run-flow.md`, `player-health.md`).
- **Data-driven:** changing a Whip level's `damage` or `cooldownSec` in `weapons.ts` changes the game on the next load with no other code change (journey 5: L1 damage 1, bats need five strikes).
- Snapshot fields: `weapons` (`{ id, level }[]` in slot order), `projectiles` (live count), `kills` (`world.stats.kills`), plus `player` (`facingX`), `enemyPositions` and `timeS`, all registered in `worker/index.ts` (`worker/game/snapshot.ts`).

## How to get to it (user POV)

Open the game URL, press Enter on "Start" and Enter on the character select (the default Warden, #14): the Whip is already equipped; stand still and bats arrive within a few seconds. Tap ArrowLeft to face left. Every other weapon comes from a level-up card (`level-up.md`): as preconditions, `G` (dev and e2e builds) grants the next weapon of `WEAPON_LIST` (one press for the Magic Wand, two for the Knife, three for the Axe, four for the Cross, five for the King Bible), and `L` grants the XP for the next level, whose cards offer Fire Wand and Garlic and every upgrade up to level 8. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter` twice (Start, then Warden on the character select, #14); `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).weapons)` → `[{"id":"whip","level":1}]`.
3. Wait about 6 s; take `screenshot`s in quick succession until one shows the arc to the right of the player (it shows for 0.15 s of every 1.35 s); `javascript_tool` `(await window.__vsTest.snapshot()).kills` → above 0 and equal to the HUD's skull counter on the screenshot (`zoom` the top right).
4. `computer` `key` `ArrowLeft`; `javascript_tool` `(await window.__vsTest.snapshot()).player.facingX` → `-1`; `screenshot`s until one shows the arc on the left.
5. `computer` `key` `g`; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).weapons)` → whip and magicWand at level 1; `screenshot`s → a cyan bolt leaving the player toward the nearest bat, which disappears with a puff; read `projectiles` a few times → at most 600.
6. `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'results', 90000))`; `get_page_text` → Kills equal to that snapshot's `kills`; `screenshot` (the HUD counter shows the same number behind the dialog).
7. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-weapons.gif" }`; `tabs_close_mcp` on the tab.
8. The six weapons of #13, one fresh run each (new tab, `navigate`, Enter twice): press `g` the weapon's number of times (Knife 2, Axe 3, Cross 4, King Bible 5) or, for Fire Wand and Garlic, press `l` and the number of their card whenever offered (another passive card otherwise) until `JSON.stringify((await window.__vsTest.snapshot()).weapons)` lists it; `gif_creator` `start_recording`, wait 10 s answering each level-up with a passive card, take `screenshot`s about every 100 ms for 2 s → its motion as described above; then press `l` and its upgrade card until it shows `level: 8` → more knives, axes, crosses or books, faster fireballs, a larger ring; `gif_creator` `stop_recording`, `export`.
9. Garlic and Cross with Candelabrador and Spinach: in each weapon's run at level 8, take Candelabrador and Spinach to 5 through `l` and their cards; `javascript_tool` `(await window.__vsTest.snapshot()).stats` → `area` and `might` 1.5; `screenshot` → the garlic ring (or the crosses) 1.5 times as large as before.

The timed strike capture, the knockback measurement, journey 5, the fps measurement and the paint count need the Playwright journeys below.

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
    // A second G grants the next weapon of `WEAPON_LIST`, the Knife (#13).
    expect(weapons(end).map((w) => w.id)).toEqual(['whip', 'magicWand', 'knife']);
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

#### The six weapons of #13 (journeys 5–14)

Save the spec as `verification/issue-<N>/journeys/weapons-13.spec.ts` and run it like the one above with `-g "weapons (5|6|7|8|9|10|11|12|14):"`; run journey 13, the performance measurement, headed on the real GPU: `VERIFY_HEADED=1 VERIFY_JOURNEYS=… pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "weapons 13:"`. Evidence: `weapons-<5..10>-<id>/` (`journey.json` with the grant, the cards taken and the run time, live projectiles and kills per frame; frames `l1-*` and `l8-*` 100 ms apart at level 1 and level 8), `weapons-11-garlic-stats/` and `weapons-12-cross-stats/` (`journey.json` with `stats`, kills and damage per hit before and after Candelabrador and Spinach at 5; frames `base-*` and `boosted-*`), `weapons-13-performance/` (`performance.json`: the fast-forward to minute 14, `fps`, enemies and projectiles every 0.5 s for 30 s, `medianFps`, the user agent; `dense-*` screenshots), `weapons-14-paints/` (`paints.json`: `debug.paintsCreated` at each run's start, right before and after 8 s of firing at level 8, and on the title, for a control run and two weapon runs; `windows` holds the firing measurements and the most gems on the ground). The garlic ring radius in the frames can be measured with a short script over the lavender pixels from the player (the issue's run used `verification/issue-13/ring.py`).

```ts
// Feature-map journeys for the six weapons of #13 (.claude/skills/verify-game/features/weapons.md, journeys 5–12).
import { expect, test, type Page } from '@playwright/test';
import {
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from '../../../e2e/helpers';

type Item = { id: string; level: number };
type Card = { kind: string | null; name: string; tag: string };
const weapons = (s: GameSnapshot) => s.weapons as Item[];
const level = (s: GameSnapshot, id: string) => weapons(s).find((w) => w.id === id)?.level ?? 0;
const passiveLevel = (s: GameSnapshot, id: string) =>
  (s.passives as Item[]).find((p) => p.id === id)?.level ?? 0;
const playerLevel = (s: GameSnapshot) => (s.player as { level: number }).level;

const NAME: Record<string, string> = {
  knife: 'Knife',
  axe: 'Axe',
  cross: 'Cross',
  kingBible: 'King Bible',
  fireWand: 'Fire Wand',
  garlic: 'Garlic',
  candelabrador: 'Candelabrador',
  spinach: 'Spinach',
};

async function cards(page: Page): Promise<Card[]> {
  return page.locator('[role="dialog"][aria-label="Level up"] button.card').evaluateAll((els) =>
    els.map((el) => ({
      kind: el.getAttribute('data-kind'),
      name: el.querySelector('.card-name')?.textContent ?? '',
      tag: el.querySelector('.card-tag')?.textContent ?? '',
    })),
  );
}

/**
 * Answers the open dialog: a card named in `want` when offered, else a passive card that is not in `avoid`, else a
 * card that adds no weapon and changes none of `keep`, else card 1. Waits until the dialog closed or moved on.
 */
async function answer(page: Page, want: string[], avoid: string[] = [], newPassives = true) {
  const before = await snapshot(page);
  const shown = await cards(page);
  let pick = shown.findIndex((c) => want.includes(c.name));
  if (pick < 0)
    pick = shown.findIndex(
      (c) =>
        (c.kind === 'upgradePassive' || (newPassives && c.kind === 'newPassive')) &&
        !avoid.includes(c.name),
    );
  if (pick < 0)
    pick = shown.findIndex(
      (c) =>
        c.kind !== 'newWeapon' &&
        (newPassives || c.kind !== 'newPassive') &&
        !avoid.includes(c.name) &&
        c.name !== 'Whip',
    );
  if (pick < 0)
    pick = shown.findIndex((c) => c.kind === 'upgradeWeapon' && !avoid.includes(c.name));
  // Without new passives allowed, a new weapon is the lesser evil: it keeps the passive slots free.
  if (pick < 0)
    pick = shown.findIndex(
      (c) => c.kind !== (newPassives ? 'newWeapon' : 'newPassive') && !avoid.includes(c.name),
    );
  if (pick < 0) pick = 0;
  await page.keyboard.press(String(pick + 1));
  await waitForSnapshot(
    page,
    (n) => n.state !== 'levelUp' || playerLevel(n) !== playerLevel(before),
    3_000,
  );
  return { shown: shown.map((c) => `${c.name} ${c.tag}`), taken: shown[pick]?.name };
}

/** Answers every dialog that opens on its own while a journey films, with `answer(page, [], avoid)`. */
function autoAnswer(page: Page, avoid: string[], newPassives = true) {
  const control = { running: true };
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        if ((await snapshot(page)).state === 'levelUp') await answer(page, [], avoid, newPassives);
      } catch {
        // navigating or closing
      }
      await page.waitForTimeout(100).catch(() => undefined);
    }
  })();
  return async () => {
    control.running = false;
    await loop;
  };
}

/** Presses `L` (precondition) and answers until `done(snapshot)` holds, taking cards named in `want`. */
async function levelUntil(
  page: Page,
  done: (s: GameSnapshot) => boolean,
  want: string[],
  avoid: string[] = [],
  newPassives = true,
  tries = 80,
) {
  const log: unknown[] = [];
  for (let i = 0; i < tries; i++) {
    let s = await snapshot(page);
    if (done(s)) return log;
    if (s.state === 'results') throw new Error('died during the level-up precondition');
    if (s.state === 'playing') {
      await page.keyboard.press('l'); // precondition only: the `L` debug key grants the missing XP
      s = await waitForSnapshot(page, (n) => n.state !== 'playing', 3_000);
    }
    if (s.state === 'levelUp') log.push(await answer(page, want, avoid, newPassives));
  }
  const last = await snapshot(page);
  throw new Error(
    `precondition not reached in ${String(tries)} level-ups: ${JSON.stringify({ weapons: last.weapons, passives: last.passives, recent: log.slice(-3) })}`,
  );
}

/** Screenshots `frames` frames 100 ms apart, recording run time and live projectiles with each. */
async function film(page: Page, ev: Evidence, name: string, frames = 20) {
  const rows: { timeS: number; projectiles: number; kills: number; state: string }[] = [];
  for (let f = 0; f < frames; f++) {
    await ev.shot(`${name}-${String(f).padStart(2, '0')}`);
    const s = await snapshot(page);
    rows.push({
      timeS: s.timeS,
      projectiles: s.projectiles as number,
      kills: s.kills as number,
      state: s.state,
    });
    await page.waitForTimeout(100);
  }
  return rows;
}

/** Samples snapshots every 100 ms for `seconds` of wall time (playing or answering level-ups). */
async function watch(page: Page, seconds: number) {
  const rows: { timeS: number; projectiles: number; kills: number; dealt: unknown }[] = [];
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const s = await snapshot(page);
    rows.push({
      timeS: s.timeS,
      projectiles: s.projectiles as number,
      kills: s.kills as number,
      dealt: s.damageDealt,
    });
    if (s.state === 'results') break;
    await page.waitForTimeout(100);
  }
  return rows;
}

/** Owns `id` through `G` presses (its index in `WEAPON_LIST` minus the starting Whip). */
async function grantByG(page: Page, presses: number) {
  for (let i = 0; i < presses; i++) await page.keyboard.press('g'); // precondition only: the `G` debug key
  return waitForSnapshot(page, (s) => weapons(s).length === presses + 1, 3_000);
}

/** Owns `id` through `L` and the level-up card (Fire Wand, Garlic). */
async function grantByCard(page: Page, id: string) {
  // No new passives meanwhile, so their slots stay free for the journeys that measure them.
  // Other new weapons are avoided too, so a weapon slot stays free for this one.
  const others = Object.values(NAME)
    .filter((n) => n !== NAME[id])
    .concat(['Magic Wand']);
  return levelUntil(page, (s) => level(s, id) >= 1, [NAME[id] ?? id], others, false);
}

const G_PRESSES: Record<string, number> = { knife: 2, axe: 3, cross: 4, kingBible: 5 };
const MOTION: Record<string, string> = {
  knife: 'knives fly along the move direction',
  axe: 'axes rise and fall',
  cross: 'crosses go out and come back',
  kingBible: 'books orbit, then a gap with none',
  fireWand: 'fireballs fly at on-screen enemies',
  garlic: 'a ring around the player damages enemies inside it',
};

for (const [n, id] of ['knife', 'axe', 'cross', 'kingBible', 'fireWand', 'garlic'].entries())
  test(`weapons ${String(n + 5)}: ${id} fires in its pattern and reaches level 8`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const ev = startEvidence(page, `weapons-${String(n + 5)}-${id}`);
    noteEvidence(testInfo, ev);
    const result: Record<string, unknown> = { id, motion: MOTION[id] };
    try {
      await startRun(page);
      await waitForSnapshot(page, (s) => s.timeS >= 1, 5_000);
      const presses = G_PRESSES[id];
      result.grant =
        presses === undefined
          ? await grantByCard(page, id)
          : weapons(await grantByG(page, presses));
      const owned = await snapshot(page);
      expect(level(owned, id)).toBe(1);
      result.ownedAt = { timeS: owned.timeS, weapons: weapons(owned) };
      if (id === 'axe' || id === 'knife') {
        // Knives follow the last movement direction: walk down for a moment.
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(300);
        await page.keyboard.up('ArrowDown');
      }
      const stop = autoAnswer(page, Object.values(NAME));
      result.l1 = await film(page, ev, 'l1', id === 'kingBible' ? 40 : 25);
      result.l1Watch = await watch(page, 7);
      await stop();
      result.toL8 = await levelUntil(page, (s) => level(s, id) >= 8, [NAME[id] ?? id], []);
      const l8 = await snapshot(page);
      expect(level(l8, id)).toBe(8);
      result.l8Weapons = weapons(l8);
      const stop8 = autoAnswer(page, Object.values(NAME));
      result.l8 = await film(page, ev, 'l8', id === 'kingBible' ? 40 : 25);
      await stop8();
      ev.json('journey', result);
      expect(pageErrors(ev)).toEqual([]);
    } finally {
      ev.json('journey', result);
      ev.flush();
    }
  });

for (const [n, id] of ['garlic', 'cross'].entries())
  test(`weapons ${String(n + 11)}: ${id} responds to Candelabrador (area) and Spinach (might)`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const ev = startEvidence(page, `weapons-${String(n + 11)}-${id}-stats`);
    noteEvidence(testInfo, ev);
    const result: Record<string, unknown> = { id };
    try {
      await startRun(page);
      await waitForSnapshot(page, (s) => s.timeS >= 1, 5_000);
      if (id === 'cross') await grantByG(page, 4);
      else await grantByCard(page, id);
      // Raise the weapon to 8 first, so later cards cannot change it; keep both passives out until then.
      result.toL8 = await levelUntil(
        page,
        (s) => level(s, id) >= 8,
        [NAME[id] ?? id],
        ['Candelabrador', 'Spinach', 'Empty Tome', 'Spellbinder', 'Bracer'],
        false,
      );
      const base = await snapshot(page);
      result.baseStats = base.stats;
      const stop = autoAnswer(page, Object.values(NAME), false);
      result.baseFilm = await film(page, ev, 'base', 15);
      result.baseWatch = await watch(page, 8);
      await stop();
      result.toPassives = await levelUntil(
        page,
        (s) => passiveLevel(s, 'candelabrador') >= 5 && passiveLevel(s, 'spinach') >= 5,
        ['Candelabrador', 'Spinach'],
        ['Empty Tome', 'Spellbinder', 'Bracer'],
        false,
      );
      const boosted = await snapshot(page);
      result.boostedStats = boosted.stats;
      const stats = boosted.stats as Record<string, number>;
      expect(stats.area).toBeCloseTo(1.5, 6);
      expect(stats.might).toBeCloseTo(1.5, 6);
      const stop2 = autoAnswer(page, Object.values(NAME), false);
      result.boostedFilm = await film(page, ev, 'boosted', 15);
      result.boostedWatch = await watch(page, 8);
      await stop2();
      expect(pageErrors(ev)).toEqual([]);
    } finally {
      ev.json('journey', result);
      ev.flush();
    }
  });

test('weapons 13: performance with six weapons at level 8 at minute 14', async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const ev = startEvidence(page, 'weapons-13-performance');
  noteEvidence(testInfo, ev);
  const result: Record<string, unknown> = {};
  try {
    await startRun(page);
    await waitForSnapshot(page, (s) => s.timeS >= 1, 5_000);
    await grantByG(page, 5);
    // Precondition: every slot at level 8 through `L`, and Hollow Heart and Pummarola to survive minute 14.
    result.toL8 = await levelUntil(
      page,
      (s) => weapons(s).every((w) => w.level >= 8),
      ['Knife', 'Axe', 'Cross', 'King Bible', 'Magic Wand', 'Whip', 'Hollow Heart', 'Armor'],
      [],
      true,
      120,
    );
    // Precondition: `]` fast-forwards 60 s per press; a level-up during it stops the steps until answered.
    const ff: { timeS: number; enemies: number }[] = [];
    for (let i = 0; i < 400; i++) {
      const s = await snapshot(page);
      if (s.timeS >= 14 * 60 || s.state === 'results') break;
      if (s.state === 'levelUp') await answer(page, ['Hollow Heart', 'Pummarola'], []);
      else {
        await page.keyboard.press(']');
        await page.waitForTimeout(200);
      }
      ff.push({ timeS: s.timeS, enemies: s.enemies as number });
    }
    result.fastForward = ff;
    const at14 = await snapshot(page);
    result.at14 = {
      timeS: at14.timeS,
      state: at14.state,
      enemies: at14.enemies,
      weapons: at14.weapons,
      hp: at14.player,
      paintsCreated: at14.debug,
    };
    expect(at14.timeS).toBeGreaterThanOrEqual(14 * 60);
    const stop = autoAnswer(page, [], true);
    const samples: {
      t: number;
      timeS: number;
      fps: number;
      enemies: number;
      projectiles: number;
      state: string;
      paints: unknown;
    }[] = [];
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const s = await snapshot(page);
      samples.push({
        t: Date.now() - start,
        timeS: s.timeS,
        fps: s.fps as number,
        enemies: s.enemies as number,
        projectiles: s.projectiles as number,
        state: s.state,
        paints: s.debug,
      });
      if (s.state === 'results') break;
      if (samples.length % 10 === 0) await ev.shot(`dense-${String(samples.length / 10)}`);
      await page.waitForTimeout(500);
    }
    await stop();
    const playing = samples
      .filter((s) => s.state === 'playing')
      .map((s) => s.fps)
      .sort((a, b) => a - b);
    result.samples = samples;
    result.medianFps = playing[Math.floor(playing.length / 2)] ?? null;
    result.maxProjectiles = Math.max(...samples.map((s) => s.projectiles));
    result.maxEnemies = Math.max(...samples.map((s) => s.enemies));
    result.userAgent = await page.evaluate(() => navigator.userAgent);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.json('performance', result);
    ev.flush();
  }
});

test('weapons 14: the paint count stays flat across runs with every new weapon firing', async ({
  page,
}, testInfo) => {
  test.setTimeout(400_000);
  const ev = startEvidence(page, 'weapons-14-paints');
  noteEvidence(testInfo, ev);
  const paints = (s: GameSnapshot) => (s.debug as { paintsCreated: number }).paintsCreated;
  const rows: {
    at: string;
    paintsCreated: number;
    weapons?: unknown;
    projectiles?: unknown;
    maxGems?: number;
    maxProjectiles?: number;
  }[] = [];
  /** `paintsCreated` at level 8 just before and after 8 s of firing, per weapon run. */
  const windows: { run: number; before: number; after: number; maxGems: number }[] = [];
  const quit = async (run: number) => {
    await page.keyboard.press('Escape');
    await waitForSnapshot(page, (s) => s.paused === true, 3_000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const title = await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    rows.push({ at: `title after run ${String(run)}`, paintsCreated: paints(title) });
  };
  try {
    const boot = await startRun(page);
    rows.push({ at: 'run 0 start (boot)', paintsCreated: paints(boot) });
    // Control run 0: the Whip only and 45 quick `L` level-ups, the same precondition the weapon runs use. Each
    // level-up plays an `fx.levelUp` Lottie (pool prewarmed to 2); dozens within seconds grow that pool once.
    await levelUntil(
      page,
      (s) => (s.player as { level: number }).level >= 45,
      [],
      Object.values(NAME),
      true,
      120,
    );
    await page.waitForTimeout(3_000);
    rows.push({ at: 'run 0 after 44 level-ups', paintsCreated: paints(await snapshot(page)) });
    await quit(0);
    for (const run of [1, 2]) {
      await page.keyboard.press('Enter');
      await waitForSnapshot(page, (n) => n.state === 'characterSelect', 5_000);
      await page.keyboard.press('Enter'); // the default Warden (#14)
      const s = await waitForSnapshot(page, (n) => n.state === 'playing', 5_000);
      rows.push({ at: `run ${String(run)} start`, paintsCreated: paints(s) });
      await waitForSnapshot(page, (n) => n.timeS >= 1, 5_000);
      // Run 1: the five G weapons; run 2: Fire Wand and Garlic through cards first, while slots are free, then `G`
      // fills the rest.
      if (run === 1) await grantByG(page, 5);
      else {
        await grantByCard(page, 'fireWand');
        await grantByCard(page, 'garlic');
        await waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
        const owned = weapons(await snapshot(page)).length;
        for (let g = owned; g < 6; g++) await page.keyboard.press('g'); // precondition only
        await waitForSnapshot(page, (n) => weapons(n).length === 6, 3_000);
      }
      await levelUntil(page, (n) => weapons(n).every((w) => w.level >= 8), [], [], true, 120);
      // Let the last `fx.levelUp` rings of the `L` presses finish, then measure the firing alone.
      await page.waitForTimeout(1_500);
      const ready = await snapshot(page);
      rows.push({
        at: `run ${String(run)} at level 8, before firing`,
        paintsCreated: paints(ready),
      });
      const stop = autoAnswer(page, [], true);
      let maxGems = 0;
      let maxProjectiles = 0;
      for (let t = 0; t < 40; t++) {
        const n = await snapshot(page);
        maxGems = Math.max(maxGems, n.gems as number);
        maxProjectiles = Math.max(maxProjectiles, n.projectiles as number);
        await page.waitForTimeout(200);
      }
      await stop();
      const firing = await snapshot(page);
      windows.push({ run, before: paints(ready), after: paints(firing), maxGems });
      await ev.shot(`run-${String(run)}-firing`);
      rows.push({
        at: `run ${String(run)} after 8 s at level 8`,
        paintsCreated: paints(firing),
        weapons: firing.weapons,
        projectiles: firing.projectiles,
        maxGems,
        maxProjectiles,
      });
      await quit(run);
    }
    ev.json('paints', { rows, windows });
    // Eight seconds of six level-8 weapons firing create no paint (a level-up answered meanwhile may still play its
    // `fx.levelUp` ring, and more than 200 blue gems would grow `gem.blue`; neither is a weapon pool).
    for (const w of windows)
      if (w.maxGems <= 200) expect(w.after, `run ${String(w.run)}`).toBe(w.before);
    // Runs start and end on the same paints: the title after each run equals the next run's start.
    expect(rows.find((r) => r.at === 'run 2 start')?.paintsCreated).toBe(
      rows.find((r) => r.at === 'title after run 1')?.paintsCreated,
    );
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.json('paints', { rows, windows });
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
- Since #13 a second `G` grants the Knife, not nothing: journey 3 checks the third weapon instead (2026-11-08, #13).
- Snapshots carry no per-projectile positions, so the motion of each #13 weapon is shown by 100 ms frame sequences, with the exact paths proven at level 4 by the pattern tests in `packages/client/src/worker/game/weapons/` (knife along `lastDir`, axe arc, cross return and double hit, book radius and hit cooldown, fire-wand on-screen targets, garlic radius) (2026-11-08, #13).
- Fire Wand and Garlic are last in `WEAPON_LIST`, so `G` never reaches them with the Whip and four others owned; the journeys take their cards through `L`, keeping new passives out so the passive slots stay free for journeys 11 and 12. Journeys that answer level-ups for a while also take other weapons when a hand offers nothing else, so frames often show more than the weapon under test (2026-11-08, #13).
- At minute 0 bats die to almost anything, so kills per second are limited by spawns and barely change with Spinach; journeys 11 and 12 record them, but the area change is shown by the garlic ring's radius in the frames (about 70 px at area 1, 105 px at area 1.5) and the damage change by `stats` and the unit tests (2026-11-08, #13).
- The garlic art's visible ring edge sits at about 0.78 of the 50-unit hit radius, so enemies just outside the drawn ring are still hit (2026-11-08, #13).
- Fast-forwarding to minute 14 (`]`) stops at each level-up until it is answered; journey 13 alternates `]` and answers. The first fps samples after the jump are low (20–49) because the one-second fps window still holds the fast-forward frame; the median over 30 s is 60 on an Apple M4 Pro (headed Chrome) (2026-11-08, #13).
- `debug.paintsCreated` grows while a journey presses `L` dozens of times within seconds (`fx.levelUp` is prewarmed to 2, so overlapping rings grow it), and would grow if more than 200 blue gems lay on the ground (`gem.blue`'s prewarm); neither is a weapon pool. So journey 14 measures the count right before and after 8 s of six level-8 weapons firing (flat in both runs: 1577 → 1577 with the G weapons, and with Fire Wand and Garlic), and checks that a run ends on the paints the next one starts with; `all-weapons.test.ts` checks every projectile pool stays at its prewarm with six weapons at level 8 for 60 s (2026-11-08, #13).
- Weapon numbers of #13 are the issue's initial values, untuned against footage (`docs/reference/gameplay.md` § Weapons) (2026-11-08, #13).
