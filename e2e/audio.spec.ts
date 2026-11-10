// Audio journeys (#129): drive .claude/skills/verify-game/features/audio.md headless. Headless Chromium has no
// speakers, but its AudioContext runs, so the `audio` snapshot field (main/audio/engine.ts) proves what started:
// the unlock on the first gesture, the music per screen, every cue, the ducking, the voice caps, mute and its
// persistence. Debug keys only reach preconditions (`I`, `L`, `G`, `E`).
import { expect, test, type Page } from '@playwright/test';
import { HIT_SFX, MAX_VOICES, SOUND_RULES, type SfxId } from '../packages/shared/src/content/audio';
import { WEAPONS, type WeaponId } from '../packages/shared/src/content/weapons';
import {
  answerLevelUps,
  levelUpKey,
  noteEvidence,
  openGame,
  settlePlaying,
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

/** Answers level-ups and chests (the same card choice as the journey's `answerLevelUps`) until play is steady. */
const settle = (page: Page) => settlePlaying(page, { avoidNewWeapons: true });

/**
 * Settles, presses `key` and waits for `predicate`; if a level-up or chest interrupted it (#148: they arrive more
 * often), settles and presses once more. A second miss throws `waitForSnapshot`'s error.
 */
async function pressSettled(
  page: Page,
  key: string,
  predicate: (a: AudioField, s: GameSnapshot) => boolean,
  ms = 5_000,
): Promise<GameSnapshot> {
  await settle(page);
  await page.keyboard.press(key);
  try {
    return await waitAudio(page, predicate, ms);
  } catch (error) {
    const s = await snapshot(page);
    if (s.state !== 'levelUp' && s.state !== 'chest') throw error;
    await settle(page);
    await page.keyboard.press(key);
    return waitAudio(page, predicate, ms);
  }
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

/** How often `steer` turns the player, and for how long it holds the arrow key. */
const STEER_EVERY_MS = 1_500;
const STEER_HOLD_MS = 300;

/**
 * Turns the player with real arrow-key input until stopped (#169): every `STEER_EVERY_MS` it holds `ArrowLeft` or
 * `ArrowRight`, alternating, for `STEER_HOLD_MS`. The Knife flies along the last movement direction and the Whip
 * strikes toward the facing side, so a standing player's Knife only hits an enemy that crosses one line; turning
 * sweeps both sides of the crowd. Returns the function that stops it and releases the key.
 */
function steer(page: Page): () => Promise<void> {
  const control = { running: true };
  const loop = (async () => {
    let left = true;
    while (control.running && !page.isClosed()) {
      const key = left ? 'ArrowLeft' : 'ArrowRight';
      left = !left;
      try {
        await page.keyboard.down(key);
        await page.waitForTimeout(STEER_HOLD_MS);
      } finally {
        await page.keyboard.up(key).catch(() => undefined);
      }
      await page.waitForTimeout(STEER_EVERY_MS - STEER_HOLD_MS).catch(() => undefined);
    }
  })();
  return async () => {
    control.running = false;
    await loop.catch(() => undefined);
  };
}

/**
 * Waits (answering level-ups and steering the player, `steer`) until each of `ids` has played in this page load;
 * returns the counts.
 */
async function waitForHits(page: Page, ids: SfxId[]): Promise<AudioField['played']> {
  const stop = answerLevelUps(page, { avoidNewWeapons: true });
  const stopSteer = steer(page);
  try {
    const s = await waitAudio(page, (_a, x) => ids.every((id) => played(x, id) > 0), 30_000);
    return audioOf(s).played;
  } finally {
    await stopSteer();
    await stop();
  }
}

/**
 * Presses `L` (precondition) until a level-up offers Garlic, and takes it. Other dialogs get the card that adds no new
 * weapon (`levelUpKey`, the choice of `answerLevelUps({ avoidNewWeapons: true })`), so a weapon slot stays free until
 * Garlic is offered (#169: answering `1` could fill all six slots first).
 */
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
    await page.keyboard.press(garlic >= 0 ? String(garlic + 1) : await levelUpKey(page, false));
    await page.waitForTimeout(150);
  }
  throw new Error('no level-up offered Garlic');
}

test.describe.configure({ timeout: 480_000 }); // #148: the standing death in step 8 takes longer

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
    await stop();
    await settle(page);
    await ev.shot('run-cues');

    // 4. The pause ducks the music to 30 %.
    const pausedS = await pressSettled(
      page,
      'Escape',
      (a, s) => s.state === 'playing' && s.paused && a.duck === 0.3,
    );
    log.paused = audioOf(pausedS);
    await expect(page.locator('[data-volume="music"]')).toHaveText('5');
    await expect(page.locator('[data-volume="sfx"]')).toHaveText('7');
    await ev.shot('pause-duck');
    await page.keyboard.press('Escape');
    await waitAudio(page, (a, s) => !s.paused && a.duck === 1, 5_000);

    // 5. A level-up (`L`, precondition) plays once and ducks to 50 %. A natural level-up landing between the settle and
    // the read below would be counted in `levelBefore`, and one landing after it shows as a dialog before `L`'s; either
    // way one dialog opens at a time, so the dialog `L` waits for plays exactly one more cue.
    await settle(page);
    await waitAudio(page, (a) => (a.voicesById['sfx.levelUp'] ?? 0) === 0, 5_000);
    const settled = await settle(page);
    const levelBefore = played(settled, 'sfx.levelUp');
    await page.keyboard.press('KeyL');
    const level = await waitAudio(page, (a, s) => s.state === 'levelUp' && a.duck === 0.5, 5_000);
    log.levelUp = { before: levelBefore, after: audioOf(level) };
    expect(played(level, 'sfx.levelUp') - levelBefore).toBe(1);
    await ev.shot('levelup-duck');
    // Answer it (and any natural level-up queued behind it), then the duck is lifted.
    await settle(page);
    await waitAudio(page, (a, s) => s.state === 'playing' && a.duck === 1, 5_000);

    // 6a. Six weapons at once (`G` ×5, precondition; `MAX_WEAPON_SLOTS` is 6): the caps hold over 10 s of samples.
    const capsA = await sampleCaps(page, 5);
    log.voiceCapsA = capsA;
    // Each owned weapon's hit sound. Usually Whip, Magic Wand, Knife, Axe, Cross and King Bible; since #148's
    // built-in Growth a run levels up more often, so a dialog offering only new weapons can add one (Garlic) before
    // the `G` grants, and the expected sounds follow the weapons actually owned.
    const ownedA = capsA.weapons.map((id) => HIT_SFX[WEAPONS[id as WeaponId].pattern]);
    log.hitsA = await waitForHits(page, ownedA);
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
    await pressSettled(page, 'Escape', (_a, s) => s.state === 'playing' && s.paused);
    await page.getByRole('button', { name: 'Quit to title' }).click();
    await enterRun(page);
    const stop4 = answerLevelUps(page, { avoidNewWeapons: true });
    const dead = await waitAudio(
      page,
      (a, s) => s.state === 'results' && a.music === 'music.title',
      // A standing Warden dies in about 1–2 minutes of game time since #148 (up to about 200 s in the probe), plus the
      // level-up dialogs.
      300_000,
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
