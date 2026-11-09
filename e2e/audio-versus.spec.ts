// Audio in versus (#129, ADRs 0005 and 0018): two headless contexts meet in one room on the Docker server
// (`pnpm verify:e2e --with-server`), following versus-match.md; A collects an interference pickup (`J`, precondition)
// and hears it sent, B hears it received. Each client hears only its own world: the opponent pane carries no cues.
// Skipped when no server answers /healthz (the CI verify job runs without one).
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { SfxId } from '../packages/shared/src/content/audio';
import {
  noteEvidence,
  openGame,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type Evidence,
  type GameSnapshot,
} from './helpers';

const SERVER = process.env.VERIFY_SERVER_HTTP ?? 'http://localhost:8787';

interface AudioField {
  unlocked: boolean;
  music: string | null;
  played: Partial<Record<SfxId, number>>;
}
const audioOf = (s: GameSnapshot): AudioField => (s as Record<string, unknown>).audio as AudioField;
const played = (s: GameSnapshot, id: SfxId): number => audioOf(s).played[id] ?? 0;
const overlayOf = (s: GameSnapshot): string | null =>
  ((s.versus as { overlay: string | null } | null | undefined) ?? null)?.overlay ?? null;

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(`${SERVER}/healthz`)).ok;
  } catch {
    return false;
  }
}

async function player(browser: Browser, journey: string): Promise<{ page: Page; ev: Evidence }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const ev = startEvidence(page, journey);
  await openGame(page);
  await waitForSnapshot(page, (s) => s.state === 'title', 10_000);
  return { page, ev };
}

/** Title → Multiplayer → the default character → the entry screen. */
async function toEntry(page: Page): Promise<void> {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'multiplayerEntry', 5_000);
  await expect(page.locator('.multiplayer-entry .status')).toHaveText('', { timeout: 10_000 });
}

/** Answers versus level-ups with `1` and closes chests with Enter until stopped. */
function answerDialogs(page: Page): () => Promise<void> {
  const control = { running: true };
  const loop = (async () => {
    while (control.running && !page.isClosed()) {
      try {
        const overlay = overlayOf(await snapshot(page));
        if (overlay === 'levelUp') await page.keyboard.press('1');
        else if (overlay === 'chest') await page.keyboard.press('Enter');
      } catch {
        // closing
      }
      await page.waitForTimeout(100).catch(() => undefined);
    }
  })();
  return async () => {
    control.running = false;
    await loop;
  };
}

test('audio versus: interference sent and received each play once, on the right client', async ({
  browser,
}, testInfo) => {
  test.skip(!(await serverUp()), `no game server at ${SERVER}/healthz`);
  test.setTimeout(180_000);
  const a = await player(browser, 'audio-4-versus/a');
  const b = await player(browser, 'audio-4-versus/b');
  noteEvidence(testInfo, a.ev);
  const log: Record<string, unknown> = {};
  try {
    await toEntry(a.page);
    await a.page.keyboard.type('Alice');
    await a.page.keyboard.press('Enter');
    await waitForSnapshot(a.page, (s) => s.state === 'lobby', 10_000);
    const code = (await a.page.locator('.room-code').textContent()) ?? '';
    await toEntry(b.page);
    await b.page.keyboard.type('Bob');
    await b.page.getByRole('button', { name: 'Join room' }).click();
    await b.page.keyboard.type(code);
    await b.page.keyboard.press('Enter');
    await waitForSnapshot(b.page, (s) => s.state === 'lobby', 10_000);
    for (const p of [a, b]) {
      await expect(p.page.getByRole('button', { name: 'Ready' })).toBeEnabled({ timeout: 10_000 });
      await p.page.getByRole('button', { name: 'Ready' }).focus();
      await p.page.keyboard.press('Enter');
    }
    const start = a.page.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled();
    await start.focus();
    await a.page.keyboard.press('Enter');
    for (const p of [a, b]) {
      const s = await waitForSnapshot(
        p.page,
        (x) => x.state === 'versusPlaying' && audioOf(x).music === 'music.stage',
        20_000,
      );
      expect(audioOf(s).unlocked).toBe(true);
      await p.page.keyboard.press('KeyI');
    }
    const stopA = answerDialogs(a.page);
    const stopB = answerDialogs(b.page);
    // Both worlds make their own sounds.
    for (const p of [a, b])
      await waitForSnapshot(p.page, (s) => played(s, 'sfx.enemyDeath') > 0, 30_000);
    const beforeA = await snapshot(a.page);
    const beforeB = await snapshot(b.page);
    log.before = { a: audioOf(beforeA).played, b: audioOf(beforeB).played };
    expect(
      played(beforeA, 'sfx.interferenceSend') + played(beforeB, 'sfx.interferenceReceive'),
    ).toBe(0);

    await a.page.keyboard.press('KeyJ');
    await waitForSnapshot(a.page, (s) => (s.interferenceOnGround as number) >= 1, 5_000);
    await a.page.keyboard.down('ArrowRight');
    await waitForSnapshot(a.page, (s) => s.interferenceOnGround === 0, 10_000);
    await a.page.keyboard.up('ArrowRight');
    const sent = await waitForSnapshot(
      a.page,
      (s) => played(s, 'sfx.interferenceSend') >= 1,
      5_000,
    );
    const got = await waitForSnapshot(
      b.page,
      (s) => played(s, 'sfx.interferenceReceive') >= 1,
      5_000,
    );
    await a.ev.shot('a-sent');
    await b.ev.shot('b-received');
    await stopA();
    await stopB();
    await a.page.waitForTimeout(1_000);
    const afterA = await snapshot(a.page);
    const afterB = await snapshot(b.page);
    log.after = { a: audioOf(afterA).played, b: audioOf(afterB).played };
    expect(played(sent, 'sfx.interferenceSend')).toBe(1);
    expect(played(got, 'sfx.interferenceReceive')).toBe(1);
    // Neither client hears the other side's interference cue.
    expect(played(afterA, 'sfx.interferenceReceive')).toBe(0);
    expect(played(afterB, 'sfx.interferenceSend')).toBe(0);
    expect(played(afterA, 'sfx.interferenceSend')).toBe(1);
    expect(played(afterB, 'sfx.interferenceReceive')).toBe(1);
  } finally {
    a.ev.json('audio', log);
    a.ev.flush();
    b.ev.flush();
    await a.page.context().close();
    await b.page.context().close();
  }
});
