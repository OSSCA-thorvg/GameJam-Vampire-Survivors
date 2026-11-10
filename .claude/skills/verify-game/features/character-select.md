# Character select

The step between the title and a run (#14, ADR 0008, ADR 0009): four characters, all available from the start, each with its own starting weapon and stat modifiers, chosen with the keyboard (or the mouse) on a DOM listbox.

## Sub-features

- **The list:** Enter on the title's "Start" shows `state: 'characterSelect'` with a `role=listbox` of four `role=option` cards, in `CHARACTERS` order: Warden, Ember, Swift, Aurelia. Each card shows the portrait (`portrait.<id>`, `<img alt="<name>">`), the name, a one-line description, the starting weapon's icon and name (Whip, Fire Wand, Knife, Cross) and the modifier list from `formatModifier` (Warden: "+20 Max HP", "+1 Armor", "−5% Move speed"; Ember: "+10% Might", "+10% Area", "−10 Max HP"; Swift: "+15% Move speed", "+30% Magnet", "−5% Cooldown"; Aurelia: "+0.2 Recovery", "+10% Duration", "+10 Max HP"). No unlock: every card is selectable.
- **Keyboard:** the selected card is focused and has `aria-selected="true"`; ArrowRight or D moves right, ArrowLeft or A moves left (wrapping); Enter starts the run as the selected character; Escape goes back to the title (`state: 'title'`, no run started). On a later visit the select starts on the character chosen last this session (the last choice is not persisted; a reload starts on Warden).
- **Personal bests (#143):** each card shows `Best mm:ss` (`[data-best-time="<id>"]`, the character's longest run, `Best --:--` without one) and a `Cleared` mark (`.character-cleared`) only once the character cleared 15:00, for both the single-player and the versus purpose (`records.md`).
- **Mouse:** a click selects a card; a double-click starts the run as it.
- **The run reflects the character:** `characterId` is the chosen id; `weapons` is exactly its starting weapon at level 1; `stats` and `player` carry its modifiers: Warden `player.hp` 120 = `maxHp`, `stats.armor` 1, `stats.moveSpeed` 0.95; Ember `weapons` `fireWand`, `stats.might` 1.1, `player.hp` 90; Swift `weapons` `knife`, `stats.moveSpeed` 1.15, so holding ArrowRight moves 140 × 1.15 = 161 units per second of `timeS` (a 1 s hold moves about that far); Aurelia `weapons` `cross`, `stats.recovery` 0.2, `player.hp` 110. The player sprite is `player.<id>`.
- **Retry keeps the character:** after death, Retry starts a new run with the same `characterId`.
- **Data-driven:** changing a modifier in `packages/shared/src/content/characters.ts` changes the card text after a reload, with no UI change (for example Ember's `might` 0.2 reads "+20% Might").
- Snapshot fields: `state` (main thread: `'characterSelect'`), `characterId` (worker, `worker/index.ts`, `null` outside a run), `weapons`, `stats`, `player`.

## How to get to it (user POV)

Open the game URL and press Enter on "Start": the character select appears. No server and no debug key are needed. A run ends only by death (stand still for about 1–2 minutes since #148, longer with Warden's 140 HP and 2 armor).

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'title', 30000)).state`; `computer` `key` `Enter`; `javascript_tool` `(await window.__vsTest.snapshot()).state` → `"characterSelect"`; `read_page` `{ filter: "interactive" }` → a listbox with options Warden (selected), Ember, Swift, Aurelia; `get_page_text` → the names, descriptions, weapons and modifier lists above; `computer` `screenshot`.
3. `key` `ArrowRight` twice → Swift selected (`find` "selected option"); `key` `Enter`; `javascript_tool` `const s = await window.__vsTest.waitFor((s) => s.state === 'playing', 5000); JSON.stringify({ c: s.characterId, w: s.weapons, m: s.stats.moveSpeed })` → `swift`, `[{"id":"knife","level":1}]`, 1.15; read `player.x`, hold ArrowRight for 1 s (`computer` `key` `ArrowRight` with `repeat`, or the Playwright journey), read again → about 161 more; `screenshot` (blue elf sprite).
4. Wait for death, pressing `1` on each level-up dialog: `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'results', 120000)).state`; `key` `Enter` (Retry); `javascript_tool` `(await window.__vsTest.waitFor((s) => s.state === 'playing', 5000)).characterId` → `swift`.
5. `key` `Escape`, `key` `ArrowDown`, `key` `Enter` (Quit to title); `key` `Enter` → the select starts on Swift; `key` `ArrowLeft` (Ember); `key` `Enter`; read the snapshot → `characterId: "ember"`, `weapons` `fireWand` level 1, `stats.might` 1.1, `player.hp` 90 = `maxHp`; `screenshot` (HP bar full at 90).
6. Quit to title again, Enter, `key` `ArrowLeft` (Warden), `key` `Enter` → `player.hp` 120, `stats.armor` 1, `weapons` `whip`. Quit, Enter, `key` `ArrowLeft` (Aurelia, wrapping), `key` `Enter` → `weapons` `cross`, `stats.recovery` 0.2, `player.hp` 110.
7. Quit, Enter, `key` `Escape` → `state: "title"`.
8. Data-driven: edit Ember's `might` modifier to `0.2` in `packages/shared/src/content/characters.ts`, `navigate` again (reload), Enter → Ember's card reads "+20% Might"; revert the edit and reload → "+10% Might".
9. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-character-select.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/character-select.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g character-select`. Evidence: `character-select-1-cards/` (`cards.json`, screenshots of the title, the list and the title after Escape), `character-select-2-swift/` (`swift.json` with the 1 s distance and the retried run, screenshots), `character-select-3-stats/` (`characters.json` with each character's first snapshot, a screenshot per run) and `character-select-4-mouse/`. The data-driven check compares the card text with `formatModifier` over the live `CHARACTERS` data; the edit-and-reload proof is step 8 above, run by hand.

```ts
// Feature-map journeys for .claude/skills/verify-game/features/character-select.md (#14). Keyboard first.
import { expect, test, type Page } from '@playwright/test';
import { CHARACTERS, formatModifier, WEAPONS } from '../../../packages/shared/src/index';
import {
  answerLevelUps,
  noteEvidence,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type GameSnapshot,
} from '../../../e2e/helpers';

interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}
const player = (s: GameSnapshot) => s.player as Player;
const stats = (s: GameSnapshot) => s.stats as Record<string, number>;
const selected = (page: Page) => page.locator('[role="option"][aria-selected="true"]');

async function toSelect(page: Page): Promise<void> {
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
}

/** From a running or paused run: Escape (pause), Quit to title. */
async function quitToTitle(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Paused' }).waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
}

test('character-select 1: four cards with portrait, name, description, weapon and the data-driven modifiers; Escape goes back', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'character-select-1-cards');
  noteEvidence(testInfo, ev);
  try {
    expect((await openGame(page)).renderer).toBe('gl');
    await ev.shot('title');
    await toSelect(page);
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const options = list.getByRole('option');
    await expect(options).toHaveCount(4);
    await expect(page.getByRole('option', { name: 'Warden', selected: true })).toBeFocused();
    // Let the portraits decode before the screenshot.
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLImageElement>('img.portrait')].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    );
    await ev.shot('select');
    const cards = await options.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-character'),
        portrait: el.querySelector('img.portrait')?.getAttribute('src'),
        alt: el.querySelector('img.portrait')?.getAttribute('alt'),
        name: el.querySelector('.character-name')?.textContent,
        description: el.querySelector('.character-desc')?.textContent,
        weapon: el.querySelector('.character-weapon')?.textContent,
        weaponIcon: el.querySelector('.character-weapon img')?.getAttribute('src'),
        mods: [...el.querySelectorAll('.character-mods li')].map((li) => li.textContent),
      })),
    );
    ev.json('cards', cards);
    expect(cards).toHaveLength(CHARACTERS.length);
    CHARACTERS.forEach((c, i) => {
      const card = cards[i];
      expect(card?.id).toBe(c.id);
      expect(card?.portrait).toContain('portrait');
      expect(card?.alt).toBe(c.displayName);
      expect(card?.name).toBe(c.displayName);
      expect(card?.description).toBe(c.description);
      expect(card?.weapon).toBe(WEAPONS[c.startingWeaponId].name);
      expect(card?.weaponIcon).toBeTruthy();
      // The card text follows the data (#14): the expectation is computed from the live CHARACTERS.
      expect(card?.mods).toEqual(c.modifiers.map(formatModifier));
    });
    await page.keyboard.press('Escape');
    const back = await waitForSnapshot(page, (s) => s.state === 'title', 2_000);
    expect(back.player).toBeNull();
    await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
    await ev.shot('title-after-escape');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('character-select 2: Right twice and Enter plays Swift with the Knife at 115% speed; Retry keeps Swift', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const ev = startEvidence(page, 'character-select-2-swift');
  noteEvidence(testInfo, ev);
  try {
    expect((await openGame(page)).renderer).toBe('gl');
    await toSelect(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('option', { name: 'Swift', selected: true })).toBeFocused();
    await ev.shot('swift-selected');
    await page.keyboard.press('Enter');
    const start = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    const stop = answerLevelUps(page);
    expect(start.characterId).toBe('swift');
    expect(start.weapons).toEqual([{ id: 'knife', level: 1 }]);
    expect(stats(start).moveSpeed).toBeCloseTo(1.15, 9);
    expect(player(start).hp).toBe(player(start).maxHp);
    // Speed is measured inside the hold, over simulated time, so key timing jitter and a level-up pause cancel out.
    const before = player(await snapshot(page));
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    const a = await snapshot(page);
    await page.waitForTimeout(750);
    const b = await snapshot(page);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(100);
    const after = player(await snapshot(page));
    const dx = after.x - before.x;
    const speed = (player(b).x - player(a).x) / (b.timeS - a.timeS);
    await ev.shot('swift-moved');
    const dead = await waitForSnapshot(page, (s) => s.state === 'results', 180_000);
    await ev.shot('results');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused();
    await page.keyboard.press('Enter');
    const retried = await waitForSnapshot(page, (s) => s.state === 'playing' && s.timeS < 1, 5_000);
    await ev.shot('retried');
    await stop();
    ev.json('swift', {
      start: {
        characterId: start.characterId,
        weapons: start.weapons,
        moveSpeed: stats(start).moveSpeed,
      },
      dx,
      speed,
      diedAt: dead.timeS,
      retried: { characterId: retried.characterId, weapons: retried.weapons },
    });
    // 140 × 1.15 = 161 units per simulated second; the 1 s hold itself moves roughly that far (headless key timing jitters by up to 0.15 s).
    expect(speed).toBeCloseTo(161, 0);
    expect(dx).toBeGreaterThan(120);
    expect(dx).toBeLessThan(200);
    expect(after.y).toBe(before.y);
    expect(retried.characterId).toBe('swift');
    expect(retried.weapons).toEqual([{ id: 'knife', level: 1 }]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('character-select 3: Ember, Warden and Aurelia start with their own weapon, HP and stats; the select remembers the last choice', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'character-select-3-stats');
  noteEvidence(testInfo, ev);
  try {
    expect((await openGame(page)).renderer).toBe('gl');
    const runs: Record<string, unknown> = {};
    // From Warden: Right once is Ember; from Ember: Left once is Warden; from Warden: Left once wraps to Aurelia.
    const plan: {
      id: string;
      key: string;
      weapon: string;
      hp: number;
      check: (s: GameSnapshot) => void;
    }[] = [
      {
        id: 'ember',
        key: 'ArrowRight',
        weapon: 'fireWand',
        hp: 90,
        check: (s) => expect(stats(s).might).toBeCloseTo(1.1, 9),
      },
      {
        id: 'warden',
        key: 'ArrowLeft',
        weapon: 'whip',
        hp: 120,
        check: (s) => expect(stats(s).armor).toBe(1),
      },
      {
        id: 'aurelia',
        key: 'ArrowLeft',
        weapon: 'cross',
        hp: 110,
        check: (s) => expect(stats(s).recovery).toBeCloseTo(0.2, 9),
      },
    ];
    let last = 'warden';
    for (const step of plan) {
      await toSelect(page);
      // The select starts on the character chosen last this session.
      await expect(selected(page)).toHaveAttribute('data-character', last);
      await page.keyboard.press(step.key);
      await expect(
        page.getByRole('option', { name: new RegExp(`^${step.id}$`, 'i'), selected: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      const s = await waitForSnapshot(page, (n) => n.state === 'playing' && n.timeS > 0.2, 5_000);
      await ev.shot(`${step.id}-run`);
      runs[step.id] = {
        characterId: s.characterId,
        weapons: s.weapons,
        player: s.player,
        stats: s.stats,
      };
      expect(s.characterId).toBe(step.id);
      expect(s.weapons).toEqual([{ id: step.weapon, level: 1 }]);
      expect(player(s).maxHp).toBe(step.hp);
      expect(player(s).hp).toBe(step.hp);
      step.check(s);
      last = step.id;
      await quitToTitle(page);
    }
    ev.json('characters', runs);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('character-select 4: a click selects a card and a double-click starts the run as it', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'character-select-4-mouse');
  noteEvidence(testInfo, ev);
  try {
    expect((await openGame(page)).renderer).toBe('gl');
    await toSelect(page);
    const aurelia = page.getByRole('option', { name: 'Aurelia' });
    await aurelia.click();
    await expect(aurelia).toHaveAttribute('aria-selected', 'true');
    await ev.shot('aurelia-clicked');
    const ember = page.getByRole('option', { name: 'Ember' });
    await ember.dblclick();
    const s = await waitForSnapshot(page, (n) => n.state === 'playing', 5_000);
    await ev.shot('ember-run');
    ev.json('mouse', { characterId: s.characterId, weapons: s.weapons });
    expect(s.characterId).toBe('ember');
    expect(s.weapons).toEqual([{ id: 'fireWand', level: 1 }]);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Portrait and icon URLs come from the main thread's own manifest fetch (`loadAssetUrls`), which may still be in flight if Enter is pressed the instant the title appears; the cards then show magenta boxes until the select is opened again. Journey 1 waits for the portraits to decode before its screenshot (2026-11-08, #14).
- Dying as Swift (100 HP, standing still) took 13–16 s at minute 0 in headless runs and the Knife kills some bats on the way, so journey 2 allows 180 s (2026-11-08, #14).
- The stat values are initial values, untuned: the owner chose not to tune characters against the original game. Aurelia's modifiers were picked in #14 (the #76 comments left them open) (2026-11-08, #14).
- A 1 s hold measured 150.3 and 142.2 units for Swift in two headless runs (key timing jitter: the hold reached the worker for 0.88–0.93 s), so journey 2 measures the speed inside the hold over `timeS` (exact) and keeps only a loose check on the 1 s distance (2026-11-08, #14).
