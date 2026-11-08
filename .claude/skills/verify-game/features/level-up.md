# Level-up

The level-up choice (#11, ADRs 0004, 0008, 0009): when the XP bar fills, the worker pauses the local run and the DOM shows a "Level up" dialog with up to 3 cards of new or upgraded weapons and passives (#12; a 4th with luck, a heal when nothing is left, never gold); choosing one applies it and resumes play.

## Sub-features

- **Opening:** when `player.xp` reaches `xpToNext(level)` (5 XP at level 1, then +10 per level up to 20, +13 up to 40, +16 after) the level rises, a `fx.levelUp` ring plays at the player, and `state` becomes `'levelUp'`: a dialog (`role="dialog"`, name "Level up") titled "Level n" (the level being reached) with one `<button>` card per option, the first focused. `paused` is `true`.
- **Cards:** each shows the icon (`icon.weapon.*` or `icon.passive.*` as `<img alt="">`, a magenta box when the art is missing, a red cross for the heal), the name, `NEW` or `Lv x → y`, and the text: the weapon's `description` for a new one, `levelText[toLevel - 2]` for a weapon upgrade, the passive's `description` for both passive kinds (`data-kind` `newPassive`/`upgradePassive`, #12). 3 distinct cards (`LEVELUP_CHOICES`) drawn by weight (new items 1, upgrades 1.2) from the upgrades of owned weapons below level 8 and passives below level 5 and, while fewer than 6 of that kind are owned, the weapons and passives not owned yet; with none of those a single "Heal" card `+30 HP` (`LEVELUP_HEAL`). No card ever mentions gold.
- **4th card (#12):** with `stats.luck` above 1 (Clover, +0.1 per level) a 4th distinct card is added with probability `min(0.5, luck - 1)` when a 4th candidate exists; `4` chooses it. With luck 1 there are never 4 cards.
- **Frozen run:** while the dialog is open `timeS`, every enemy position, gem and projectile stay unchanged (only the local world pauses, ADR 0004). Escape does nothing (no "Paused" dialog), and hiding the tab leaves the dialog in place.
- **Choosing:** `1`–`3` (`4` for a 4th card) choose directly; Up/Down or W/S move the focus and Enter chooses the focused card; a click works too. The dialog closes, `state` is `'playing'`, `timeS` continues from where it stopped (no jump), and `weapons` or `passives` shows the new item at level 1 or the upgraded level (a new Magic Wand starts firing; a passive also changes `stats`, `passives.md`). The heal raises `player.hp` by 30, capped at `maxHp`.
- **Several at once:** XP worth several levels (the merge gem) queues them; the dialog reopens right after each choice, titled with the next level, until none is left. Unit-tested (`level-system.test.ts`, `app.test.ts`); see Gotchas.
- **Results:** the results screen's Level equals `player.level` at death (`run-flow.md`).
- **Debug key `L` (dev builds):** grants exactly the XP missing for the next level (worker log `[debug] levelUp: +n XP`); ignored while the dialog is open. Only for preconditions.
- Snapshot fields: `state` (`'levelUp'`), `paused`, `player.level`, `player.xp`, `weapons`, `passives`, `stats` (`luck`), `timeS`, `enemyPositions`.

## How to get to it (user POV)

Open the game URL, press Enter on "Start" and play: the first level-up comes after about 5 bats (7–8 s standing still at minute 0). Reaching the heal card needs six weapons at level 8 and 6 passives at level 5 (about 77 level-ups since #13): use the dev key `L` repeatedly as a precondition, answering each dialog with `1`. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`.
2. `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'levelUp', 60000))` → `paused: true`; `find` "Level up dialog" → heading "Level n", up to 3 cards, the first focused; `screenshot`.
3. `javascript_tool` `(await window.__vsTest.snapshot()).timeS` twice, 2 s apart (`computer` `wait` 2) → equal; `computer` `key` `Escape`; `screenshot` → the same dialog, no "Paused".
4. `computer` `key` `2` (or `1` with one card); `javascript_tool` the snapshot → `state: 'playing'`, `timeS` within 0.5 s of step 3's value, `weapons` changed as the card said; `screenshot` a few times (a new Magic Wand fires).
5. Precondition: repeat `computer` `key` `l` then `computer` `key` `1` until `JSON.stringify((await window.__vsTest.snapshot()))` shows six weapons at level 8 and 6 passives at level 5; `computer` `key` `l` → the dialog's only card is "Heal +30 HP"; `screenshot`; `computer` `key` `1`.
6. `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state !== 'playing', 90000))` and press `1` on each further dialog until `state` is `'results'`; `get_page_text` → Level equals `player.level`; `screenshot`; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/level-up.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g level-up` (`-g "level-up 2"` for one journey). Evidence: `level-up-1-choose/` (`choose.json` with the cards, ten frozen samples, the state after Escape and the weapons before and after; dialog, after-Escape and after-choice screenshots), `level-up-2-max/` (`max.json` with every offer; the heal-only screenshot), `level-up-3-results/` (`results.json`, the results screenshot).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/level-up.md (#11).
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
  xp: number;
}
type Weapon = { id: string; level: number };
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const weapons = (s: GameSnapshot) => s.weapons as Weapon[];

/** The cards of the open dialog as the player reads them: kind, name and tag. */
async function cards(page: Page) {
  return page.locator('[role="dialog"][aria-label="Level up"] button.card').evaluateAll((els) =>
    els.map((el) => ({
      kind: el.getAttribute('data-kind'),
      name: el.querySelector('.card-name')?.textContent ?? '',
      tag: el.querySelector('.card-tag')?.textContent ?? '',
      desc: el.querySelector('.card-desc')?.textContent ?? '',
    })),
  );
}

/** Plays (walking left and right over the Whip's kills) until the level-up dialog opens. */
async function playUntilLevelUp(page: Page, timeoutMs = 60_000): Promise<GameSnapshot> {
  const deadline = Date.now() + timeoutMs;
  for (let i = 0; Date.now() < deadline; i++) {
    const s = await snapshot(page);
    if (s.state === 'levelUp') return s;
    if (s.state !== 'playing') throw new Error(`run ended in state ${s.state} before a level-up`);
    await holdKeys(page, [i % 4 < 2 ? 'ArrowRight' : 'ArrowLeft'], 300);
  }
  throw new Error('no level-up in time');
}

test('level-up 1: a full bar pauses the game behind the dialog, Escape does nothing, 2 applies the choice and play resumes with no jump', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'level-up-1-choose');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const open = await playUntilLevelUp(page);
    const dialog = page.getByRole('dialog', { name: 'Level up' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText(`Level ${String(player(open).level)}`);
    const shown = await cards(page);
    await ev.shot('dialog');
    // Frozen for 2 s: the run clock and every enemy stay where they are.
    const frozen: { timeS: number; enemies: unknown }[] = [];
    for (let i = 0; i < 10; i++) {
      const s = await snapshot(page);
      frozen.push({ timeS: s.timeS, enemies: s.enemyPositions });
      await page.waitForTimeout(200);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterEscape = await snapshot(page);
    await ev.shot('after-escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    const pick = shown.length >= 2 ? 1 : 0;
    const before = weapons(afterEscape);
    await page.keyboard.press(String(pick + 1));
    const resumed = await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    await expect(dialog).toHaveCount(0);
    const later = await waitForSnapshot(
      page,
      (s) => s.timeS >= resumed.timeS + 1 || s.state !== 'playing',
      5_000,
    );
    await ev.shot('after-choice');
    // A new Magic Wand fires: a burst of screenshots catches its bolts.
    if (shown[pick]?.name === 'Magic Wand' && shown[pick]?.kind === 'newWeapon')
      for (let f = 1; f <= 6; f++) {
        await ev.shot(`wand-${String(f)}`);
        await page.waitForTimeout(150);
      }
    ev.json('choose', {
      open: { timeS: open.timeS, level: player(open).level },
      shown,
      frozen,
      afterEscape: { state: afterEscape.state, timeS: afterEscape.timeS },
      pick,
      before,
      resumed: { timeS: resumed.timeS, weapons: weapons(resumed) },
      later: { timeS: later.timeS, state: later.state },
    });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(4);
    expect(new Set(frozen.map((f) => f.timeS)).size).toBe(1);
    expect(new Set(frozen.map((f) => JSON.stringify(f.enemies))).size).toBe(1);
    expect(afterEscape.state).toBe('levelUp');
    expect(afterEscape.timeS).toBe(open.timeS);
    // No time jump: the clock goes on from where it stopped.
    expect(resumed.timeS - open.timeS).toBeLessThan(0.5);
    expect(later.timeS).toBeGreaterThan(resumed.timeS);
    const chosen = shown[pick];
    const now = weapons(resumed);
    if (chosen?.kind === 'newWeapon') expect(now.length).toBe(before.length + 1);
    if (chosen?.kind === 'upgradeWeapon') {
      const name = chosen.name === 'Whip' ? 'whip' : 'magicWand';
      expect(now.find((w) => w.id === name)?.level).toBe(
        (before.find((w) => w.id === name)?.level ?? 0) + 1,
      );
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('level-up 2: never more than 6 weapons or passives, level 8 or 5; with everything maxed the only card is the heal (L as precondition)', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'level-up-2-max');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    const offers: {
      level: number;
      cards: Awaited<ReturnType<typeof cards>>;
      weapons: Weapon[];
      passives: Weapon[];
    }[] = [];
    let s = await snapshot(page);
    for (let i = 0; i < 240; i++) {
      if (s.state === 'results') throw new Error('the player died before everything was maxed');
      if (s.state === 'playing') {
        await page.keyboard.press('l'); // precondition only: the `L` debug key grants the missing XP
        s = await waitForSnapshot(page, (n) => n.state !== 'playing', 3_000);
        continue;
      }
      const shown = await cards(page);
      offers.push({
        level: player(s).level,
        cards: shown,
        weapons: weapons(s),
        passives: s.passives as Weapon[],
      });
      if (shown.length === 1 && shown[0]?.kind === 'heal') break;
      await page.keyboard.press('1');
      s = await waitForSnapshot(
        page,
        (n) => n.state !== 'levelUp' || player(n).level !== player(s).level,
        3_000,
      );
      s = await snapshot(page);
    }
    await ev.shot('heal-only');
    const heal = offers.at(-1);
    await page.keyboard.press('1');
    const healed = await waitForSnapshot(page, (n) => n.state === 'playing', 3_000);
    ev.json('max', {
      offers,
      healed: { hp: player(healed).hp, maxHp: player(healed).maxHp, weapons: weapons(healed) },
    });
    for (const o of offers) {
      // A 4th card comes with luck (Clover, #12).
      expect(o.cards.length).toBeLessThanOrEqual(4);
      expect(o.weapons.length).toBeLessThanOrEqual(6);
      expect(o.passives.length).toBeLessThanOrEqual(6);
      expect(o.weapons.every((w) => w.level <= 8)).toBe(true);
      expect(o.passives.every((p) => p.level <= 5)).toBe(true);
      expect(o.cards.every((c) => !(c.kind === 'upgradePassive' && c.tag.endsWith('→ 6')))).toBe(
        true,
      );
      expect(o.cards.every((c) => !/gold/i.test(`${c.name} ${c.tag} ${c.desc}`))).toBe(true);
      expect(o.cards.every((c) => !(c.kind === 'upgradeWeapon' && c.tag.endsWith('→ 9')))).toBe(
        true,
      );
    }
    // Six of the eight weapons (#13), all at level 8.
    expect(heal?.weapons).toHaveLength(6);
    expect(heal?.weapons[0]).toEqual({ id: 'whip', level: 8 });
    expect(heal?.weapons.every((w) => w.level === 8)).toBe(true);
    expect(heal?.passives).toHaveLength(6);
    expect(heal?.passives.every((p) => p.level === 5)).toBe(true);
    expect(heal?.cards).toEqual([
      { kind: 'heal', name: 'Heal', tag: '+30 HP', desc: 'Recover 30 HP.' },
    ]);
    expect(weapons(healed)).toEqual(heal?.weapons);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('level-up 3: the results screen shows the level reached', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const ev = startEvidence(page, 'level-up-3-results');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    let last = await snapshot(page);
    let answered = 0;
    for (let i = 0; i < 2000 && last.state !== 'results'; i++) {
      if (last.state === 'levelUp') {
        answered++;
        await page.keyboard.press('1');
      }
      await page.waitForTimeout(100);
      const next = await snapshot(page);
      if (next.state !== 'results') last = next;
      else break;
    }
    const dead = await waitForSnapshot(page, (s) => s.state === 'results', 5_000);
    await ev.shot('results');
    const shown = await page.locator('[data-stat="level"]').textContent();
    ev.json('results', {
      answered,
      lastPlaying: { timeS: last.timeS, player: player(last) },
      dead: { timeS: dead.timeS, player: player(dead) },
      shown,
    });
    expect(player(dead).level).toBeGreaterThan(1);
    expect(shown).toBe(String(player(dead).level));
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Several level-ups at once need XP worth several levels in one step (the merge gem, or a boss from #15); a live run at minute 0 gives one level at a time, and `L` grants exactly one. "Offered one after another" is proven at level 4 (`level-system.test.ts`: 100 XP at level 1 queues 4 dialogs titled 2–5; `app.test.ts`: the next `levelUp` remounts the dialog) until such XP is reachable (2026-11-08, #11).
- Hiding the tab while the dialog is open leaves it in place (the app ignores `hidden` in `levelUp`, `app.test.ts`); not driven here, since the headless smoke project cannot hide the tab natively (`hidden-tab.md`) (2026-11-08, #11).
- The `fx.levelUp` ring starts at the player when the level rises but stays on its first frame while the dialog is open (the loop is paused), and plays for 1 s after the choice (2026-11-08, #11).
- Journey 2 reaches level 17 in about 2 s of run time, so the player survives it; it chooses card 1 every time, which is enough because every card brings both weapons closer to level 8 (2026-11-08, #11). Since #12 the heal also needs 6 passives at level 5, so the journey stops when the only card is the heal (about 47 level-ups) instead of when both weapons are at 8 (2026-11-08, #12). Since #13 it also fills all six weapon slots first (about 77 level-ups) (2026-11-08, #13).
- The XP curve, 3 choices and the 30 HP heal are initial values; the curve keeps its **[unverified]** tag (`docs/reference/gameplay.md` § Level-up and evolution rules) (2026-11-08, #11).
