# Chests and evolutions

Treasure chests and weapon evolutions (#15, ADRs 0004, 0008, 0009): bosses and elites drop a chest; walking into it pauses the local run and a DOM overlay titled "Treasure" lists 1, 3 or 5 rewards (weapon or passive levels, an evolution, or a heal; never gold), and from 5:00 a maxed weapon with its paired passive evolves into one of the 8 evolved weapons in the same slot.

## Sub-features

- **Drop:** an elite or a boss that dies leaves one `pickup.chest` where it died (`snapshot().chests` rises by 1, `chestPositions` lists `[x, y]`); plain enemies never drop one.
- **Opening:** a chest within 30 units of the player (`PLAYER_RADIUS + 16`) opens when no level-up is pending (otherwise it waits on the ground): an `fx.chestOpen` burst plays where it was, `chests` falls by 1, `state` becomes `'chest'` and `paused` is `true`. While open, `timeS` and every enemy stay unchanged, and Escape or a hidden tab do nothing.
- **Overlay:** `role="dialog"`, name "Treasure", heading "Treasure", one `li.card` per reward (`data-kind` `evolve`, `levelUp` or `heal`) with its icon (`<img alt="">`, a magenta box when missing, a red `♥` for the heal), its name and its tag: `EVOLVED: <name>` (the row's name is the base weapon), `Lv x → y`, or `+30 HP`. "Enter to continue" below. No row ever mentions gold.
- **Closing:** Enter, or a 3 s timer, closes it once; `state` is `'playing'` and `timeS` continues from where it stopped (no jump).
- **Reward count:** 5 with probability 3% × luck, else 3 with 17% × luck, else 1 (one draw on the chest stream; level 4, `chest-open.test.ts` over 10,000 rolls).
- **Reward choice:** each reward in turn is an evolution when one is available, else a level of a random owned weapon or passive below max, else a 30 HP heal. The rewards are applied when the chest opens, before the overlay shows.
- **Evolution gate:** the weapon at level 8, its passive owned at any level, run time ≥ 5:00 (`EVOLUTION_MIN_TIME_S`, ADR 0008). Before 5:00 the same inventory gets a level or a heal (level 4, unit test; the `E` key always jumps to 5:00).
- **Evolved weapon:** it replaces the base weapon in the same slot at level 1 (`snapshot().weapons[slot].id` is the evolved ID), the passive stays in `passives`, and no level-up card offers the base weapon or any evolved weapon again.
- **The 8 evolutions** (pattern of the base, own art): Bloody Tear (Whip; double damage, heals 1 HP per 10 hits, `weapon.bloodyTear` arc), Holy Wand (Magic Wand; 0.1 s cooldown), Thousand Edge (Knife; a stream every 0.1 s), Death Spiral (Axe; 9 scythes straight out all around, infinite pierce), Heaven Sword (Cross; double damage, 20% crits ×2), Unholy Vespers (King Bible; books never leave), Hellfire (Fire Wand; double area, infinite pierce), Soul Eater (Garlic; 1.5× aura, heals 1 HP per 10 hits).
- **Debug key `E` (dev builds):** walks `EVOLUTIONS` in order, one pair per press, across runs of the same page: adds the base weapon if missing and sets it to level 8, adds the passive, jumps the run clock to 5:00 if earlier, and spawns an elite bat (50 HP; before #17 the current wave's first enemy, a bat at 5:00 then) 120 units in front of the player (worker log `[debug] forceEvolution: …`). Does nothing with no free slot. Only for preconditions; the elite is killed by the weapons.
- Snapshot fields: `state` (`'chest'`), `paused`, `timeS`, `chests`, `chestPositions`, `weapons`, `passives`, `player` (`hp`).

## How to get to it (user POV)

Open the game URL, press Enter on "Start", then press `E` (dev precondition): the elite appears in front of the player, the maxed weapon kills it, and its chest usually opens at once because the player stands where it died; otherwise walk into the chest. Press Enter (or wait 3 s) to close the overlay. For the next pair, quit to the title (Escape, "Quit to title") or Retry after death, start a new run and press `E` again. In normal play chests come from the bosses and elites of #17. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`.
2. `computer` `key` `e`; `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'chest' || s.chests > 0, 30000))`, pressing `1` whenever `state` is `'levelUp'`. If `chests > 0`, walk toward `chestPositions[0]` with `computer` `key` arrow presses until `state` is `'chest'`.
3. `find` "Treasure dialog" → rows with `EVOLVED: Bloody Tear` first; `screenshot`; `javascript_tool` `(await window.__vsTest.snapshot()).timeS` twice, 1 s apart → equal; `JSON.stringify((await window.__vsTest.snapshot()).weapons)` → `bloodyTear` in slot 0, `passives` still lists `hollowHeart`.
4. `computer` `key` `Enter`; the snapshot → `state: 'playing'`, `timeS` within 0.1 s of step 3's value and then rising; `screenshot` a few times → the red Bloody Tear arc instead of the Whip's.
5. For pairs 2–8: `computer` `key` `Escape`, `find` "Quit to title" and click it, `computer` `key` `Enter`, then repeat steps 2–4 with the pair's evolved ID; `screenshot` each evolved weapon. `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/chests-and-evolutions.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g chests` (`-g "chests 1"` for one journey). Evidence: `chests-1-elite/` (`elite.json` with the rewards shown, frozen samples, weapons before closing, HP samples; overlay and evolved screenshots) and `chests-2-all/` (`all.json`, one overlay and six evolved screenshots per pair).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/chests-and-evolutions.md (#15).
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
  type Evidence,
  type GameSnapshot,
} from '../../../e2e/helpers';

type Item = { id: string; level: number };
interface PlayerSnap {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const weapons = (s: GameSnapshot) => s.weapons as Item[];
const passives = (s: GameSnapshot) => s.passives as Item[];
const chests = (s: GameSnapshot) => s.chestPositions as [number, number][];

/** The 8 pairs in the order the `E` key walks them (ADR 0008). */
const PAIRS = [
  ['whip', 'hollowHeart', 'bloodyTear'],
  ['magicWand', 'emptyTome', 'holyWand'],
  ['knife', 'bracer', 'thousandEdge'],
  ['axe', 'candelabrador', 'deathSpiral'],
  ['cross', 'clover', 'heavenSword'],
  ['kingBible', 'spellbinder', 'unholyVespers'],
  ['fireWand', 'spinach', 'hellfire'],
  ['garlic', 'pummarola', 'soulEater'],
] as const;

/** Walks toward the nearest chest in short pulses of real arrow keys until the overlay opens. */
async function walkIntoChest(page: Page, timeoutMs: number): Promise<GameSnapshot> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await snapshot(page);
    if (s.state === 'chest') return s;
    if (s.state === 'results') throw new Error('the player died before reaching the chest');
    const [c] = chests(s);
    if (s.state !== 'playing' || !c) {
      await page.waitForTimeout(50);
      continue;
    }
    const { x, y } = player(s);
    const keys: string[] = [];
    if (c[0] - x > 4) keys.push('ArrowRight');
    if (c[0] - x < -4) keys.push('ArrowLeft');
    if (c[1] - y > 4) keys.push('ArrowDown');
    if (c[1] - y < -4) keys.push('ArrowUp');
    await holdKeys(page, keys.length ? keys : ['ArrowRight'], 80);
  }
  throw new Error('the chest did not open in time');
}

/** The rows of the open chest overlay as the player reads them. */
async function rows(page: Page) {
  return page.locator('[role="dialog"][aria-label="Treasure"] li.card').evaluateAll((els) =>
    els.map((el) => ({
      kind: el.getAttribute('data-kind'),
      name: el.querySelector('.card-name')?.textContent ?? '',
      tag: el.querySelector('.card-tag')?.textContent ?? '',
      icon: el.querySelector('img')?.getAttribute('src') ?? null,
    })),
  );
}

/** One pair: `E` (precondition), kill the elite with the weapons, walk into its chest, read and close the overlay. */
async function evolveOnce(page: Page, ev: Evidence, i: number) {
  const [base, passive, into] = PAIRS[i] ?? PAIRS[0];
  const tag = `${String(i + 1)}-${into}`;
  // Precondition only (#17): `E` jumps to 5:00, whose waves and events kill a fresh player before the elite's chest,
  // so `I` (invulnerability, reset by every new run) comes first.
  if (!(await snapshot(page)).debugInvulnerable) {
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
  }
  await page.keyboard.press('e'); // precondition only: the `E` debug key
  const ready = await waitForSnapshot(
    page,
    (s) => weapons(s).some((w) => w.id === base && w.level === 8) && s.timeS >= 300,
    5_000,
  );
  const baseSlot = weapons(ready).findIndex((w) => w.id === base);
  // The elite dies close to the player, so its chest often opens in the same moment it drops.
  const dropped = await waitForSnapshot(
    page,
    (s) => chests(s).length > 0 || s.state === 'chest' || s.state === 'results',
    30_000,
  );
  expect(dropped.state, `${tag}: alive when the elite died`).not.toBe('results');
  if (dropped.state !== 'chest') await ev.shot(`${tag}-chest-on-ground`);
  const opened = await walkIntoChest(page, 15_000);
  const dialog = page.getByRole('dialog', { name: 'Treasure' });
  await expect(dialog).toBeVisible();
  const shown = await rows(page);
  await ev.shot(`${tag}-overlay`);
  const frozen: number[] = [];
  for (let k = 0; k < 4; k++) {
    frozen.push((await snapshot(page)).timeS);
    await page.waitForTimeout(150);
  }
  const before = await snapshot(page);
  await page.keyboard.press('Enter');
  const resumed = await waitForSnapshot(page, (s) => s.state === 'playing', 2_000);
  await expect(dialog).toHaveCount(0);
  const later = await waitForSnapshot(
    page,
    (s) => s.timeS > resumed.timeS + 0.5 || s.state !== 'playing',
    5_000,
  );
  // Back-to-back frames for 4.5 s, longer than every evolved cooldown (Death Spiral's is 4 s), so at least one shows
  // the evolved weapon at work; the Bloody Tear arc lasts only 0.15 s.
  const filmed = Date.now();
  for (let f = 1; Date.now() - filmed < 4_500; f++)
    await ev.shot(`${tag}-evolved-${String(f).padStart(2, '0')}`);
  return {
    pair: PAIRS[i],
    ready: { timeS: ready.timeS, weapons: weapons(ready), passives: passives(ready), baseSlot },
    opened: { timeS: opened.timeS, paused: opened.paused, chests: opened.chests },
    shown,
    frozen,
    beforeClose: { weapons: weapons(before), passives: passives(before) },
    resumed: { timeS: resumed.timeS },
    later: { timeS: later.timeS, state: later.state },
    check: () => {
      expect(new Set(frozen).size, `${tag}: frozen`).toBe(1);
      expect(opened.paused, `${tag}: paused`).toBe(true);
      expect(resumed.timeS - opened.timeS, `${tag}: no time jump`).toBeLessThan(0.1);
      expect(later.timeS, `${tag}: resumes`).toBeGreaterThan(resumed.timeS);
      expect(shown[0], `${tag}: first row is the evolution`).toMatchObject({ kind: 'evolve' });
      expect(shown[0]?.tag).toMatch(/^EVOLVED: /);
      expect(shown[0]?.icon).toMatch(/\.png$/);
      expect(weapons(before)[baseSlot]?.id, `${tag}: same slot`).toBe(into);
      expect(
        weapons(before).some((w) => w.id === base),
        `${tag}: base gone`,
      ).toBe(false);
      expect(
        passives(before).some((p) => p.id === passive),
        `${tag}: passive kept`,
      ).toBe(true);
      expect(shown.every((r) => !/gold/i.test(`${r.name} ${r.tag}`))).toBe(true);
    },
  };
}

/** Escape and "Quit to title" (or "Title" after a death), then Enter: a fresh run in the same page, so the `E` key moves to the next pair. */
async function nextRun(page: Page): Promise<void> {
  // Escape pauses only a playing run: with `I` on (#17) the run keeps levelling up and dropping chests, so first wait
  // until it is playing (answerLevelUps answers level-ups; Enter closes a chest).
  for (let k = 0; k < 50; k++) {
    const state = (await snapshot(page)).state;
    if (state === 'playing' || state === 'results') break;
    if (state === 'chest') await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  }
  // The crowd at 5:00 may have killed the player meanwhile: then the results screen's "Title" button.
  if ((await snapshot(page)).state === 'results')
    await page.getByRole('button', { name: 'Title' }).click({ timeout: 5_000 });
  else {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Quit to title' }).click({ timeout: 5_000 });
  }
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  // Enter until a run starts: once from the title, again on a character select (#14) when there is one.
  for (let k = 0; k < 3 && (await snapshot(page)).state !== 'playing'; k++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  await waitForSnapshot(page, (s) => s.state === 'playing' && s.timeS < 1, 5_000);
}

test('chests 1: the elite chest pauses, lists the rewards, Enter resumes, and Whip becomes Bloody Tear that heals', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'chests-1-elite');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const stop = answerLevelUps(page);
    const result = await evolveOnce(page, ev, 0);
    // Bloody Tear heals 1 HP per 10 hits: sample HP while it strikes the crowd.
    const hp: number[] = [];
    for (let k = 0; k < 20; k++) {
      hp.push(player(await snapshot(page)).hp);
      await page.waitForTimeout(150);
    }
    const answered = await stop();
    ev.json('elite', { ...result, check: undefined, hp, answered });
    result.check();
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('chests 2: all 8 evolutions, one run each, each in its base weapon’s slot with its own art', async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const ev = startEvidence(page, 'chests-2-all');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const stop = answerLevelUps(page);
    const results = [];
    for (let i = 0; i < PAIRS.length; i++) {
      if (i > 0) await nextRun(page);
      results.push(await evolveOnce(page, ev, i));
    }
    await stop();
    ev.json(
      'all',
      results.map((r) => ({ ...r, check: undefined })),
    );
    for (const r of results) r.check();
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Since #17 `E`'s jump to 5:00 brings minute 5's denser mix and fires the 3:00 and 5:00 stage events (an elite ghoul, `reaper5`), and the player died before the elite's chest in 3 of 3 runs; each pair now presses `I` (invulnerability) first, and `nextRun` waits for a playing run before Escape, since the invulnerable run keeps opening level-ups and chests. With it HP stays full, so the Bloody Tear HP samples in `elite.json` no longer show the heal; the heal stays proven at level 4 (`weapons/evolved.test.ts`) (2026-11-08, #17).
- The `E` key jumps the run clock to 5:00 instead of fast-forwarding to it, as the issue plan proposed: `fastForward` stops at the first level-up, and 5 minutes of steps would bury a standing player. The jump makes the spawner top up to the minute-5 wave at once, so a journey has about 5 s before the crowd arrives, and it spawns the elite 120 units in front of the player (not on the spawn ring) so the maxed weapon kills it within those seconds (2026-11-08, #15).
- The elite usually dies next to the player, so its chest opens in the same step it drops and `chests` never shows 1; wait for `chests > 0 || state === 'chest'` (2026-11-08, #15).
- The crowd at 5:00 often kills the player a few seconds after the overlay closes; the next pair then starts from the results screen's "Title" button instead of the pause menu. The `E` index lives in the worker, so a page reload restarts at Bloody Tear (2026-11-08, #15).
- The evolved art shows only while the weapon is at work: the Bloody Tear arc lasts 0.15 s every 1.35 s and Death Spiral fires every 4 s, so the journey films 4.5 s of back-to-back screenshots per pair and the evidence is read from those frames (2026-11-08, #15).
- "Before 5:00" cannot be reached with `E` and is proven at level 4 (`chest-open.test.ts`: 4:59 with the same inventory gives a level-up, 5:00 the evolution) (2026-11-08, #15).
- Odds, the gate and every evolved stat are initial values, untuned against the original by the owner's decision (`docs/reference/gameplay.md` § Treasure chests, § Level-up and evolution rules) (2026-11-08, #15).
