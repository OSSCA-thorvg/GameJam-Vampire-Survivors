# Interference

Multiplayer interference items (#21, ADRs 0005, 0006, 0008): in a versus match, enemy kills occasionally drop a Swarm, Gem Thief or Elite Call pickup; walking into one sends its effect through the server to an opponent's world, whose screen names the sender. Single player never drops them.

## Sub-features

- **Drops (versus only):** from 1:00 of simulated time a kill may drop an interference pickup at the kill's position (`pickup.interference.swarm`, `.gemThief`, `.eliteCall`, drawn from their catalog IDs): normal kills 0.4%, elites 25%, at least 20 s after the previous drop, and only while fewer than 2 lie in the world. Weights Swarm 3, Gem Thief 2, Elite Call 2. Initial values, untuned (the owner decided not to tune against the original). Snapshot `interferenceOnGround` counts them; the `pickups` field (#16) still lists light-source pickups only.
- **Collection:** walking within 30 units collects it (no magnet). The worker posts `interferenceCollected { kind }`, the page sends `interference { kind }` (one frame per pickup), and the sender's HUD shows "Sent <label>" in ThorVG under the timer for 2 s.
- **Routing:** the server picks the target (the other player with two; a random living opponent otherwise) and sends `interferenceIncoming { kind, fromPlayerId, fromNickname }`. Each sender gets a burst of 4 and then one per 20 s per match (`INTERFERENCE_SEND_LIMIT`); excess is dropped without an `error` and logged as `interference_capped` (`room-server.md`).
- **Banner:** the target sees "<nickname> sent <label>!" with the `fx.warning` icon at the top centre (`.interference-banner`, DOM, `textContent` only), fading out after 3 s; at most 3 stack. The native `fx.warning` effect is represented here by its eagerly validated static PNG data-URL poster; canvas playback remains Lottie. The icon must decode (`naturalWidth > 0`), and showing the banner must not fetch the JSON as an HTML image. Snapshot `banners` lists the shown texts. The nickname never reaches the worker.
- **Swarm:** 30 of the current wave's highest-weight enemy appear on a ring 1.1 × half the view diagonal around the target's player (`enemies` +30 at once), never past 400.
- **Gem Thief:** every gem on the target's ground disappears (`gems` 0); `player.xp` and `player.level` are not reduced.
- **Elite Call:** one elite of the wave's main enemy appears 400 units from the target in a random direction (`elites` +1), with its red marker and chest.
- **Timing:** an effect that arrives while the target's level-up or chest dialog is open applies when the world resumes; none applies after the target died or the run ended.
- **`J` debug key (dev, versus only):** drops the next kind in order (Swarm, Gem Thief, Elite Call, again) 48 units right of the player, ignoring the drop rules; in single player it logs `[debug] spawnInterference: nothing spawned`.
- Snapshot fields: `interferenceOnGround`, `elites` (worker), `banners` (main), plus `enemies`, `gems`, `player`.

## How to get to it (user POV)

Server needed (`lobby.md`, `versus-match.md`): `cp -n .env.example .env`, `pnpm verify:launch --with-server`, two browser contexts, then in both: title → Multiplayer → character → nickname; A (Alice) creates a room, B (Bob) joins with A's code, both press Ready, A presses Start. Debug keys used only for preconditions: `I` (invulnerable), `G` (more weapons, so more kills), `J` (put an interference pickup next to A), `]` (fast-forward, single-player journey).

## Driving it

### Claude in Chrome

Two tabs are two players (`lobby.md`).

1. Start a match in tabs A and B as in `versus-match.md` step 1; press `i` in both. Answer level-ups with `1` and chests with Enter as they come.
2. In A: `computer` `key` `j`; `javascript_tool` `(await __vsTest.snapshot()).interferenceOnGround` → 1; `screenshot` (the pickup right of the player). Read B's `JSON.stringify((({enemies, elites, gems, player}) => ({enemies, elites, gems, player}))(await __vsTest.snapshot()))`.
3. In A: `computer` `key` `ArrowRight` with `repeat` 3 → A's `interferenceOnGround` 0 and the "Sent Swarm" line under A's timer (`screenshot`).
4. In B within a second: `find` "Alice sent Swarm!" (`screenshot`), and the snapshot shows `enemies` about 30 higher. Repeat steps 2–4 for Gem Thief (`gems` 0, `player.level` not lower, `player.xp` not lower unless it levelled up) and Elite Call (`elites` +1).
5. Drops: start a new match, `i` and `g` four times in both tabs, then read `interferenceOnGround` every few seconds for 3 minutes: 0 until `timeS` 60, never above 2.

### Playwright

Save `versus-helpers.ts` from `versus-match.md` and this spec as `verification/issue-<N>/journeys/interference.spec.ts`. After `pnpm verify:launch --with-server` and `pnpm verify:doctor`, run `VERIFY_JOURNEYS=verification/issue-<N>/journeys VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project chromium -g interference`. Journey 4 overwrites `assets/pickups/interference-swarm.png` with the Elite Call art and restores it from a backup in `verification/issue-<N>/art-backup/` in `finally`; check `git status assets` afterwards.

Evidence: `interference-1-effects/<a|b>/` (`effects.json`, screenshots of each pickup, the toast and B's banners, `ws-frames.log`), `interference-2-drops/a/drops.json` (per-second `[timeS, onGround, kills]` for both worlds), `interference-3-single/a/single.json`, `interference-4-art/<original|swapped>/a/swarm-pickup-closeup.png`, `interference-5-server-cap/cap.json`.

```ts
// Feature-map journeys for .claude/skills/verify-game/features/interference.md (#21): two browser contexts against
// the Docker server on :8787. Debug keys reach preconditions only: `I` (invulnerable), `G` (more weapons, more kills)
// and `J` (drop the next interference pickup next to the player); collecting is done by walking into it.
import { expect, test } from '@playwright/test';
import { noteEvidence, pageErrors, snapshot, waitForSnapshot } from '../../../e2e/helpers';
import { answerDialogs, meet, player, startMatch, type Player } from './versus-helpers';

const banners = (s: Awaited<ReturnType<typeof snapshot>>): string[] =>
  (s.banners as string[]) ?? [];

async function invulnerable(p: Player): Promise<void> {
  await p.page.keyboard.press('i');
  await waitForSnapshot(p.page, (s) => s.debugInvulnerable === true, 2_000);
}

test('interference 1: A collects Swarm, Gem Thief and Elite Call; B gets each effect and a banner naming A', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'interference-1-effects/a');
  const b = await player(browser, 'interference-1-effects/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) await invulnerable(p);
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    // Let B's world gather enemies and gems for a while.
    await waitForSnapshot(b.page, (s) => s.timeS >= 20, 60_000);
    const results: Record<string, unknown> = {};
    for (const [kind, label] of [
      ['swarm', 'Swarm'],
      ['gemThief', 'Gem Thief'],
      ['eliteCall', 'Elite Call'],
    ] as const) {
      await waitForSnapshot(b.page, (s) => banners(s).length === 0, 10_000);
      await a.page.keyboard.press('j');
      const dropped = await waitForSnapshot(
        a.page,
        (s) => (s.interferenceOnGround as number) >= 1,
        2_000,
      );
      await a.ev.shot(`a-${kind}-on-ground`);
      const before = await snapshot(b.page);
      const t0 = Date.now();
      await a.page.keyboard.down('ArrowRight');
      await waitForSnapshot(a.page, (s) => s.interferenceOnGround === 0, 5_000);
      await a.page.keyboard.up('ArrowRight');
      const tCollected = Date.now();
      await a.ev.shot(`a-${kind}-sent-toast`);
      const after = await waitForSnapshot(b.page, (s) => banners(s).length > 0, 5_000);
      const tBanner = Date.now();
      await b.ev.shot(`b-${kind}-banner`);
      const bannerText = await b.page.locator('.interference-banner').first().textContent();
      const icon = b.page.locator('.interference-banner img').first();
      await expect
        .poll(() =>
          icon.evaluate((image) => (image instanceof HTMLImageElement ? image.naturalWidth : 0)),
        )
        .toBeGreaterThan(0);
      expect(await icon.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      const sent = a.frames.filter((f) => f.dir === '→' && f.type === 'interference' && f.t >= t0);
      const got = b.frames.filter(
        (f) => f.dir === '←' && f.type === 'interferenceIncoming' && f.t >= t0,
      );
      results[kind] = {
        aGroundBefore: dropped.interferenceOnGround,
        sent: sent.map((f) => f.body),
        received: got.map((f) => f.body),
        collectToBannerMs: tBanner - tCollected,
        sendToReceiveMs: (got[0]?.t ?? NaN) - (sent[0]?.t ?? NaN),
        bannerSnapshot: banners(after),
        bannerText,
        before: {
          enemies: before.enemies,
          elites: before.elites,
          gems: before.gems,
          player: before.player,
        },
        after: {
          enemies: after.enemies,
          elites: after.elites,
          gems: after.gems,
          player: after.player,
        },
      };
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual({ type: 'interference', kind });
      expect(got).toHaveLength(1);
      expect(banners(after)).toEqual([`Alice sent ${label}!`]);
      expect(tBanner - tCollected).toBeLessThan(1_500);
      const bp = before.player as { xp: number; level: number };
      const ap = after.player as { xp: number; level: number };
      if (kind === 'swarm') {
        expect(after.enemies as number).toBeGreaterThanOrEqual((before.enemies as number) + 20);
        expect(after.enemies as number).toBeLessThanOrEqual(400);
      } else if (kind === 'gemThief') {
        expect(before.gems as number).toBeGreaterThan(0);
        expect(after.gems as number).toBeLessThanOrEqual(3);
        expect(ap.level).toBeGreaterThanOrEqual(bp.level);
        expect(ap.level > bp.level || ap.xp >= bp.xp).toBe(true);
      } else {
        expect(after.elites as number).toBe((before.elites as number) + 1);
      }
    }
    a.ev.json('effects', results);
    // A's own world is untouched by what it sent.
    const aEnd = await snapshot(a.page);
    a.ev.json('a-end', { enemies: aEnd.enemies, elites: aEnd.elites, banners: aEnd.banners });
    expect(banners(aEnd)).toEqual([]);
    await stopA();
    await stopB();
    expect(pageErrors(a.ev)).toEqual([]);
    expect(pageErrors(b.ev)).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('interference 2: natural drops appear only after 60 s and never more than 2 at once, in both worlds', async ({
  browser,
}, testInfo) => {
  test.setTimeout(420_000);
  const a = await player(browser, 'interference-2-drops/a');
  const b = await player(browser, 'interference-2-drops/b');
  noteEvidence(testInfo, a.ev);
  try {
    await meet(a, b);
    await startMatch(a, b);
    for (const p of [a, b]) {
      await invulnerable(p);
      // More weapons, more kills (precondition only).
      for (let i = 0; i < 4; i++) await p.page.keyboard.press('g');
    }
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    const samples: { wallS: number; a: [number, number, number]; b: [number, number, number] }[] =
      [];
    const start = Date.now();
    while (Date.now() - start < 180_000) {
      const [sa, sb] = await Promise.all([snapshot(a.page), snapshot(b.page)]);
      samples.push({
        wallS: Math.round((Date.now() - start) / 1000),
        a: [Math.round(sa.timeS), sa.interferenceOnGround as number, sa.kills as number],
        b: [Math.round(sb.timeS), sb.interferenceOnGround as number, sb.kills as number],
      });
      await a.page.waitForTimeout(1000);
    }
    await a.ev.shot('a-3min');
    await b.ev.shot('b-3min');
    const early = samples.filter((s) => s.a[0] < 60 || s.b[0] < 60);
    const sentA = a.frames.filter((f) => f.dir === '→' && f.type === 'interference');
    const sentB = b.frames.filter((f) => f.dir === '→' && f.type === 'interference');
    a.ev.json('drops', {
      samples,
      maxOnGround: {
        a: Math.max(...samples.map((s) => s.a[1])),
        b: Math.max(...samples.map((s) => s.b[1])),
      },
      sent: {
        a: sentA.map((f) => [f.t - start, f.body]),
        b: sentB.map((f) => [f.t - start, f.body]),
      },
    });
    for (const s of samples) {
      if (s.a[0] < 60) expect(s.a[1], `A at ${String(s.a[0])} s`).toBe(0);
      if (s.b[0] < 60) expect(s.b[1], `B at ${String(s.b[0])} s`).toBe(0);
      expect(s.a[1]).toBeLessThanOrEqual(2);
      expect(s.b[1]).toBeLessThanOrEqual(2);
    }
    expect(early.length).toBeGreaterThan(30);
    await stopA();
    await stopB();
    expect(pageErrors(a.ev)).toEqual([]);
    expect(pageErrors(b.ev)).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test('interference 3: single player never drops interference and J does nothing', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const a = await player(browser, 'interference-3-single/a');
  noteEvidence(testInfo, a.ev);
  try {
    await a.page.keyboard.press('Enter');
    await waitForSnapshot(a.page, (s) => s.state === 'characterSelect', 5_000);
    await a.page.keyboard.press('Enter');
    await waitForSnapshot(a.page, (s) => s.state === 'playing', 5_000);
    await invulnerable(a);
    await a.page.keyboard.press('j');
    let max = 0;
    for (let i = 0; i < 10; i++) {
      // `]` fast-forwards 60 s (precondition), answering dialogs on the way.
      const s = await snapshot(a.page);
      max = Math.max(max, s.interferenceOnGround as number);
      if (s.state === 'levelUp') await a.page.keyboard.press('1');
      else if (s.state === 'chest') await a.page.keyboard.press('Enter');
      else await a.page.keyboard.press(']');
      await a.page.waitForTimeout(300);
    }
    const end = await snapshot(a.page);
    a.ev.json('single', { mode: end.mode, timeS: end.timeS, kills: end.kills, maxOnGround: max });
    expect(end.mode).toBe('single');
    expect(max).toBe(0);
    expect(a.frames).toEqual([]);
    expect(a.ev.workerLog.some((l) => l.includes('spawnInterference: nothing spawned'))).toBe(true);
  } finally {
    await a.close();
  }
});

test('interference 4: the Swarm pickup is drawn from its catalog ID, and a swapped file changes its look', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const { copyFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const art = join(import.meta.dirname, '../../../assets/pickups/interference-swarm.png');
  const other = join(import.meta.dirname, '../../../assets/pickups/interference-elite-call.png');
  const backupDir = join(import.meta.dirname, '../art-backup');
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, 'interference-swarm.png');
  copyFileSync(art, backup);
  /** One match where A drops the first kind (Swarm) with `J` and the area around it is captured. */
  const capture = async (journey: string): Promise<void> => {
    const a = await player(browser, `${journey}/a`);
    const b = await player(browser, `${journey}/b`);
    noteEvidence(testInfo, a.ev);
    try {
      await meet(a, b);
      await startMatch(a, b);
      await a.page.keyboard.press('i');
      await a.page.keyboard.press('j');
      const s = await waitForSnapshot(a.page, (x) => x.interferenceOnGround === 1, 2_000);
      a.ev.json('placeholders', (s.assets as { placeholders: string[] }).placeholders);
      expect((s.assets as { placeholders: string[] }).placeholders).not.toContain(
        'pickup.interference.swarm',
      );
      await a.ev.shot('swarm-pickup');
      await a.page.screenshot({
        path: join(a.ev.dir, 'swarm-pickup-closeup.png'),
        clip: { x: 640, y: 320, width: 100, height: 80 },
      });
    } finally {
      await a.close();
      await b.close();
    }
  };
  try {
    await capture('interference-4-art/original');
    copyFileSync(other, art);
    await capture('interference-4-art/swapped');
  } finally {
    copyFileSync(backup, art);
  }
});

test('interference 5: the server routes at most INTERFERENCE_SEND_LIMIT per sender and drops the rest silently', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const open = (): Promise<{ ws: WebSocket; log: { type: string; [k: string]: unknown }[] }> =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://localhost:8787/ws');
        const log: { type: string }[] = [];
        ws.onmessage = (e) => log.push(JSON.parse(String(e.data)) as { type: string });
        ws.onopen = () => resolve({ ws, log });
        ws.onerror = () => reject(new Error('socket error'));
      });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const until = async (f: () => boolean) => {
      for (let i = 0; i < 200 && !f(); i++) await wait(50);
    };
    const a = await open();
    const b = await open();
    const send = (p: { ws: WebSocket }, m: unknown) => p.ws.send(JSON.stringify(m));
    send(a, { type: 'hello', v: 2 });
    send(b, { type: 'hello', v: 2 });
    send(a, { type: 'createRoom', nickname: 'Alice' });
    await until(() => a.log.some((m) => m.type === 'roomState'));
    const code = a.log.find((m) => m.type === 'roomState')?.code as string;
    send(b, { type: 'joinRoom', code, nickname: 'Bob' });
    await until(() => b.log.some((m) => m.type === 'roomState'));
    send(a, { type: 'setReady', ready: true });
    send(b, { type: 'setReady', ready: true });
    await wait(200);
    send(a, { type: 'startMatch' });
    await until(() => a.log.some((m) => m.type === 'matchStart'));
    const startAt = a.log.find((m) => m.type === 'matchStart')?.startAt as number;
    await wait(Math.max(0, startAt - Date.now()) + 300);
    for (let i = 0; i < 10; i++) send(a, { type: 'interference', kind: 'swarm' });
    await wait(1000);
    const out = {
      received: b.log.filter((m) => m.type === 'interferenceIncoming').length,
      errorsToA: a.log.filter((m) => m.type === 'error'),
      aOpen: a.ws.readyState === WebSocket.OPEN,
      sample: b.log.find((m) => m.type === 'interferenceIncoming'),
    };
    a.ws.close();
    b.ws.close();
    return out;
  });
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(import.meta.dirname, '../interference-5-server-cap');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cap.json'), JSON.stringify(result, null, 2) + '\n');
  expect(result.received).toBe(4);
  expect(result.errorsToA).toEqual([]);
  expect(result.aOpen).toBe(true);
});
```

## Gotchas

- Editing a client source file while a journey runs makes Vite reload both pages, which restarts the worlds (`timeS` back to 0); do not edit while journeys run (2026-11-09, #21).
- Two pages with the same input play identical worlds, so natural drops appear at the same times in both (measured: first drop at 91 s, second at 160 s, in both worlds, with `I` and four `G` weapons, 849 kills in 3 minutes) (2026-11-09, #21).
- B keeps collecting gems between the two snapshots around Gem Thief, so B may level up meanwhile (XP then restarts from 0); the exact "XP and level unchanged" proof is the unit test in `systems/interference.test.ts` (2026-11-09, #21).
- Measured against the local Docker server: collection to B's banner 164–215 ms, A's `interference` frame to B's `interferenceIncoming` 0–2 ms; Swarm took B from 18 to 47 enemies, Gem Thief from 19 gems to 0, Elite Call from 0 elites to 1 (2026-11-09, #21).
- The server cap counts per match: after 4 `interference` frames in a burst, the next is routed only 20 s later. Journey 1 sends 3, so rerunning it in the same match is fine but a fourth and fifth `J` in quick succession are dropped (2026-11-09, #21).

- 2026-11-09 (#84): `fx.warning` is native Lottie after the motion migration; an HTML image cannot decode its JSON URL. `loadAssetUrls` eagerly validates the single same-owner PNG poster, logical size, bounded transport and actual decode, caches a PNG data URL under the unchanged CSP and fails closed on invalid native posters. The real incoming-banner journey checks a decoded image instead of assuming a `.png` URL suffix. Native canvas animation, source art and all logical IDs remain unchanged.
