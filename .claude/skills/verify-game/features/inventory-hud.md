# Inventory HUD and minute chest carriers

The top-left HUD shows the local run’s weapons and passives, and the stage sends a chest carrier on each full minute before the finale (#156, ADRs 0004, 0005, 0008, 0013).

## Sub-features

- **Starting gear:** the Weapons column shows the selected character’s starting weapon at Lv 1; the empty Passives column shows a dash. The inventory stays below the XP bar and to the left of the clock.
- **Reward updates:** acquiring, upgrading and evolving gear updates the relevant row’s name and level. A base weapon and its evolution occupy the same slot, so the evolved name replaces the old one. A restart shows only the new world’s gear.
- **Minute carrier:** before 1:00 there are no scheduled elites. At 1:00 the marked elite bat arrives. Defeat it with normal attacks and walk into its chest. Closing Treasure shows the applied item level in the HUD.
- **Versus:** in both rows and columns the inventory belongs to the local pane. The opponent’s pane shows its clock and own world feed. Both local worlds spawn their own minute carrier.
- **Snapshots:** `weapons` and `passives` list `{ id, level }` in slot order. `timeS`, `eventsFired`, `elites`, `chestPositions` and `state` describe the spawn and reward flow.

## How to get to it (user POV)

Start as Warden, move to dropped gems and pick items from the level-up dialog. Stay alive to 1:00, then defeat the red-marked bat. Open its chest and inspect the HUD after closing Treasure. Quit to the title and start as Ember. For versus, use two players and the Docker server following `versus-match.md`.

## Driving it

### Claude in Chrome

1. In a new tab, open the game URL and start as Warden with Enter. Screenshot Whip Lv 1 and the empty Passives column.
2. Move to nearby gems. When a level-up dialog opens, select a passive if offered, then screenshot the new row. Use `__vsTest.snapshot()` to record owned IDs and levels.
3. To keep the run alive, press `I` as a precondition. Use the game clock normally; record `elites` just before 1:00 and at 1:00. Screenshot the marker when the bat reaches the view, defeat it with normal attacks and walk into the chest. Screenshot Treasure and the changed HUD after closing it.
4. Escape → Quit to title → Start → Ember. Screenshot Fire Wand Lv 1 and the empty Passives column. In versus, repeat the starting-HUD check in both panes using the lobby journey. Resize across the split layout threshold and check that the labels still belong to the local pane.

### Playwright

Save the spec as `verification/issue-<N>/journeys/inventory-hud.spec.ts` and run the Chromium journey through `verify-game`. Compare the screenshots to the recorded items and reward rows. For versus, use the match-start journey in `versus-match.md` with the local HUD and first-minute checks above.

```ts
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

type Item = { id: string; level: number };
const weapons = (s: GameSnapshot) => s.weapons as Item[];
const passives = (s: GameSnapshot) => s.passives as Item[];
const playerAt = (s: GameSnapshot) => s.player as { x: number; y: number };

async function walkToward(page: Page, s: GameSnapshot, target: [number, number]) {
  const { x, y } = playerAt(s);
  const keys = [];
  if (target[0] > x + 4) keys.push('ArrowRight');
  if (target[0] < x - 4) keys.push('ArrowLeft');
  if (target[1] > y + 4) keys.push('ArrowDown');
  if (target[1] < y - 4) keys.push('ArrowUp');
  if (keys.length) await holdKeys(page, keys, 110);
  else await page.waitForTimeout(80);
}

async function chooseItem(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Level up' });
  const passive = dialog
    .locator('button.card[data-kind="newPassive"], button.card[data-kind="upgradePassive"]')
    .first();
  if (await passive.count()) await passive.click();
  else await page.keyboard.press('1');
}

test('local HUD tracks real rewards and a minute elite drops a chest', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const ev = startEvidence(page, 'owned-items-single');
  noteEvidence(testInfo, ev);
  try {
    const initial = await startRun(page);
    expect(weapons(initial)).toEqual([{ id: 'whip', level: 1 }]);
    expect(passives(initial)).toEqual([]);
    await ev.shot('starting-items');
    // Let the 1:00 spawn occur on its natural clock. I only keeps the run alive.
    await page.keyboard.press('i');
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    let before: GameSnapshot | undefined;
    let carrier: GameSnapshot | undefined;
    let items: GameSnapshot | undefined;
    let opened: GameSnapshot | undefined;
    let rewardRows: string[] = [];
    const deadline = Date.now() + 160_000;
    while (Date.now() < deadline) {
      const s = await snapshot(page);
      if (!before && s.timeS >= 58 && s.timeS < 60) {
        before = s;
        await ev.shot('before-minute');
      }
      if (!carrier && s.elites === 1) {
        carrier = s;
        await ev.shot('minute-elite');
      }
      if (s.state === 'levelUp') {
        await chooseItem(page);
        await page.waitForTimeout(60);
        continue;
      }
      if (s.state === 'chest') {
        if (!opened) {
          opened = s;
          rewardRows = await page
            .getByRole('dialog', { name: 'Treasure' })
            .locator('li')
            .allTextContents();
          await ev.shot('treasure');
        }
        await page.keyboard.press('Enter');
        continue;
      }
      expect(s.state).toBe('playing');
      if (!items && (passives(s).length || weapons(s).length > 1 || weapons(s)[0]?.level > 1)) {
        items = s;
        await ev.shot('after-choice');
      }
      if (opened && items) break;
      const [chest] = s.chestPositions as [number, number][];
      if (chest) {
        await walkToward(page, s, chest);
      } else {
        const { x, y } = playerAt(s);
        const gems = s.gemPositions as [number, number, number, number, number][];
        const dist = (g: number[]) => Math.hypot(g[2] - x, g[3] - y);
        const gem = gems.filter((g) => dist(g) < 200).sort((a, b) => dist(a) - dist(b))[0];
        if (gem) await walkToward(page, s, [gem[2], gem[3]]);
        else await page.waitForTimeout(90);
      }
    }
    expect(before?.elites).toBe(0);
    expect(carrier?.timeS).toBeGreaterThanOrEqual(60);
    expect(carrier?.timeS).toBeLessThan(61);
    expect(items).toBeDefined();
    expect(opened).toBeDefined();
    expect(rewardRows.length).toBeGreaterThan(0);
    const upgraded = await waitForSnapshot(page, (s) => s.state === 'playing', 3_000);
    await ev.shot('after-treasure');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Quit to title' }).click();
    await waitForSnapshot(page, (s) => s.state === 'title', 5_000);
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const fresh = await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    expect(weapons(fresh)).toEqual([{ id: 'fireWand', level: 1 }]);
    expect(passives(fresh)).toEqual([]);
    await ev.shot('new-run');
    const extract = (s: GameSnapshot | undefined) =>
      s && {
        timeS: s.timeS,
        state: s.state,
        elites: s.elites,
        weapons: s.weapons,
        passives: s.passives,
      };
    ev.json('run', {
      initial: extract(initial),
      before: extract(before),
      carrier: extract(carrier),
      items: extract(items),
      opened: extract(opened),
      rewardRows,
      upgraded: extract(upgraded),
      fresh: extract(fresh),
    });
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- The elite spawns just outside the view; the snapshot’s `elites` count changes before the red marker becomes visible. Keep an eye on level-up dialogs, which stop the simulated clock. In the single-player journey, `I` keeps the run alive and the 1:00 spawn and chest are driven by ordinary simulation and player input.
