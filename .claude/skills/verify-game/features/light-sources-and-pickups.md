# Light sources and pickups

Breakable light sources and the pickups they drop (#16, ADR 0008): braziers stand around the player, any weapon breaks them, and each broken one drops Floor Chicken, Rosary, Orologion, Vacuum or Little Clover, which take effect when the player walks into them.

## Sub-features

- **Light sources:** 6 intact braziers (`stage.brazier`) are kept 1–2 view widths (1280–2560 units) from the player, re-checked every 2 s; ones beyond 3 view widths are recycled. `snapshot().lights` lists `{ x, y, broken }` for every light (at most 16). Walking toward one brings it into view.
- **Breaking:** the Whip strike, projectiles, King Bible books and the Garlic aura hit lights (1 HP). A broken light shows `stage.brazierBroken` (`broken: true`), cannot be hit again, adds no kill, and drops one pickup at its exact position: a new row in `snapshot().pickups` (`{ id, x, y }`).
- **Collection:** walking within 30 units (16 plus the player's radius 14) removes the pickup and applies it at once; the gem magnet does not pull pickups.
- **Floor Chicken:** `player.hp` rises by up to 30, capped at `maxHp`.
- **Rosary:** every non-boss enemy inside the view dies (`enemyPositions` inside the view drops to 0, `kills` rises by that many, gems drop); off-screen enemies and bosses stay.
- **Orologion:** `frozen: true` for 10 s of game time with the `fx.freeze` frost overlay over the view; enemies stand still (only Whip knockback moves them) and deal no contact damage, while the spawner, gems, weapons and the player keep running; then `frozen: false` and enemies move again.
- **Vacuum:** every gem on the ground at that moment (`gemPositions`) flies to the player and is collected within a few seconds; gems dropped later stay.
- **Little Clover:** `stats.luck` rises by 0.1 for the run.
- **Level gate:** light sources never drop Orologion before player level 4 or Rosary before level 8; drop weights are Floor Chicken 10, Rosary 1, Orologion 2, Vacuum 2, Little Clover 3, × `stats.luck` except Little Clover. The distribution itself is proven by the worker test `light-sources.test.ts`.
- **`K` debug key (dev):** drops the next pickup in `PICKUPS` order (Floor Chicken, Rosary, Orologion, Vacuum, Little Clover, then again), ignoring the level gate, 48 units right of the player; collecting it is still done by walking.
- Snapshot fields: `lights`, `pickups`, `frozen` (registered in `worker/index.ts`), plus `player`, `kills`, `enemyPositions`, `gems`, `gemPositions` and `stats`.

## How to get to it (user POV)

Open the game URL, press Enter on "Start" and Enter again on the character select (Warden, #14). Walk with the arrow keys toward a brazier (they stand off screen at first, 10–20 s of walking away), line up vertically and keep walking at it until the Whip hits it, then walk over the item it drops. Press `1` on each level-up dialog. To try each pickup without finding lights, press `K` (dev and e2e builds) and walk right into the item. No server is needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'characterSelect', 5000)`; `computer` `key` `Enter` (Warden).
2. `javascript_tool` `JSON.stringify((await window.__vsTest.snapshot()).lights)` → 6 rows with `broken: false`. Pick the nearest; `computer` `key` `ArrowUp`/`ArrowDown` with `repeat` until `player.y - 19.2` is within 8 units of its `y`, then `ArrowLeft`/`ArrowRight` toward it with `repeat`, re-reading the snapshot, until it is in view (`screenshot`) and its row shows `broken: true`; `pickups` has a row at the same `x`, `y` (`screenshot`, `zoom`: the broken brazier under the item). Press `1` on any level-up dialog.
3. Wait until `player.hp` is at least 20 below `maxHp`. Then five times: `computer` `key` `k`; read `pickups` (the next ID in order, 48 units right of the player); `computer` `key` `ArrowRight` with `repeat` 3; read the snapshot again: Floor Chicken raised `player.hp`; Rosary left no enemy inside the view and raised `kills`; Orologion set `frozen: true` (`screenshot`: the frost overlay, enemies still) and `frozen` is false again 10 s later; Vacuum emptied `gemPositions` of the gems present when it was taken within a few seconds; Little Clover raised `stats.luck` by 0.1.
4. `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/light-sources-and-pickups.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g "light-sources|pickups"`. Evidence: `light-sources-1-break/` (`break.json`: lights after the walk, the light approached and broken, its drop; screenshots of a light in view and of the broken light with its pickup), `pickups-2-effects/` (`effects.json` with before and after values per pickup; a screenshot per drop, after Rosary and of the frost overlay) and `pickups-3-level-gate/` (`breaks.json`: the player level and the drop of each of 10 broken lights, and deaths).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/light-sources-and-pickups.md (#16).
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

interface Light {
  x: number;
  y: number;
  broken: boolean;
}
interface Pickup {
  id: string;
  x: number;
  y: number;
}
interface PlayerSnap {
  facingX: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
}
type EnemyRow = [uid: number, type: number, x: number, y: number];
type GemRow = [uid: number, tier: number, x: number, y: number, value: number];

const lights = (s: GameSnapshot) => s.lights as Light[];
const pickups = (s: GameSnapshot) => s.pickups as Pickup[];
const player = (s: GameSnapshot) => s.player as PlayerSnap;
const enemyRows = (s: GameSnapshot) => s.enemyPositions as EnemyRow[];
const gemRows = (s: GameSnapshot) => s.gemPositions as GemRow[];
const luck = (s: GameSnapshot) => (s.stats as { luck: number }).luck;
const intact = (s: GameSnapshot) => lights(s).filter((l) => !l.broken);

/** Inside the 1280×720 view around the player, shrunk by `inset` units. */
function inView(p: PlayerSnap, x: number, y: number, inset = 0): boolean {
  return Math.abs(x - p.x) <= 640 - inset && Math.abs(y - p.y) <= 360 - inset;
}

/** Presses exactly `want` among the arrow keys, releasing the others. */
async function setKeys(page: Page, held: Set<string>, want: string[]): Promise<void> {
  for (const k of [...held])
    if (!want.includes(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
  for (const k of want)
    if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
}

/** On the results screen, presses Enter (Retry) and waits for the new run. */
async function retryIfDead(page: Page, s: GameSnapshot): Promise<boolean> {
  if (s.state !== 'results') return false;
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (n) => n.state === 'playing', 5_000);
  return true;
}

interface Break {
  light: Light;
  level: number;
  drop: Pickup | null;
  before: GameSnapshot;
  after: GameSnapshot;
}

/**
 * Walks to the nearest intact light with the arrow keys, lining up vertically first so the Whip's horizontal strike
 * reaches it, then stands facing it within the Whip's reach until it is broken. Returns null when the player died on the way.
 */
async function breakNearestLight(
  page: Page,
  onInView?: (light: Light, s: GameSnapshot) => Promise<void>,
  timeoutMs = 45_000,
): Promise<Break | null> {
  const before = await snapshot(page);
  const p0 = player(before);
  const light = intact(before).sort(
    (a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y),
  )[0];
  if (!light) throw new Error('no intact light');
  const held = new Set<string>();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const s = await snapshot(page);
      if (s.state === 'results') return null;
      const now = lights(s).find((l) => l.x === light.x && l.y === light.y);
      if (!now) throw new Error('the target light was recycled');
      if (now.broken) {
        await setKeys(page, held, []);
        const after = await snapshot(page);
        const drop = pickups(after).find((k) => k.x === light.x && k.y === light.y) ?? null;
        return { light, level: player(s).level, drop, before, after };
      }
      const p = player(s);
      if (onInView && inView(p, light.x, light.y, 40)) {
        const call = onInView;
        onInView = undefined;
        await call(light, s);
      }
      const dx = light.x - p.x;
      const dy = light.y - (p.y - 19.2);
      const want: string[] = [];
      const toward = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      // In the Whip's reach (160 units ahead, 20 above and below plus the light's radius 12) and facing the light:
      // stand still and let it strike, so the player does not walk over the drop and collect it before it is read.
      const inReach = Math.abs(dy) <= 16 && Math.abs(dx) <= 110;
      if (inReach && p.facingX === Math.sign(dx)) {
        await setKeys(page, held, []);
        await page.waitForTimeout(50);
        continue;
      }
      if (Math.abs(dy) > 8) want.push(dy > 0 ? 'ArrowDown' : 'ArrowUp');
      if (Math.abs(dy) <= 40 || Math.abs(dx) > 300) want.push(toward);
      await setKeys(page, held, want);
      await page.waitForTimeout(50);
    }
    throw new Error(`light at ${String(light.x)},${String(light.y)} not broken in time`);
  } finally {
    await setKeys(page, held, []);
  }
}

test('light-sources 1: lights surround a walking player, the Whip breaks one and it drops a pickup', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'light-sources-1-break');
  noteEvidence(testInfo, ev);
  const stop = answerLevelUps(page);
  try {
    await startRun(page);
    await page.keyboard.press('KeyI'); // precondition only: keep the long brazier traversal alive
    await waitForSnapshot(page, (s) => s.debugInvulnerable === true, 2_000);
    // Walk right for 20 s, noting the first light that enters the view.
    let seen: { light: Light; player: PlayerSnap } | null = null;
    await page.keyboard.down('ArrowRight');
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      const s = await snapshot(page);
      const p = player(s);
      const visible = intact(s).find((l) => inView(p, l.x, l.y, 30));
      if (!seen && visible) {
        seen = { light: visible, player: p };
        await ev.shot('light-in-view');
      }
      await page.waitForTimeout(200);
    }
    await page.keyboard.up('ArrowRight');
    const walked = await waitForSnapshot(page, (s) => intact(s).length === 6, 5_000);
    // Lights stand 1–2 view widths from where they were placed: walk to the nearest one and see it enter the view.
    let approached: { light: Light; player: PlayerSnap } | null = null;
    const broken = await breakNearestLight(page, async (light, s) => {
      approached = { light, player: player(s) };
      await ev.shot('light-in-view-approaching');
    });
    if (!broken) throw new Error('the player died before breaking a light');
    await page.waitForTimeout(150);
    await ev.shot('light-broken-with-pickup');
    ev.json('break', {
      afterWalk: { player: player(walked), lights: lights(walked) },
      seenOnStraightWalk: seen,
      approached,
      broken: { light: broken.light, level: broken.level, drop: broken.drop },
      lightsAfter: lights(broken.after),
    });
    expect(intact(walked)).toHaveLength(6);
    expect(approached).not.toBeNull();
    expect(
      lights(broken.after).find((l) => l.x === broken.light.x && l.y === broken.light.y)?.broken,
    ).toBe(true);
    expect(broken.drop).not.toBeNull();
    // Lights are not enemies: breaking one adds no kill (kills may rise from bats meanwhile, never from the light).
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    await stop();
    ev.flush();
  }
});

test('pickups 2: K drops the five pickups in order and walking into each applies its effect', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const ev = startEvidence(page, 'pickups-2-effects');
  noteEvidence(testInfo, ev);
  const stop = answerLevelUps(page);
  const record: Record<string, unknown> = {};
  /** Presses K, waits for `id` 48 units right of the player, walks into it, and returns the snapshots around it. */
  async function take(id: string): Promise<{ before: GameSnapshot; after: GameSnapshot }> {
    await waitForSnapshot(page, (s) => s.state === 'playing', 10_000);
    await page.keyboard.press('KeyK');
    const before = await waitForSnapshot(page, (s) => pickups(s).some((k) => k.id === id), 3_000);
    const spot = pickups(before).find((k) => k.id === id);
    await ev.shot(`${id}-dropped`);
    await holdKeys(page, ['ArrowRight'], 250);
    const after = await waitForSnapshot(
      page,
      (s) => !pickups(s).some((k) => k.id === id && k.x === spot?.x && k.y === spot.y),
      5_000,
    );
    return { before, after };
  }
  try {
    await startRun(page);
    // Floor Chicken needs missing HP: let the bats land a few hits first.
    const hurt = await waitForSnapshot(page, (s) => player(s).hp <= player(s).maxHp - 20, 60_000);
    record.hurt = player(hurt);

    const chicken = await take('floorChicken');
    record.floorChicken = { before: player(chicken.before).hp, after: player(chicken.after).hp };
    expect(player(chicken.after).hp).toBeGreaterThan(player(chicken.before).hp);
    expect(player(chicken.after).hp - player(chicken.before).hp).toBeLessThanOrEqual(30);

    const rosary = await take('rosary');
    const onScreen = (s: GameSnapshot, inset: number) =>
      enemyRows(s).filter(([, , x, y]) => inView(player(s), x, y, inset)).length;
    await ev.shot('rosary-after');
    record.rosary = {
      onScreenBefore: onScreen(rosary.before, 0),
      onScreenAfter: onScreen(rosary.after, 40),
      killsBefore: rosary.before.kills,
      killsAfter: rosary.after.kills,
    };
    expect(onScreen(rosary.before, 0)).toBeGreaterThan(0);
    expect(onScreen(rosary.after, 40)).toBe(0);
    expect((rosary.after.kills as number) - (rosary.before.kills as number)).toBeGreaterThanOrEqual(
      onScreen(rosary.before, 40),
    );

    const clock = await take('orologion');
    expect(clock.after.frozen).toBe(true);
    const frozenAt = clock.after;
    await page.waitForTimeout(150);
    await ev.shot('orologion-frost-overlay');
    const second = await waitForSnapshot(
      page,
      (s) => (s.timeS as number) >= (frozenAt.timeS as number) + 1,
      5_000,
    );
    const then = new Map(enemyRows(frozenAt).map(([uid, , x, y]) => [uid, [x, y]]));
    const both = enemyRows(second).filter(([uid]) => then.has(uid));
    const still = both.filter(([uid, , x, y]) => {
      const [x0, y0] = then.get(uid) ?? [NaN, NaN];
      return Math.hypot(x - (x0 ?? 0), y - (y0 ?? 0)) <= 1;
    });
    const hpFrozen = player(frozenAt).hp;
    const thawed = await waitForSnapshot(page, (s) => s.frozen === false, 15_000);
    record.orologion = {
      frozenAtTimeS: frozenAt.timeS,
      thawedAtTimeS: thawed.timeS,
      enemiesCompared: both.length,
      enemiesStill: still.length,
      hpFrozen,
      hpAtThaw: player(thawed).hp,
    };
    // Only enemies the Whip knocked back may move while frozen.
    expect(both.length).toBeGreaterThan(0);
    expect(still.length / both.length).toBeGreaterThanOrEqual(0.8);
    expect((thawed.timeS as number) - (frozenAt.timeS as number)).toBeGreaterThan(9.5);
    expect((thawed.timeS as number) - (frozenAt.timeS as number)).toBeLessThan(10.6);
    expect(player(thawed).hp).toBeGreaterThanOrEqual(hpFrozen);

    // Vacuum needs gems on the ground.
    await waitForSnapshot(page, (s) => (s.gems as number) > 0, 30_000);
    const vacuum = await take('vacuum');
    const existing = new Set(gemRows(vacuum.after).map(([uid]) => uid));
    const pulled = await waitForSnapshot(
      page,
      (s) => !gemRows(s).some(([uid]) => existing.has(uid)),
      8_000,
    );
    record.vacuum = {
      gemsBefore: vacuum.before.gems,
      gemsAtCollect: vacuum.after.gems,
      gemsAfter: pulled.gems,
      secondsToPull: (pulled.timeS as number) - (vacuum.after.timeS as number),
    };
    expect(vacuum.before.gems as number).toBeGreaterThan(0);

    const clover = await take('littleClover');
    record.littleClover = { before: luck(clover.before), after: luck(clover.after) };
    expect(luck(clover.after) - luck(clover.before)).toBeCloseTo(0.1, 5);
    ev.json('effects', record);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.json('effects', record);
    await stop();
    ev.flush();
  }
});

test('pickups 3: no Rosary before level 8 and no Orologion before level 4 from broken lights', async ({
  page,
}, testInfo) => {
  test.setTimeout(330_000);
  const ev = startEvidence(page, 'pickups-3-level-gate');
  noteEvidence(testInfo, ev);
  const stop = answerLevelUps(page);
  const breaks: { level: number; drop: string | null; light: Light }[] = [];
  let deaths = 0;
  try {
    await startRun(page);
    const deadline = Date.now() + 300_000;
    while (breaks.length < 10 && Date.now() < deadline) {
      const s = await snapshot(page);
      if (await retryIfDead(page, s)) {
        deaths++;
        continue;
      }
      if (s.state !== 'playing') {
        await page.waitForTimeout(100);
        continue;
      }
      const b = await breakNearestLight(page).catch((err: unknown) => {
        console.warn(String(err));
        return null;
      });
      if (b) breaks.push({ level: b.level, drop: b.drop?.id ?? null, light: b.light });
    }
    await ev.shot('after-breaks');
    ev.json('breaks', { breaks, deaths });
    expect(breaks.length).toBeGreaterThanOrEqual(10);
    for (const b of breaks) {
      if (b.level < 8) expect(b.drop).not.toBe('rosary');
      if (b.level < 4) expect(b.drop).not.toBe('orologion');
    }
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.json('breaks', { breaks, deaths });
    await stop();
    ev.flush();
  }
});
```

## Gotchas

- Lights are placed at least one view width away, so a straight 20 s walk does not always pass one in view; journey 1 walks to the nearest light instead and screenshots it when it enters the view (2026-11-08, #16).
- A standing player is hit within seconds; journey 2 waits for 20 missing HP before Floor Chicken so the heal shows. During Orologion, Whip knockback still moves frozen enemies, so the journey requires at least 80% of the tracked enemies to stand still (all 18 did) (2026-11-08, #16).
- Journey 1 stands still facing the light once it is within the Whip's reach: walking on, the player once collected the drop before the snapshot read it (2026-11-08, #16). Journey 3 still walks between lights and may collect a drop at once (another weapon breaks the light as the player passes), recorded as `drop: null`.
- Journey 3 can take 1–3 minutes and may die on the way; it presses Enter (Retry, which keeps the character since #14) and keeps counting breaks across runs. Levels stay low (1–2), so it proves the gate for those levels; the Rosary gate at 4–7 and the distribution are level 4 (`light-sources.test.ts`) (2026-11-08, #16).
- Ring distances, weights, level gates and whether the magnet pulls pickups are initial values, untuned against footage (`docs/reference/gameplay.md` § Pickups kept in this game) (2026-11-08, #16).

- 2026-11-09 (#84): The intact/broken brazier lifecycle journey died at18s before reaching a distant light. It now presses the real I key and confirms debugInvulnerable before its long traversal. The six intact lights, real weapon break, exact drop position and all lifecycle assertions remain unchanged; pickup2 still takes real damage for its Floor Chicken check. Pickup3 completed its original10-break gate checks with recorded real retries, so no extra precondition was changed there.
