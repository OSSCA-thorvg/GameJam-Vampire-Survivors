# Player health

Contact damage, invulnerability, death and the in-game HUD (#9): enemies touching the player lower its HP, at most one hit per 0.5 s with the sprite blinking meanwhile; at 0 HP the run stops; the HP bar, the `mm:ss` timer and the kill counter are drawn by ThorVG in the worker (ADR 0004), never in the DOM.

## Sub-features

- **Contact damage:** standing still at minute 0, the first bats touch the player within about 5–10 s; `player.hp` drops from 100 in steps of an enemy's `contactDamage` (bat 5, ghoul 10), and a crowd deals only the strongest touching enemy's damage per hit.
- **Invulnerability:** consecutive drops are at least 0.5 s of simulated time apart (`HIT_INVULN_SEC`; by sampling, at least 0.5 s minus one sampling interval), and `player.invulnerable` is `true` right after a hit.
- **Damage feedback:** while invulnerable, the player sprite blinks (opacity 255 and 100, alternating every 0.08 s): screenshots during the window show it dimmed.
- **HP bar:** a 40×6 bar 6 units under the player's feet, in world space; its red fill shrinks to `hp / maxHp` (screenshots: full at 100, about two thirds at 65).
- **Timer and kills:** `mm:ss` at the top centre (from `timeS`, updated once per second) and a skull with the kill count at the top right (`kills`, rising as weapons kill enemies since #10; `weapons.md`).
- **Not DOM:** while playing, `#app` holds only `canvas` and the empty `#screens` container; no DOM text matches `\d\d:\d\d`, and no element carries an HP, timer or kill class or id.
- **Death:** at 0 HP the run stops (`state: 'results'`, `paused: true`, `timeS` frozen) and the results screen shows the survived time matching `timeS`, kills and level (`run-flow.md`).
- Snapshot fields: `player` (`{ x, y, facingX, hp, maxHp, invulnerable }`, `worker/game/snapshot.ts`), `timeS`, `kills` (`world.stats.kills`), `state` and `paused`.

## How to get to it (user POV)

Open the game URL, press Enter on "Start" and stand still. No server and no debug key are needed.

## Driving it

### Claude in Chrome

1. `tabs_context_mcp` `{ createIfEmpty: true }`, use the group's new empty tab; `gif_creator` `start_recording`.
2. `navigate` to `http://localhost:5180/`; `javascript_tool` `await window.__vsTest.waitFor((s) => s.state === 'title', 30000)`; `computer` `key` `Enter`; `screenshot` → full HP bar under the player, `00:00` timer, skull and `0`.
3. `javascript_tool` `JSON.stringify((await window.__vsTest.waitFor((s) => s.player.hp < 100, 30000)).player)` → `hp` 95 or 90, `invulnerable: true`; `screenshot` at once (the sprite dimmed) and `zoom` on the player → the bar's red fill shorter.
4. `javascript_tool` sampling `player.hp` and `timeS` every 100 ms for 3 s (one `await` loop returning the array) → drops of 5 or 10, at least about 0.4 s of `timeS` apart.
5. `javascript_tool` `[...document.querySelectorAll('#app *')].map((e) => e.tagName)` → `["CANVAS", "DIV"]`; `get_page_text` → empty.
6. `javascript_tool` `JSON.stringify(await window.__vsTest.waitFor((s) => s.state === 'results', 90000))`; `get_page_text` → Survived matches `timeS`; `screenshot`.
7. `gif_creator` `stop_recording`, `export` `{ download: true, filename: "issue-<N>-player-health.gif" }`; `tabs_close_mcp` on the tab.

### Playwright

Save the spec as `verification/issue-<N>/journeys/player-health.spec.ts`. After `pnpm verify:launch` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g player-health`. Evidence: `player-health-1-contact/` (`samples.json` with every sample, the drops, the gaps and the sampling slack; screenshots at full HP, the first hit and later), `player-health-2-hud-not-dom/` (`dom.json`), `player-health-3-death/` (`death.json`, the results screenshot).

```ts
// Feature-map journeys for .claude/skills/verify-game/features/player-health.md (#9).
import { expect, test } from '@playwright/test';
import {
  answerLevelUps,
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
  invulnerable: boolean;
}
const player = (s: GameSnapshot) => s.player as PlayerSnap;

test('player-health 1: contact lowers HP in hits at least 0.5 s apart, the sprite blinks and the bar shrinks', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'player-health-1-contact');
  noteEvidence(testInfo, ev);
  try {
    const start = await startRun(page);
    expect(start.renderer).toBe('gl');
    expect(player(start)).toMatchObject({ hp: 100, maxHp: 100, invulnerable: false });
    await ev.shot('full-hp');
    // Stand still until the first bats arrive.
    const firstHit = await waitForSnapshot(page, (s) => player(s).hp < 100, 30_000);
    await ev.shot('first-hit-blinking');
    const samples: { at: number; timeS: number; hp: number; invulnerable: boolean }[] = [];
    for (let i = 0; i <= 30; i++) {
      const s = await snapshot(page);
      samples.push({
        at: Date.now(),
        timeS: s.timeS,
        hp: player(s).hp,
        invulnerable: player(s).invulnerable,
      });
      if (i === 5 || i === 15) await ev.shot(`hp-${String(player(s).hp)}`);
      if (i < 30) await page.waitForTimeout(100);
    }
    const drops = samples.filter((s, i) => i > 0 && s.hp < (samples[i - 1]?.hp ?? s.hp));
    const gaps = drops.slice(1).map((d, i) => d.timeS - (drops[i]?.timeS ?? 0));
    // A drop is seen at the first sample after the hit, so two observed drops can be closer than the hits by up to one
    // sampling interval (in simulated seconds).
    const slack = Math.max(...samples.slice(1).map((s, i) => s.timeS - (samples[i]?.timeS ?? 0)));
    const span = (samples.at(-1)?.timeS ?? 0) - (samples[0]?.timeS ?? 0);
    ev.json('samples', { firstHit: player(firstHit), samples, drops, gaps, slack, span });
    expect(drops.length).toBeGreaterThanOrEqual(2);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(0.5 - slack - 1e-9);
    // At most one hit per 0.5 s window over the sampled span (plus the window already open at the first sample).
    expect(drops.length).toBeLessThanOrEqual(Math.floor(span / 0.5) + 1);
    // Each step of HP is one contact hit: a bat's 5 or a ghoul's 10.
    for (let i = 1; i < samples.length; i++) {
      const d = (samples[i - 1]?.hp ?? 0) - (samples[i]?.hp ?? 0);
      expect([0, 5, 10]).toContain(d);
    }
    expect(samples.some((s) => s.invulnerable)).toBe(true);
    await ev.shot('after-3s');
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('player-health 2: the HP bar, timer and kill counter are drawn by the worker, not the DOM', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'player-health-2-hud-not-dom');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    await waitForSnapshot(page, (s) => s.timeS >= 2, 10_000);
    await ev.shot('hud');
    const dom = await page.evaluate(() => ({
      elements: [...document.querySelectorAll('#app *')].map(
        (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
      ),
      text: document.body.innerText,
    }));
    const clockLike = await page.$$('text=/\\d\\d:\\d\\d/');
    const hpLike = await page.$$(
      '[class*="hp" i], [id*="hp" i], [class*="kill" i], [id*="kill" i], [class*="timer" i], [id*="timer" i]',
    );
    ev.json('dom', { ...dom, clockLike: clockLike.length, hpLike: hpLike.length });
    expect(dom.elements).toEqual(['canvas', 'div#screens']);
    expect(dom.text.trim()).toBe('');
    expect(clockLike).toHaveLength(0);
    expect(hpLike).toHaveLength(0);
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});

test('player-health 3: at 0 HP the run stops and the results show the survived time, kills and level', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const ev = startEvidence(page, 'player-health-3-death');
  noteEvidence(testInfo, ev);
  try {
    await startRun(page);
    answerLevelUps(page); // #11: a run pauses on each level-up; answer it with 1 and keep playing
    const dead = await waitForSnapshot(page, (s) => s.state === 'results', 90_000);
    await ev.shot('results');
    await page.waitForTimeout(1000);
    const later = await snapshot(page);
    const shown = {
      time: await page.locator('[data-stat="time"]').textContent(),
      kills: await page.locator('[data-stat="kills"]').textContent(),
      level: await page.locator('[data-stat="level"]').textContent(),
    };
    const t = Math.floor(dead.timeS);
    const expected = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    ev.json('death', {
      dead,
      later: { timeS: later.timeS, steps: later.steps, paused: later.paused },
      shown,
      expected,
    });
    expect(player(dead).hp).toBe(0);
    expect(dead.paused).toBe(true);
    expect(later.timeS).toBe(dead.timeS);
    // Since #10 the Whip kills bats, so the results show the run's final kill count; since #11 the level reached.
    expect(shown).toEqual({
      time: expected,
      kills: String(dead.kills),
      level: String((dead.player as { level: number }).level),
    });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeFocused();
    expect(pageErrors(ev)).toEqual([]);
  } finally {
    ev.flush();
  }
});
```

## Gotchas

- Since #10 the starting Whip kills bats on the facing side, so `kills` is no longer 0 at death; a standing player still dies in about 15 s at minute 0 (measured 15.5 s, 2026-11-08, #10).

- The first hit's timing depends on the random seed (spawn points); wait on `hp < 100` rather than a fixed time (2026-11-08, #9).
- A drop is seen at the first sample after the hit, so sampled gaps can be shorter than 0.5 s by up to one sampling interval (about 0.1–0.2 s of `timeS` with snapshot latency); the journey allows exactly that slack and also caps the number of drops at one per 0.5 s of the sampled span (2026-11-08, #9).
- The blink alternates every 0.08 s (about 5 frames), so whether a screenshot catches the dimmed phase is chance; take one right after `hp` drops and compare it with the full-HP shot (2026-11-08, #9).
- In SwiftShader headless runs the HUD text is drawn; check it on screenshots, never through the DOM (2026-11-08, #9).
