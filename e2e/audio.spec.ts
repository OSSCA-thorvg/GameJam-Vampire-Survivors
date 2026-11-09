// Audio journeys (#129): drive .claude/skills/verify-game/features/audio.md headless. Headless Chromium has no
// speakers, but its AudioContext runs, so the `audio` snapshot field (main/audio/engine.ts) proves what started:
// the unlock on the first gesture, the music per screen, every cue, the ducking, the voice caps, mute and its
// persistence. Debug keys only reach preconditions (`I`, `L`, `G`, `E`).
import { expect, test, type Page } from '@playwright/test';
import { MAX_VOICES, SOUND_RULES, type SfxId } from '../packages/shared/src/content/audio';
import {
  answerLevelUps,
  noteEvidence,
  openGame,
  snapshot,
  startEvidence,
  waitForSnapshot,
  type GameSnapshot,
} from './helpers';

interface AudioField {
  unlocked: boolean;
  contextState: string;
  decoded: number;
  failed: string[];
  music: string | null;
  duck: number;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  hidden: boolean;
  voices: number;
  voicesById: Partial<Record<SfxId, number>>;
  played: Partial<Record<SfxId, number>>;
}
const audioOf = (s: GameSnapshot): AudioField => {
  const a = (s as Record<string, unknown>).audio as AudioField | undefined;
  if (!a) throw new Error('no audio snapshot field');
  return a;
};
const played = (s: GameSnapshot, id: SfxId): number => audioOf(s).played[id] ?? 0;
const totalPlayed = (s: GameSnapshot): number =>
  Object.values(audioOf(s).played).reduce<number>((a, b) => a + b, 0);
/** Software rendering in CI is slow; waits scale for it, assertions do not. */
const SLOW_MS = 30_000;

async function waitAudio(
  page: Page,
  predicate: (a: AudioField, s: GameSnapshot) => boolean,
  ms = SLOW_MS,
) {
  return waitForSnapshot(page, (s) => predicate(audioOf(s), s), ms);
}

/** From the title: Enter on Start, Enter on the default Warden. */
async function enterRun(page: Page): Promise<void> {
  await waitForSnapshot(page, (s) => s.state === 'title', 10_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'characterSelect', 5_000);
  await page.keyboard.press('Enter');
  await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
}

/** Grants `grants` weapons with `G` and skips 2 minutes with `]` (preconditions), then samples the voices every 100 ms for 10 s: within the caps. */
async function sampleCaps(page: Page, grants: number) {
  const stop = answerLevelUps(page, { avoidNewWeapons: true });
  for (let i = 0; i < grants; i++) {
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(150);
  }
  // Two minutes ahead (`]`, precondition) for a denser crowd; the fast-forward drops its own cues.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('BracketRight');
    await page.waitForTimeout(300);
  }
  const samples: { voices: number; voicesById: AudioField['voicesById'] }[] = [];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const a = audioOf(await snapshot(page));
    samples.push({ voices: a.voices, voicesById: a.voicesById });
    await page.waitForTimeout(100);
  }
  await stop();
  const last = await snapshot(page);
  const weapons = (last.weapons as { id: string }[]).map((w) => w.id);
  expect(weapons).toHaveLength(6);
  for (const x of samples) {
    expect(x.voices).toBeLessThanOrEqual(MAX_VOICES);
    for (const [id, n] of Object.entries(x.voicesById))
      expect(n).toBeLessThanOrEqual(SOUND_RULES[id as SfxId].maxVoices);
  }
  return {
    weapons,
    samples: samples.length,
    maxVoices: Math.max(...samples.map((x) => x.voices)),
    maxById: Object.fromEntries(
      (Object.keys(SOUND_RULES) as SfxId[]).map((id) => [
        id,
        Math.max(...samples.map((x) => x.voicesById[id] ?? 0)),
      ]),
    ),
    played: audioOf(last).played,
  };
}

/** Waits (answering level-ups) until each of `ids` has played in this page load; returns the counts. */
async function waitForHits(page: Page, ids: SfxId[]): Promise<AudioField['played']> {
  const stop = answerLevelUps(page, { avoidNewWeapons: true });
  try {
    const s = await waitAudio(page, (_a, x) => ids.every((id) => played(x, id) > 0), 30_000);
    return audioOf(s).played;
  } finally {
    await stop();
  }
}

/** Presses `L` (precondition) until a level-up offers Garlic, and takes it; other dialogs are answered with `1`. */
async function takeGarlic(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const s = await snapshot(page);
    if ((s.weapons as { id: string }[]).some((w) => w.id === 'garlic')) return;
    if (s.state !== 'levelUp') {
      await page.keyboard.press('KeyL');
      await waitForSnapshot(page, (x) => x.state === 'levelUp', 5_000);
    }
    const names = await page
      .locator('[role="dialog"][aria-label="Level up"] button.card .card-name')
      .allTextContents();
    const garlic = names.indexOf('Garlic');
    await page.keyboard.press(String(garlic >= 0 ? garlic + 1 : 1));
    await page.waitForTimeout(150);
  }
  throw new Error('no level-up offered Garlic');
}

test.describe.configure({ timeout: 240_000 });

test('audio: unlock, music per screen, cues, ducking, voice caps, mute and persistence', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'audio-1-single');
  noteEvidence(testInfo, ev);
  const log: Record<string, unknown> = {};
  try {
    // 1. Nothing exists before the first gesture.
    const boot = await openGame(page);
    await waitForSnapshot(page, (s) => s.state === 'title', 10_000);
    const before = audioOf(await snapshot(page));
    log.beforeGesture = before;
    expect(before).toMatchObject({
      unlocked: false,
      contextState: 'none',
      music: null,
      muted: false,
      musicVolume: 5,
      sfxVolume: 7,
    });
    expect(totalPlayed(boot)).toBe(0);
    await expect(page.locator('#sound-toggle')).toHaveText('Sound: on');
    await ev.shot('title-before-gesture');

    // 2. Enter on the title unlocks, decodes all 19 files and starts the title loop; the click sound plays.
    await page.keyboard.press('Enter');
    const unlocked = await waitAudio(page, (a) => a.decoded === 19 && a.music === 'music.title');
    log.afterEnter = audioOf(unlocked);
    expect(audioOf(unlocked)).toMatchObject({
      unlocked: true,
      contextState: 'running',
      failed: [],
    });
    expect(unlocked.state).toBe('characterSelect');
    expect(played(unlocked, 'sfx.uiSelect')).toBeGreaterThanOrEqual(1);

    // 3. A Warden run plays the stage loop; standing still, the player is hurt, then (invulnerable, `I`) the Whip
    // hits and kills and the gems are collected.
    await page.keyboard.press('Enter');
    const run = await waitAudio(
      page,
      (a, s) => s.state === 'playing' && a.music === 'music.stage',
      10_000,
    );
    log.runStart = audioOf(run);
    const stop = answerLevelUps(page, { avoidNewWeapons: true });
    const hurt = await waitAudio(page, (_a, s) => played(s, 'sfx.playerHurt') >= 1, 20_000);
    log.hurt = audioOf(hurt);
    await page.keyboard.press('KeyI');
    const cues = await waitAudio(
      page,
      (_a, s) =>
        played(s, 'sfx.hitWhip') > 0 &&
        played(s, 'sfx.enemyDeath') > 0 &&
        played(s, 'sfx.gemPickup') > 0,
      20_000,
    );
    log.worldCues = audioOf(cues);
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    await ev.shot('run-cues');

    // 4. Keep answering natural level-ups until the pause opens. Escape is ignored on a level-up.
    const pause = page.getByRole('dialog', { name: 'Paused' });
    await expect(async () => {
      if (!(await pause.isVisible())) await page.keyboard.press('Escape');
      await expect(pause).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5_000 });
    await stop();
    const pausedS = await waitAudio(
      page,
      (a, s) => s.state === 'playing' && s.paused && a.duck === 0.3,
      5_000,
    );
    log.paused = audioOf(pausedS);
    await expect(page.locator('[data-volume="music"]')).toHaveText('5');
    await expect(page.locator('[data-volume="sfx"]')).toHaveText('7');
    await ev.shot('pause-duck');
    await page.keyboard.press('Escape');
    await waitAudio(page, (a, s) => !s.paused && a.duck === 1, 5_000);

    // 5. A level-up (`L`, precondition) plays once and ducks to 50 %.
    await waitAudio(page, (a) => (a.voicesById['sfx.levelUp'] ?? 0) === 0, 5_000);
    const levelBefore = played(await snapshot(page), 'sfx.levelUp');
    await page.keyboard.press('KeyL');
    const level = await waitAudio(page, (a, s) => s.state === 'levelUp' && a.duck === 0.5, 5_000);
    log.levelUp = { before: levelBefore, after: audioOf(level) };
    expect(played(level, 'sfx.levelUp') - levelBefore).toBe(1);
    await ev.shot('levelup-duck');
    await page.keyboard.press('1');
    await waitAudio(page, (a, s) => s.state === 'playing' && a.duck === 1, 5_000);

    // 6a. Six weapons at once (`G` ×5, precondition; `MAX_WEAPON_SLOTS` is 6): the caps hold over 10 s of samples.
    log.voiceCapsA = await sampleCaps(page, 5);
    log.hitsA = await waitForHits(page, [
      'sfx.hitWhip',
      'sfx.hitMagicWand',
      'sfx.hitKnife',
      'sfx.hitAxe',
      'sfx.hitCross',
      'sfx.hitKingBible',
    ]);
    await ev.shot('six-weapons');

    // 7. `M` mutes and persists; after a reload the game stays muted and plays nothing; `M` unmutes.
    await page.keyboard.press('KeyM');
    await waitAudio(page, (a) => a.muted, 5_000);
    await expect(page.locator('#sound-toggle')).toHaveText('Sound: off');
    const stored = await page.evaluate(() => localStorage.getItem('vs.audio'));
    log.stored = stored;
    expect(stored).toContain('"muted":true');
    await page.reload();
    await waitForSnapshot(page, (s) => s.ready && s.state === 'title', SLOW_MS);
    await page.keyboard.press('Enter');
    const mutedRun = await waitAudio(page, (a) => a.unlocked && a.decoded === 19, SLOW_MS);
    expect(audioOf(mutedRun).muted).toBe(true);
    // Ember starts with the Fire Wand, for the second loadout below.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await waitForSnapshot(page, (s) => s.state === 'playing', 5_000);
    await page.keyboard.press('KeyI');
    const stop3 = answerLevelUps(page, { avoidNewWeapons: true });
    await page.waitForTimeout(4_000);
    await stop3();
    const silent = await snapshot(page);
    log.mutedAfterReload = audioOf(silent);
    expect(audioOf(silent).voices).toBe(0);
    expect(totalPlayed(silent)).toBe(0);
    await page.keyboard.press('KeyM');
    await waitAudio(page, (a) => !a.muted, 5_000);
    expect(await page.evaluate(() => localStorage.getItem('vs.audio'))).toContain('"muted":false');

    // 6b. The other two weapons: Fire Wand (Ember) and Garlic (taken from a level-up card, `L` as precondition),
    // filled up to six with `G` ×4.
    await takeGarlic(page);
    log.voiceCapsB = await sampleCaps(page, 4);
    log.hitsB = await waitForHits(page, ['sfx.hitFireWand', 'sfx.hitGarlic']);
    await ev.shot('second-loadout');

    // 8. A fresh Warden run, standing still to death: the death cue once, and the title loop on the results screen.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Quit to title' }).click();
    await enterRun(page);
    const stop4 = answerLevelUps(page, { avoidNewWeapons: true });
    const dead = await waitAudio(
      page,
      (a, s) => s.state === 'results' && a.music === 'music.title',
      60_000,
    );
    await stop4();
    log.death = audioOf(dead);
    expect(played(dead, 'sfx.playerDeath')).toBe(1);
    await ev.shot('results');
  } finally {
    ev.json('audio', log);
    ev.flush();
  }
});

test('audio: the splash is silent; a key during it unlocks, and the title starts the music', async ({
  page,
}, testInfo) => {
  const ev = startEvidence(page, 'audio-2-splash');
  noteEvidence(testInfo, ev);
  const samples: unknown[] = [];
  try {
    await page.goto('/?splash=full');
    await waitForSnapshot(page, (s) => s.state === 'booting' && 'audio' in s, SLOW_MS);
    await page.keyboard.press('Space');
    for (;;) {
      const s = await snapshot(page).catch(() => null);
      if (!s) {
        await page.waitForTimeout(100);
        continue;
      }
      const a = audioOf(s);
      samples.push({ state: s.state, unlocked: a.unlocked, music: a.music, played: a.played });
      if (s.state !== 'booting') break;
      expect(a.music).toBeNull();
      expect(totalPlayed(s)).toBe(0);
      await page.waitForTimeout(200);
    }
    expect(
      samples.some(
        (x) =>
          (x as { unlocked: boolean; state: string }).unlocked &&
          (x as { state: string }).state === 'booting',
      ),
    ).toBe(true);
    const title = await waitAudio(
      page,
      (a, s) => s.state === 'title' && a.music === 'music.title',
      SLOW_MS,
    );
    expect(totalPlayed(title)).toBe(0);
    await ev.shot('title-music');
  } finally {
    ev.json('splash', samples);
    ev.flush();
  }
});

test('audio: a chest plays its cue once', async ({ page }, testInfo) => {
  const ev = startEvidence(page, 'audio-3-chest');
  noteEvidence(testInfo, ev);
  let log: unknown = null;
  try {
    await openGame(page);
    await enterRun(page);
    await page.keyboard.press('KeyI');
    await page.keyboard.press('KeyE');
    const deadline = Date.now() + 30_000;
    let s = await snapshot(page);
    while (s.state !== 'chest' && Date.now() < deadline) {
      if (s.state === 'levelUp') await page.keyboard.press('1');
      await page.waitForTimeout(100);
      s = await snapshot(page);
    }
    expect(s.state).toBe('chest');
    const chest = await waitAudio(page, (a) => a.duck === 0.5, 5_000);
    log = audioOf(chest);
    expect(played(chest, 'sfx.chestOpen')).toBe(1);
    await ev.shot('chest');
  } finally {
    ev.json('chest', log);
    ev.flush();
  }
});
