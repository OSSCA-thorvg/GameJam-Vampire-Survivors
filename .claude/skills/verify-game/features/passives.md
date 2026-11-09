# Passives

The 8 passive items and the player stat block (#12, ADRs 0004, 0008, 0009): level-up cards offer passives next to weapons; each owned passive adds its modifier per level to `player.stats`, which every system reads (damage, area, cooldown, projectile speed, duration, max HP, recovery, luck, magnet, growth, move speed).

## Sub-features

- **Data:** `PASSIVES` in `packages/shared/src/content/passives.ts`, max level 5 each, one additive modifier per level (initial values, untuned): Hollow Heart max HP +20, Empty Tome cooldown −0.08, Bracer projectile speed +0.1, Candelabrador area +0.1, Clover luck +0.1, Spellbinder duration +0.1, Spinach might +0.1, Pummarola recovery +0.2 HP/s.
- **Cards:** a passive card (`data-kind` `newPassive` or `upgradePassive`) shows its `icon.passive.*` as `<img alt="">` (`/icons/passive-*.png`), the name, `NEW` or `Lv x → y`, and the passive's `description`. Choosing one adds it to `snapshot().passives` (`{ id, level }[]` in slot order) or raises its level, and `snapshot().stats` changes at once.
- **Stats:** `snapshot().stats` starts at `BASE_STATS` (might 1, area 1, cooldown 1, amount 0, speed 1, duration 1, maxHp 100, recovery 0, armor 0, moveSpeed 1, magnet 1, luck 1, growth 1) plus the character's modifiers (#14; the default Warden: maxHp 120, armor 1, moveSpeed 0.95) and equals that + level × modifier for each owned passive.
- **Candelabrador:** `stats.area` is `1 + 0.1 × level`; the Whip arc (`weapon.whip`, 160×40 at area 1) is drawn that much larger and hits that much farther.
- **Spinach:** `stats.might` is `1 + 0.1 × level`; every weapon hit deals `damage × might`. With Spinach at 5 a level-1 Whip hit deals 15 instead of 10: `snapshot().damageDealt` (`{ hits, total }`, every weapon hit on a live enemy since the run started) rises by 15 per hit instead of 10. So a ghoul (15 HP) dies from one level-1 strike instead of two: journey 3 shows it live (#17), every Whip hit in a window after Spinach 5 is a kill (`kills` and `damageDealt.hits` rise together, 11 of 11 in #17's run) and ghouls seen in the strike box die (`stats.test.ts` at level 4).
- **Pummarola:** `player.hp` rises by `stats.recovery` per second while alive and never exceeds `maxHp`.
- **Hollow Heart:** `player.maxHp` and `stats.maxHp` rise by 20 per level and `player.hp` rises by the same 20 (the HUD HP bar under the player stays about as full: Warden's 116/120 becomes 136/140).
- **Slots:** never more than 6 passives (`MAX_PASSIVE_SLOTS`); with 6 owned no card is `newPassive`, and no card offers a level above 5.
- **4th card:** with `stats.luck` above 1 (Clover) about `min(0.5, luck − 1)` of the level-ups show 4 cards; `4` chooses the 4th (`level-up.md`).
- **Debug key `P` (dev builds):** adds the first passive of `PASSIVES` not owned, or with 6 owned a level of the first owned one below 5 (`debug-tools.md`). Only for preconditions.
- Snapshot fields: `passives`, `stats`, `damageDealt` (all `worker/index.ts`), plus `player` (`hp`, `maxHp`), `weapons`, `state`, `timeS`.

The top-left Passives group in the local HUD lists owned names and levels (#156, `inventory-hud.md`).

## How to get to it (user POV)

Open the game URL, press Enter on "Start" and play until the XP bar fills (about 7–8 s at minute 0); the level-up dialog offers passives next to weapons. To get a given passive quickly, press the dev key `L` (one level-up) and choose it when offered; `P` grants passives in a fixed order. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`.
2. `computer` `key` `l`; `find` "Level up dialog" → cards; repeat `l` and `1` until a card tagged `NEW` with a passive name shows; `screenshot` (icon, name, `NEW`, description); press its digit; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).passives)` → it is listed at level 1.
3. Candelabrador: `screenshot` a Whip strike (repeat until the arc shows); press `l` and choose Candelabrador whenever offered (never a Whip upgrade, Empty Tome or Spellbinder) until its level is 3 or more; `screenshot` a strike again → visibly larger arc; `javascript_tool` `(await window.__vsTest.snapshot()).stats.area` → `1 + 0.1 × level`.
4. Spinach: reload and start; `computer` `key` `i` (invulnerability, #17); wait a few seconds; `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).damageDealt)` → `total / hits` is 10; press `l` and choose Spinach whenever offered (never a weapon card that changes the base damage of 10: only the Magic Wand up to 4, the King Bible up to 3 and the Whip up to 2 are safe, #13) until it is level 5 (`stats.might` 1.5); read `damageDealt` and `kills` again after a few strikes → the new hits add 15 each and `kills` rises by one per hit (ghouls die in one strike); `screenshot`s.
5. Pummarola: reload and start; choose Pummarola whenever offered; wait until `player.hp < player.maxHp`; hold ArrowRight in bursts away from the crowd; read `player.hp` every second → it rises, then stays at `maxHp`.
6. Hollow Heart: wait for a hit, press `l` and choose Hollow Heart (or `P`); `player.maxHp` +20 and `player.hp` +20; `zoom` the HP bar → about as full as before.
7. Slots: reload and start; press `p` six times; `passives` has 6; press `l` several times → no card tagged `NEW` for a passive; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/passives.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g passives` (`-g "passives 3"` for one journey). Evidence: `passives-1-cards/` (`cards.json`, the dialog and after-choice screenshots), `passives-2-candelabrador/` (`candelabrador.json`, the arc at area 1 and with Candelabrador), `passives-3-spinach/` (`spinach.json` with `damageDealt` before and after, `perHitBefore`/`perHitAfter`), `passives-4-pummarola/` (`pummarola.json` with HP samples), `passives-5-hollow-heart/` (`hollow-heart.json`, the bar before and after), `passives-6-slots/` (`slots.json` with every offer), `passives-7-fourth-card/` (`fourth-card.json`, the 4-card screenshot).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/passives.md (#12).
import { expect, test, type Page } from '@playwright/test';
import {
  holdKeys,
  noteEvidence,
  pageErrors,
  snapshot,
  startEvidence,
  startRun,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';

interface PlayerSnap {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
}
type Item = { id: string; level: number };
type Card = { kind: string | null; name: string; tag: string; desc: string; icon: string | null };
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const passives = (s: GameSnapshot) => s.passives as Item[];
const weapons = (s: GameSnapshot) => s.weapons as Item[];
const stats = (s: GameSnapshot) => s.stats as Record<string, number>;
const dealt = (s: GameSnapshot) => s.damageDealt as { hits: number; total: number };
const passiveLevel = (s: GameSnapshot, id: string) =>
  passives(s).find((p) => p.id === id)?.level ?? 0;
/** The live enemy closest to the player, from `enemyPositions` (`[uid, type, x, y]`, #8). */
const nearestEnemy = (s: GameSnapshot) => {
  const p = player(s);
  let best: [number, number, number, number] | undefined;
  let bestD = Infinity;
  for (const row of s.enemyPositions as [number, number, number, number][]) {
    const d = Math.hypot(row[2] - p.x, row[3] - p.y);
    if (d < bestD) [best, bestD] = [row, d];
  }
  return best;
};

/** The passive data (`packages/shared/src/content/passives.ts`) as the cards show it. */
const PASSIVE = {
  hollowHeart: { name: 'Hollow Heart', desc: 'Max HP up by 20.' },
  emptyTome: { name: 'Empty Tome', desc: 'Weapon cooldown down by 8%.' },
  bracer: { name: 'Bracer', desc: 'Projectile speed up by 10%.' },
  candelabrador: { name: 'Candelabrador', desc: 'Weapon area up by 10%.' },
  clover: { name: 'Clover', desc: 'Luck up by 10%.' },
  spellbinder: { name: 'Spellbinder', desc: 'Weapon effect duration up by 10%.' },
  spinach: { name: 'Spinach', desc: 'Damage up by 10%.' },
  pummarola: { name: 'Pummarola', desc: 'Recovers 0.2 HP per second.' },
} as const;
type PassiveId = keyof typeof PASSIVE;

/** The cards of the open dialog as the player sees them, with the icon's `src`. */
async function cards(page: Page): Promise<Card[]> {
  return page.locator('[role="dialog"][aria-label="Level up"] button.card').evaluateAll((els) =>
    els.map((el) => ({
      kind: el.getAttribute('data-kind'),
      name: el.querySelector('.card-name')?.textContent ?? '',
      tag: el.querySelector('.card-tag')?.textContent ?? '',
      desc: el.querySelector('.card-desc')?.textContent ?? '',
      icon: el.querySelector('img')?.getAttribute('src') ?? null,
    })),
  );
}

/** Cards a journey must not take, so the stat it measures stays alone (Whip upgrades change damage and area). */
type Avoid = (c: Card) => boolean;
const NOTHING: Avoid = () => false;

/**
 * Answers the open dialog: the card named `want` when offered, else the first card `avoid` accepts (other new passives
 * last while `want` is set), else the first that is not a new weapon, else card 1.
 * Waits until the dialog closed or showed the next level. Returns what was offered and taken.
 */
async function answer(page: Page, want: string | null, avoid: Avoid) {
  const before = await snapshot(page);
  const shown = await cards(page);
  let pick = want ? shown.findIndex((c) => c.name === want) : -1;
  // While waiting for `want`, keep passive slots free for it: other new passives come last.
  if (pick < 0 && want) pick = shown.findIndex((c) => !avoid(c) && c.kind !== 'newPassive');
  if (pick < 0) pick = shown.findIndex((c) => !avoid(c));
  // Since #13 a hand can hold only new weapons: a Whip upgrade (L2 keeps damage 10 and area 1) disturbs less.
  if (pick < 0) pick = shown.findIndex((c) => c.kind !== 'newWeapon');
  if (pick < 0) pick = 0;
  await page.keyboard.press(String(pick + 1));
  await waitForSnapshot(
    page,
    (n) => n.state !== 'levelUp' || player(n).level !== player(before).level,
    3_000,
  );
  return { level: player(before).level, shown, taken: shown[pick] };
}

/** Presses `L` (precondition) and answers until passive `id` reaches `level`, or `tries` level-ups pass. */
async function takePassive(page: Page, id: PassiveId, level: number, avoid: Avoid, tries = 60) {
  const log: Awaited<ReturnType<typeof answer>>[] = [];
  for (let i = 0; i < tries; i++) {
    let s = await snapshot(page);
    if (passiveLevel(s, id) >= level) break;
    if (s.state === 'results') throw new Error(`died before ${id} reached level ${String(level)}`);
    if (s.state === 'playing') {
      await page.keyboard.press('l'); // precondition only: the `L` debug key grants the missing XP
      s = await waitForSnapshot(page, (n) => n.state !== 'playing', 3_000);
    }
    if (s.state === 'levelUp') log.push(await answer(page, PASSIVE[id].name, avoid));
  }
  return log;
}

/** Answers every dialog that opens on its own with `avoid`, while `body` runs. */
function autoAnswer(page: Page, avoid: Avoid) {
  const control = { running: true };
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        if ((await snapshot(page)).state === 'levelUp') await answer(page, null, avoid);
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

const whipUpgrade: Avoid = (c) => c.kind === 'upgradeWeapon' && c.name === 'Whip';
/** Keeps the Whip at level 1 with cooldown, duration and damage at base (only area may change). */
const areaOnly: Avoid = (c) =>
  whipUpgrade(c) ||
  c.kind === 'newWeapon' ||
  ['Empty Tome', 'Spellbinder', 'Spinach'].includes(c.name);
/** Keeps the inventory to the Whip (#13 offers seven new weapons). */
const noNewWeapon: Avoid = (c) => c.kind === 'newWeapon';
/**
 * The weapons whose hits all deal a base 10, and the level each keeps it up to (`weapons.ts`): since #13 a hand often
 * holds only weapon cards, and taking one of these keeps the damage per hit at 10 × might.
 */
const TEN_UP_TO: Record<string, number> = { Whip: 2, 'Magic Wand': 4, 'King Bible': 3 };
const TEN_IDS: Record<string, number> = { whip: 2, magicWand: 4, kingBible: 3 };
const keepsTen = (c: Card) =>
  c.name in TEN_UP_TO &&
  (c.kind === 'newWeapon' ||
    (c.kind === 'upgradeWeapon' && Number(c.tag.split('→ ')[1]) <= (TEN_UP_TO[c.name] ?? 0)));
/** Keeps every hit a base-10 hit: only weapon cards that `keepsTen` (#13 offers seven new weapons). */
const whipL1Only: Avoid = (c) =>
  (c.kind === 'newWeapon' || c.kind === 'upgradeWeapon') && !keepsTen(c);

/** Whip L1 strikes every 1.35 s of run time; its arc shows for 0.15 s (`weapons.md`). */
const WHIP_COOLDOWN = 1.35;
const WHIP_SHOWN = 0.15;
const sinceStrike = (t: number) => t - Math.floor(t / WHIP_COOLDOWN + 1e-9) * WHIP_COOLDOWN;

/** Screenshots a Whip strike at or after `minTimeS` (the method of `weapons.md` journey 1). */
async function shootStrike(page: Page, minTimeS: number, shot: () => Promise<void>) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate(
      async ({ minTimeS, cooldown }) => {
        const bridge = globalThis.__vsTest;
        if (!bridge) throw new Error('no __vsTest');
        let last = await bridge.snapshot();
        const deadline = performance.now() + 20_000;
        for (;;) {
          const s = await bridge.snapshot();
          const k = Math.floor(s.timeS / cooldown + 1e-9);
          if (s.timeS >= minTimeS && s.timeS - k * cooldown < 0.03 && last.timeS < k * cooldown)
            return;
          last = s;
          if (performance.now() > deadline) throw new Error(`no strike after ${String(minTimeS)}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      },
      { minTimeS, cooldown: WHIP_COOLDOWN },
    );
    await shot();
    const after = await snapshot(page);
    if (sinceStrike(after.timeS) < WHIP_SHOWN && after.state === 'playing') return after;
    minTimeS = after.timeS + 0.5;
  }
  throw new Error('no screenshot inside a strike in 8 attempts');
}

test('passives 1: level-up cards offer passives with NEW, their icon and description; the chosen one is owned', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'passives-1-cards');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const offers: Card[][] = [];
    let chosen: Card | undefined;
    for (let i = 0; i < 10 && !chosen; i++) {
      await page.keyboard.press('l'); // precondition only
      await waitForSnapshot(page, (s) => s.state === 'levelUp', 3_000);
      const shown = await cards(page);
      offers.push(shown);
      const index = shown.findIndex((c) => c.kind === 'newPassive');
      if (index < 0) {
        await page.keyboard.press('1');
        await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
        continue;
      }
      await ev.shot('passive-cards');
      chosen = shown[index];
      await page.keyboard.press(String(index + 1));
    }
    const after = await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    await ev.shot('after-choice');
    ev.json('cards', { offers, chosen, passives: passives(after), stats: stats(after) });
    expect(chosen).toBeDefined();
    const entry = Object.entries(PASSIVE).find(([, p]) => p.name === chosen?.name);
    expect(entry).toBeDefined();
    const [id, data] = entry ?? ['', { desc: '' }];
    expect(chosen?.tag).toBe('NEW');
    expect(chosen?.desc).toBe(data.desc);
    expect(chosen?.icon).toMatch(/passive/i);
    expect(passives(after)).toEqual([{ id, level: 1 }]);
    for (const shown of offers) {
      expect(shown.length).toBe(3);
      for (const c of shown.filter((c) => c.kind === 'newPassive' || c.kind === 'upgradePassive'))
        expect(c.icon).toMatch(/passive/i);
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 2: Candelabrador enlarges the Whip arc and stats.area is 1 + 0.1 × level', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'passives-2-candelabrador');
  noteEvidence(testInfo, ev);
  try {
    const start = await startRun(page);
    const before = await shootStrike(page, 1, () => ev.shot('arc-area-1'));
    const log = await takePassive(page, 'candelabrador', 5, areaOnly);
    const owned = await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    const level = passiveLevel(owned, 'candelabrador');
    const stop = autoAnswer(page, areaOnly);
    const after = await shootStrike(page, owned.timeS, () =>
      ev.shot(`arc-candelabrador-${String(level)}`),
    );
    await stop();
    ev.json('candelabrador', {
      start: { stats: stats(start) },
      before: { timeS: before.timeS, player: player(before) },
      offers: log,
      after: {
        timeS: after.timeS,
        stats: stats(after),
        passives: passives(after),
        weapons: weapons(after),
      },
    });
    expect(level).toBeGreaterThanOrEqual(1);
    expect(stats(start).area).toBe(1);
    expect(stats(after).area).toBeCloseTo(1 + 0.1 * passiveLevel(after, 'candelabrador'), 9);
    // Whip levels 1-3 keep base area 1 (`weapons.ts`), so the larger arc is Candelabrador's alone.
    expect(weapons(after).find((w) => w.id === 'whip')?.level).toBeLessThan(4);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 3: Spinach Lv5 raises the damage per base-10 hit (level-1 Whip) from 10 to 15, so one strike kills a ghoul', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const ev = startEvidence(page, 'passives-3-spinach');
  noteEvidence(testInfo, ev);
  try {
    // A hand of only weapon cards that are not base-10 (#13) forces one into the inventory: the precondition is then
    // rolled again in a fresh run, at most 6 times (`rerolls` in the evidence).
    const rerolls: Item[][] = [];
    let base: GameSnapshot | undefined;
    let strong: GameSnapshot | undefined;
    let log: Awaited<ReturnType<typeof takePassive>> = [];
    let stop: () => Promise<void>;
    for (let attempt = 0; attempt < 6 && !strong; attempt++) {
      await startRun(page);
      await page.keyboard.press('i'); // precondition only (#17): invulnerable, so the run lasts for the kill-time window
      await waitForSnapshot(page, (n) => n.debugInvulnerable === true, 2_000);
      stop = autoAnswer(page, whipL1Only);
      base = await waitForSnapshot(
        page,
        (s) => dealt(s).hits >= 3 || s.state === 'results',
        30_000,
      );
      await stop();
      log = await takePassive(page, 'spinach', 5, whipL1Only);
      const s = await waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
      if (weapons(s).every((w) => w.level <= (TEN_IDS[w.id] ?? 0))) strong = s;
      else rerolls.push(weapons(s));
    }
    if (!base || !strong)
      throw new Error(`no base-10 inventory in 6 runs: ${JSON.stringify(rerolls)}`);
    stop = autoAnswer(page, whipL1Only);
    const shots: { timeS: number; damageDealt: unknown }[] = [];
    let later = strong;
    for (let i = 0; i < 300 && dealt(later).hits < dealt(strong).hits + 3; i++) {
      await page.waitForTimeout(100);
      later = await snapshot(page);
      if (later.state === 'results') break;
      if (i % 10 === 0 && shots.length < 6) {
        await ev.shot(`spinach-${String(shots.length + 1)}`);
        shots.push({ timeS: later.timeS, damageDealt: dealt(later) });
      }
    }
    // Live kill time (#17): with 15 per hit every hit kills, ghouls (15 HP, which took two level-1 strikes) included. A
    // ghoul seen in the strike box (220 × 80 units around the player) and then gone was killed by the Whip.
    const killStart = await snapshot(page);
    const ghouls = new Map<number, boolean>();
    let ghoulKills = 0;
    let killEnd = killStart;
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(100);
      killEnd = await snapshot(page);
      if (killEnd.state === 'results') break;
      const p = player(killEnd);
      const rows = killEnd.enemyPositions as [number, number, number, number][];
      const alive = new Set(rows.map((row) => row[0]));
      for (const [uid, seenNear] of ghouls)
        if (!alive.has(uid)) {
          if (seenNear) ghoulKills++;
          ghouls.delete(uid);
        }
      for (const [uid, type, x, y] of rows)
        if (type === 1)
          ghouls.set(
            uid,
            (ghouls.get(uid) ?? false) || (Math.abs(x - p.x) < 220 && Math.abs(y - p.y) < 80),
          );
      if (ghoulKills >= 3 && dealt(killEnd).hits - dealt(killStart).hits >= 10) break;
    }
    await stop();
    await ev.shot('spinach-ghoul-kills');
    const killWindow = {
      hits: dealt(killEnd).hits - dealt(killStart).hits,
      kills: (killEnd.kills as number) - (killStart.kills as number),
      ghoulKills,
      from: killStart.timeS,
      to: killEnd.timeS,
    };
    const perHitBefore = dealt(base).total / dealt(base).hits;
    const hits = dealt(later).hits - dealt(strong).hits;
    const perHitAfter = (dealt(later).total - dealt(strong).total) / hits;
    ev.json('spinach', {
      base: {
        timeS: base.timeS,
        damageDealt: dealt(base),
        stats: stats(base),
        weapons: weapons(base),
      },
      offers: log,
      strong: {
        timeS: strong.timeS,
        damageDealt: dealt(strong),
        stats: stats(strong),
        passives: passives(strong),
      },
      later: {
        timeS: later.timeS,
        damageDealt: dealt(later),
        weapons: weapons(later),
        state: later.state,
      },
      perHitBefore,
      perHitAfter,
      killWindow,
      shots,
      rerolls,
    });
    expect(perHitBefore).toBe(10);
    expect(passiveLevel(strong, 'spinach')).toBe(5);
    expect(stats(strong).might).toBeCloseTo(1.5, 9);
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(perHitAfter).toBeCloseTo(15, 6);
    // Every hit is a kill: no ghoul survives a strike, and ghouls did die in the window.
    expect(killWindow.hits).toBeGreaterThanOrEqual(10);
    expect(killWindow.kills).toBe(killWindow.hits);
    expect(killWindow.ghoulKills).toBeGreaterThanOrEqual(1);
    // Only weapons that still deal a base 10 per hit (`keepsTen`, #13).
    expect(weapons(later).every((w) => w.level <= (TEN_IDS[w.id] ?? 0))).toBe(true);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 4: with Pummarola, HP rises over time after a hit and stops at maxHp', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const ev = startEvidence(page, 'passives-4-pummarola');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    // No new weapons (#13): six of them kill everything before it reaches the player.
    const log = await takePassive(page, 'pummarola', 5, noNewWeapon);
    const stop = autoAnswer(page, noNewWeapon);
    // Since #105 bats are slower than the Warden and the weapons kill most of them before contact, so the journey
    // walks toward the nearest enemy (real arrow keys) until the first hit lands.
    let hit = await snapshot(page);
    for (let i = 0; i < 120 && player(hit).hp >= player(hit).maxHp; i++) {
      if (hit.state === 'playing') {
        const [, , ex, ey] = nearestEnemy(hit) ?? [0, 0, player(hit).x + 1, player(hit).y];
        const dx = ex - player(hit).x;
        const dy = ey - player(hit).y;
        const keys = [
          ...(Math.abs(dx) > 20 ? [dx > 0 ? 'ArrowRight' : 'ArrowLeft'] : []),
          ...(Math.abs(dy) > 20 ? [dy > 0 ? 'ArrowDown' : 'ArrowUp'] : []),
        ];
        await holdKeys(page, keys.length ? keys : ['ArrowRight'], 250);
      } else await page.waitForTimeout(250);
      hit = await snapshot(page);
    }
    expect(player(hit).hp).toBeLessThan(player(hit).maxHp);
    await ev.shot('hit');
    // Precondition only (#17): crowds still catch a player who zigzags, so `I` stops further hits while HP climbs at
    // stats.recovery per second.
    await page.keyboard.press('i');
    await waitForSnapshot(page, (n) => n.debugInvulnerable === true, 2_000);
    const samples: { timeS: number; hp: number; maxHp: number }[] = [];
    let s = hit;
    for (let i = 0; i < 180; i++) {
      await holdKeys(page, [i % 8 < 4 ? 'ArrowRight' : 'ArrowDown'], 250);
      s = await snapshot(page);
      samples.push({ timeS: s.timeS, hp: player(s).hp, maxHp: player(s).maxHp });
      if (s.state === 'results') break;
      const prev = samples.at(-2);
      if (prev && prev.hp >= prev.maxHp && player(s).hp >= player(s).maxHp) break;
    }
    const full = await snapshot(page);
    await ev.shot('full');
    await stop();
    ev.json('pummarola', {
      offers: log,
      recovery: stats(hit).recovery,
      hit: { timeS: hit.timeS, hp: player(hit).hp },
      samples,
      full: { timeS: full.timeS, hp: player(full).hp, maxHp: player(full).maxHp },
    });
    expect(stats(hit).recovery).toBeGreaterThan(0);
    const rises = samples.filter((x, i) => i > 0 && x.hp > (samples[i - 1]?.hp ?? Infinity));
    expect(rises.length).toBeGreaterThan(0);
    expect(samples.every((x) => x.hp <= x.maxHp)).toBe(true);
    expect(player(full).hp).toBe(player(full).maxHp);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 5: Hollow Heart raises maxHp and HP by 20 each and the bar keeps its proportions; P grants passives', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'passives-5-hollow-heart');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const hurt = await waitForSnapshot(page, (s) => player(s).hp < player(s).maxHp, 30_000);
    await page.keyboard.press('l'); // precondition only
    const open = await waitForSnapshot(page, (s) => s.state === 'levelUp', 3_000);
    await ev.shot('hurt-before');
    // Hollow Heart through the card when offered; else through `P`, whose first grant is Hollow Heart.
    const shown = await cards(page);
    const index = shown.findIndex((c) => c.name === 'Hollow Heart');
    let via = 'card';
    if (index >= 0) await page.keyboard.press(String(index + 1));
    else {
      await page.keyboard.press(String(shown.findIndex((c) => c.name !== 'Hollow Heart') + 1));
      await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
      await page.keyboard.press('p'); // precondition fallback: the `P` debug key
      via = 'P';
    }
    const after = await waitForSnapshot(page, (s) => passiveLevel(s, 'hollowHeart') === 1, 3_000);
    await ev.shot('after-hollow-heart');
    ev.json('hollow-heart', {
      via,
      hurt: player(hurt),
      open: player(open),
      after: player(after),
      stats: stats(after),
      ratioBefore: player(open).hp / player(open).maxHp,
      ratioAfter: player(after).hp / player(after).maxHp,
    });
    expect(player(after).maxHp).toBe(player(open).maxHp + 20);
    expect(player(after).hp).toBeCloseTo(player(open).hp + 20, 6);
    expect(stats(after).maxHp).toBe(140); // Warden's 120 (#14) + 20
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 6: with 6 passives owned (P), no level-up card offers a 7th passive', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'passives-6-slots');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press('p'); // precondition only: the `P` debug key
    const six = await waitForSnapshot(page, (s) => passives(s).length === 6, 3_000);
    const offers: Card[][] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('l'); // precondition only
      await waitForSnapshot(page, (s) => s.state === 'levelUp', 3_000);
      offers.push(await cards(page));
      if (i === 0) await ev.shot('cards-with-six');
      await page.keyboard.press('1');
      await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    }
    await page.keyboard.press('p');
    const end = await snapshot(page);
    ev.json('slots', { six: passives(six), offers, end: passives(end), stats: stats(end) });
    expect(passives(six).map((p) => p.id)).toEqual([
      'hollowHeart',
      'emptyTome',
      'bracer',
      'candelabrador',
      'clover',
      'spellbinder',
    ]);
    for (const shown of offers) {
      expect(shown.some((c) => c.kind === 'newPassive')).toBe(false);
      expect(shown.some((c) => c.name === 'Spinach' || c.name === 'Pummarola')).toBe(false);
    }
    expect(passives(end)).toHaveLength(6);
    expect(passives(end).every((p) => p.level <= 5)).toBe(true);
    expect(ev.workerLog.some((l) => l.includes('[debug] grantPassive: hollowHeart'))).toBe(true);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('passives 7: with Clover at level 5 (luck 1.5) a 4th card shows up about half the time and 4 chooses it', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'passives-7-fourth-card');
  noteEvidence(testInfo, ev);
  try {
    const start = await startRun(page);
    // Clover through its cards until level 5 (`L` as precondition); other picks keep the pool larger than 3.
    const log = await takePassive(page, 'clover', 5, NOTHING);
    await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    const lucky = await waitForSnapshot(page, (s) => passiveLevel(s, 'clover') === 5, 3_000);
    const offers: { cards: Card[]; luck: number }[] = [];
    let chosen: { card: Card | undefined; before: unknown; after: unknown } | null = null;
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('l'); // precondition only
      const s = await waitForSnapshot(page, (n) => n.state === 'levelUp', 3_000);
      const shown = await cards(page);
      offers.push({ cards: shown, luck: stats(s).luck });
      if (shown.length === 4 && !chosen) {
        await ev.shot('four-cards');
        await page.keyboard.press('4');
        const after = await waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
        chosen = {
          card: shown[3],
          before: { weapons: weapons(s), passives: passives(s) },
          after: { weapons: weapons(after), passives: passives(after) },
        };
        continue;
      }
      await page.keyboard.press('1');
      await waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
    }
    ev.json('fourth-card', {
      startLuck: stats(start).luck,
      cloverOffers: log,
      luck: stats(lucky).luck,
      offers,
      chosen,
    });
    expect(stats(start).luck).toBe(1);
    expect(stats(lucky).luck).toBeCloseTo(1.5, 9);
    const fours = offers.filter((o) => o.cards.length === 4).length;
    expect(fours).toBeGreaterThan(0);
    expect(offers.every((o) => o.cards.length >= 3 && o.cards.length <= 4)).toBe(true);
    expect(chosen).not.toBeNull();
    expect(JSON.stringify(chosen?.after)).not.toBe(JSON.stringify(chosen?.before));
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Journey 4 walked away from the crowd so that HP could climb, which worked while bats (100) were slower than the player. Since #17 bats fly at 140, and two runs ended at 114 of 200 HP still taking hits; after the first hit the journey now presses `I` so only Pummarola changes HP (2026-11-08, #17).
- Since #105 bats are slower than the Warden (119 against 133 units/s). Standing still for the first hit then failed in two of three runs: the weapons killed every bat before contact (154 kills in 31 s, no hit in 30 s). Journey 4 now walks toward the nearest enemy with the arrow keys until the first hit, and still presses `I` after it because the zigzag walk meets new spawns (2026-11-09, #105).
- Since #17 ghouls spawn from minute 0 (3:1 with bats) and `I` keeps the player alive, so journey 3 checks the kill time live without fast-forwarding: after Spinach 5 it watches until 3 ghouls seen in the strike box are gone and at least 10 hits landed, and requires one kill per hit (2026-11-08, #17). Before #17: the issue's journey 3 planned to press `]` three times to reach minute 3, where ghouls (15 HP) first appeared, and to see a ghoul die from one Spinach-boosted Whip strike. That could not be driven: the fast-forward stops advancing at the first level-up (`world.step` does nothing while a choice is pending, #11), and a player standing still at minute 0 dies within about 15–60 s. At minute 0 every enemy is a bat (5 HP), which the Whip kills in one hit with or without Spinach. So the journey measures the damage per hit through the read-only `damageDealt` field (level 5: 10 → 15), and "a ghoul dies in one strike instead of two" is proven at level 4 by `stats.test.ts` with a real ghoul. Upgrade it to a live kill-time journey once #17's invulnerability key `KeyI` lets the player stand until minute 3 (2026-11-08, #12).
- The Whip arc shows for only 0.15 s; journeys 2 screenshots it with the `weapons.md` method (wait in the page for the strike step, then shoot). The arc is the same art scaled by `stats.area`, so area 1.5 draws it 1.5 times as wide (2026-11-08, #12).
- When no offered card is acceptable for a journey's measurement, `answer` takes the first card that is not a Whip upgrade: journey 2 then may own Spinach or other passives too, which does not change the arc size; Whip levels 1–3 keep area 1 (2026-11-08, #12).
- Journey 4 takes Pummarola up to level 5 (1 HP/s), so a 5-HP bat hit heals in about 5 s; walking away still meets new spawns now and then, so the samples dip on a hit before they rise again; the journey walks for up to 45 s until two samples in a row are at `maxHp` (2026-11-08, #12).
- Since #13 seven new weapons share the card pool, so a hand often holds only weapon cards. Journey 3 then takes one that keeps every hit at base 10 (`keepsTen`: Whip to 2, Magic Wand to 4, King Bible to 3); when the hand has none of those it must take another weapon, so it rolls the precondition again in a fresh run (about one run in three needed a reroll, up to 6; `rerolls` in `spinach.json`). Journey 4 avoids new weapons, since six of them kill every bat before it touches the player (2026-11-08, #13).
- Journeys that take one passive to level 5 by its cards may fill all 6 slots with other passives first (a run where Spinach was never offered before the slots filled failed this way), so while waiting `answer` takes other new passives only when nothing else is acceptable (2026-11-08, #12).
- Journey 5 takes Hollow Heart from the card when offered and otherwise falls back to `P`, whose first grant is Hollow Heart; `hollow-heart.json` says which (`via`). The card path itself is proven by journey 1 (2026-11-08, #12).
- The 4th card is random (`min(0.5, luck − 1)`); journey 7 raises Clover to 5 through its cards and sees 4 cards in about half of 16 level-ups. `P` cannot set this up, since it maxes four other passives first and leaves too few candidates for a 4th card (2026-11-08, #12).
- Passive values, the weights and the luck rule are initial values, untuned by the owner's decision (`docs/reference/gameplay.md` § Level-up and evolution rules, **[unverified]**) (2026-11-08, #12).
