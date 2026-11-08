# Native visual motion

All 36 declared visual-motion IDs use native Lottie, including genuine actor idle/locomotion and active-only pooled playback (#84, ADR 0019).

## Sub-features

- The gallery contains all 84 drawable IDs with no placeholders; `galleryMotion` starts as `'idle'`. `O` switches every actor between native `'idle'` and `'move'` markers while position/anchors remain stable, and restarts one-shot effects for inspection. Visually inspect all 13 actors, both facing directions and each loop seam against the approved sources.
- `motion` contains actual `created`, `active`, `frameCalls`, `resolverCalls`, `segmentChanges` and `slotApplications` counters. Active controllers advance; hidden pooled/grid/preview controllers do not. `V` opens the540-instance mass preview in move state, deactivates the grid, and restores it on return. Repeated switches preserve controller counts and make no additional requests.
- All 16 weapon visuals, six effects and the intact brazier flame visibly cycle. Existing level-up/chest-open timing is unchanged. Hit/death are one-shot; freeze/warning and stage flame loop. Portraits/icons/ground/broken brazier/drops/HUD/font retain their static roles.
- Real input starts/stops actor locomotion and preserves facing, position, camera and contact damage. Native player feedback matches the legacy 0.5s/0.08s alpha100/255 phases, including exact remaining 0.4; use the native pixel probe for exact 31-sample boundary proof and the player-health journey for normal play.
- Escape/hidden-tab pause, death, Retry and Title preserve gameplay behavior and reusable Paints. Existing movement, enemies, run-flow, health and hidden-tab journeys remain required. After main #14–#17, also drive all four selected characters (`character-select.md`), bosses/elites, every chest evolution, intact/broken braziers and pickup freeze, and the stage finale through their feature-map journeys; native presentation must preserve each gameplay contract.
- Actual headed WebGL pilot: synthetic normal400enemies/600projectiles/400gems, conservative1200enemy-controller prewarm, V540 and3000bats. Warm stress must reach40fps; normal native capacity≤512MiB and stress≤1GiB. Report native capacity, worker JS heap, cold/warm costs and actual hardware separately. Do not infer GPU performance from software probes.
- In the versus split pane, verify that fresh peer views drive native presentation during local pauses. Peer away/out or an exhausted buffer freezes the last pose, and leaving releases the peer leases. Follow the real two-client journey in `versus-match.md`.
- Production strips all motion/gallery diagnostic controls and snapshots; run the production journey and build guard.

## How to get to it (user POV)

After launch and doctor, open `/?gallery`. Use arrows/WASD to pan, `O` to compare idle/move and `V` to open/close the mass preview. Open `/`, press Enter for character select, choose with arrows and press Enter again to start single player; use arrows/WASD for ordinary play and Escape to pause. All four choices use their own native actor and starting weapon. Open `/?stress=3000` only for the explicit developer performance scenario. Current stage waves reach all six enemy types and three bosses, and chests reach all eight evolved weapons. Gallery/corpus inspection covers the complete art inventory; gameplay coverage follows `character-select.md`, `bosses-and-elites.md`, `chests-and-evolutions.md`, `light-sources-and-pickups.md` and `stage-and-finale.md` with their real debug preconditions.

## Driving it

### Claude in Chrome

1. Follow the parent skill's owned-tab launch/doctor procedure; open `/?gallery` and wait for `ready`, `renderer:'gl'`,84 gallery IDs and no asset placeholders.
2. Record a screenshot/GIF and snapshot. Pan through every group. Press `O`, record genuine idle→move pose differences and preserved anchor/scale; return to idle.
3. Press `V`; record the visible 540 preview, move-state actors, stable `motion` counters and no additional fetches. Toggle back and repeat; hidden controllers must remain inactive.
4. Open `/`, press Enter, select a character with arrows and press Enter again; hold/release movement and turn left/right. Repeat with all four characters through `character-select.md`. Follow movement, player-health, run-flow and hidden-tab entries plus the boss/chest/evolution, light/pickup/freeze and finale entries. Record native pixel-probe results separately for exact feedback samples.
5. Run headed performance probes in an otherwise idle task-owned browser. Retain renderer/capacity/heap/frame/resource counters, screenshots, snapshots and logs; close the owned tab and clean the owned server.

### Playwright

Save as `verification/issue-<N>/journeys/motion.spec.ts`; run with the parent skill's journey command. The exact per-frame/heap/performance probes supplement this normal gallery journey.

```ts
import { expect, test } from '@playwright/test';
import {
  holdKeys,
  openGame,
  pageErrors,
  snapshot,
  startEvidence,
  waitForSnapshot,
} from '../../../e2e/helpers';

test('motion: native actor states, preview activity and cached reuse', async ({ page }) => {
  const ev = startEvidence(page, 'motion-gallery');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  try {
    const ready = await openGame(page, '/?gallery');
    expect(ready.renderer).toBe('gl');
    expect(ready.assets).toMatchObject({ loaded: 85, total: 85, placeholders: [] });
    expect(ready.galleryMotion).toBe('idle');
    expect((ready.gallery as { ids: string[] }).ids).toHaveLength(84);
    await ev.shot('idle');
    const initial = await snapshot(page);
    const networkStart = requests.length;
    await page.keyboard.press('KeyO');
    const moving = await waitForSnapshot(page, (s) => s.galleryMotion === 'move', 2000);
    await ev.shot('move');
    await holdKeys(page, ['ArrowDown'], 2400);
    await ev.shot('actors-effects');
    await page.keyboard.press('KeyV');
    const preview = await waitForSnapshot(page, (s) => s.galleryPreview === true, 2000);
    await ev.shot('mass-preview');
    // Visit the whole locomotion cycle before testing cached native decoder reuse.
    await waitForSnapshot(page, (s) => s.timeS > preview.timeS + 2.1, 5000);
    await page.keyboard.press('KeyV');
    await waitForSnapshot(page, (s) => s.galleryPreview === false, 2000);
    const once = await snapshot(page);
    await page.keyboard.press('KeyV');
    await waitForSnapshot(page, (s) => s.galleryPreview === true, 2000);
    await page.keyboard.press('KeyV');
    const twice = await waitForSnapshot(page, (s) => s.galleryPreview === false, 2000);
    const counters = (value: typeof twice) =>
      value.motion as {
        created: number;
        active: number;
        frameCalls: number;
        resolverCalls: number;
      };
    expect(counters(twice).created).toBe(counters(once).created);
    expect(counters(twice).active).toBe(counters(once).active);
    expect(counters(twice).resolverCalls).toBe(counters(once).resolverCalls);
    expect(counters(twice).frameCalls).toBeGreaterThan(counters(initial).frameCalls);
    expect(requests.slice(networkStart)).toEqual([]);
    ev.json('states', { initial, moving, preview, once, twice });
    expect(pageErrors(ev)).toEqual([]);
    expect(ev.workerLog.filter((line) => line.includes('[error]'))).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- 2026-11-08 (#84): Native `info()` reports the full composition, even after segment selection; use validated marker lengths. Picture duplication does not clone an animation controller.
- 2026-11-08 (#84): Hidden instances still prepare poses when advanced. Visibility alone is insufficient; playback activity must change with pool/scene lifecycle.
- 2026-11-08 (#84): Software-WASM boundary/pixel tests prove native behavior, not WebGL performance. Cached encoded bytes do not prove decoded bitmap sharing, and WASM capacity is neither live allocations nor a leak measurement.
- 2026-11-08 (#84): Exact blink parity needs the full fixed-step boundary probe; screenshots taken at arbitrary wall-clock times cannot prove all31 samples. Preserve the rejected exact0.4 case as the regression reference.
- 2026-11-09 (#84, main #17): Stage gameplay now includes all six ordinary enemies and three bosses. Report actual normal-game prewarm and synthetic benchmark capacity separately; the earlier two-enemy/400-controller baseline is historical. Do not change gameplay populations to reach a benchmark.
- 2026-11-08 (#84): Use the bridge's `waitFor` or helper `waitForSnapshot` for readiness before reading worker-native globals. Keep all probe/browser ownership and cleanup evidence.
