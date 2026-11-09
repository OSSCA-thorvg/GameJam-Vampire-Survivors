# Audio

Sound effects and music (#129, ADRs 0004 and 0021): the worker cues its world sounds through one `sfx` bitmask message per rendered frame, the main thread plays them and its own cues with Web Audio, music follows the screen and ducks under dialogs, and `M`, the corner button and the pause screen set mute and volume, persisted in `localStorage` `vs.audio`.

## Sub-features

The main snapshot field `audio` (`main/audio/engine.ts` `snapshot()`, dev and e2e builds) is `{ unlocked, contextState, decoded, failed, music, duck, muted, musicVolume, sfxVolume, hidden, voices, voicesById, played }`. `music` is the loop playing now (`null` while locked, before it decoded, or on the splash); `played` counts sound-effect starts since the page loaded, `voicesById` the live voices.

- **Autoplay unlock:** before any gesture `unlocked: false`, `contextState: 'none'`, `played` empty. The first trusted key or pointer gesture (Enter on the title) gives `unlocked: true`, `contextState: 'running'`, `decoded: 19` and `failed: []` within a few seconds.
- **Music per screen:** `music.title` on the title, character select, multiplayer entry, lobby, results and versus result; `music.stage` in `playing`, `levelUp`, `chest` and `versusPlaying`; a 0.5 s crossfade (`MUSIC_FADE_SEC`).
- **Silent splash:** with `?splash=full` a key pressed while `state` is `'booting'` unlocks (`unlocked: true`) but `music` stays `null` and `played` empty until the title, which then starts `music.title`.
- **World cues (worker):** in a Warden run `played['sfx.hitWhip']`, `['sfx.enemyDeath']`, `['sfx.gemPickup']` rise and standing still gives `['sfx.playerHurt'] >= 1`; every weapon pattern has its hit sound (`HIT_SFX`).
- **Main-thread cues:** `sfx.uiSelect` on every button click (Enter on a focused button clicks it), `sfx.levelUp` per level-up dialog, `sfx.chestOpen` per chest, `sfx.playerDeath` on a death (not on a cleared run), `sfx.interferenceSend` when the local player collects an interference pickup and `sfx.interferenceReceive` when one arrives (versus).
- **Ducking:** `duck: 0.3` on the pause screen, `0.5` under the level-up and chest dialogs (also the versus overlays), `1` otherwise.
- **Voice caps:** `voices <= 24` (`MAX_VOICES`) and each `voicesById[id] <= SOUND_RULES[id].maxVoices` at every sample, with six weapons out at a dense minute.
- **Mute and volume:** defaults unmuted, music 5, effects 7. `M` (not in a text field, no modifier) and `#sound-toggle` (bottom left, "Sound: on"/"Sound: off", outside menu focus) toggle `muted`; the pause screen's "Music -"/"Music +", "Effects -"/"Effects +" step 0–10 (values in `[data-volume="music"]` and `[data-volume="sfx"]`) and its "Sound: on/off" button mutes. All three persist as `{"v":1,"muted":…,"music":…,"sfx":…}` in `localStorage['vs.audio']`; after a reload a muted game plays nothing (`played` stays empty).
- **Hidden tab:** a hidden tab suspends the context (`hidden: true`) and plays nothing; the worker drops cues piled up while hidden, so returning plays no backlog.
- **Versus:** each client hears only its own world (the opponent pane has no cues) plus its interference sent and received.

## How to get to it (user POV)

Open the game and press Enter on the title: sound starts with the title music. Start a run for the stage music and the world cues; Escape for the pause screen with the volume rows; `M` or the corner button to mute. Versus needs the server (`pnpm verify:launch --with-server`) and two players. Preconditions used by the journeys: `I` (invulnerable), `L` (level-up), `G` (weapons), `]` (a denser minute), `E` (a chest), `J` (an interference pickup).

## Driving it

### Claude in Chrome

1. `tabs_create_mcp`, `navigate` to the game URL; `javascript_tool` `await __vsTest.snapshot()` and read `audio` (`unlocked: false`, `contextState: 'none'`).
2. `computer` `key` `Return`; `javascript_tool` `__vsTest.waitFor(s => s.audio.decoded === 19 && s.audio.music === 'music.title', 10000)`. Real Chrome plays the title loop through the speakers.
3. `computer` `key` `Return` (Warden); wait for `audio.music === 'music.stage'` and rising `audio.played`; `key` `Escape`, read `audio.duck` (0.3), `find` "Music +" and click it, read `[data-volume="music"]`; `key` `Escape`.
4. `key` `m`; read `audio.muted` and `localStorage.getItem('vs.audio')`; `navigate` again, `key` `Return`, read `audio.muted: true`; `key` `m`.
5. `gif_creator` can record a short clip with the tab's sound for listening (user decision 4: listening is not a merge gate). `tabs_close_mcp`.

### Playwright

The journeys are `e2e/audio.spec.ts` (the chromium project, so CI runs it headless) and `e2e/audio-versus.spec.ts`:

- `audio: unlock, music per screen, cues, ducking, voice caps, mute and persistence`: steps 1–8 of the sub-features in one page: the title before and after Enter, a Warden run (hurt, then `I` and the Whip's hits, kills and gems), the pause duck and volume values, `L` once (`played['sfx.levelUp']` +1, `duck: 0.5`), six weapons (`G` ×5, `]` ×2) sampled every 100 ms for 10 s, `M` and a reload (muted, nothing played, as Ember), `M` back, then Fire Wand plus Garlic (taken from a level-up card) and `G` ×4 sampled again, and a fresh Warden run standing still to death (`played['sfx.playerDeath'] === 1`, `music.title` on the results). It saves `audio-1-single/audio.json` and screenshots.
- `audio: the splash is silent…`: `/?splash=full`, Space during `booting`, samples every 200 ms until the title; saves `audio-2-splash/splash.json`.
- `audio: a chest plays its cue once`: `I` and `E`, then `played['sfx.chestOpen'] === 1` and `duck: 0.5` under the chest; saves `audio-3-chest/chest.json`.
- `e2e/audio-versus.spec.ts` (`pnpm verify:e2e --with-server`; skipped when no server answers `http://localhost:8787/healthz`, override with `VERIFY_SERVER_HTTP`): two contexts meet and start a match, both `I`, A presses `J` and walks right into the pickup; A's `played['sfx.interferenceSend'] === 1`, B's `played['sfx.interferenceReceive'] === 1`, and neither has the other's cue. Saves `audio-4-versus/a/audio.json`.

Run with `pnpm verify:e2e --project chromium` (and `--with-server` for the versus journey), or against a running client: `VERIFY_URL=<url> VERIFY_EVIDENCE_DIR=$PWD/verification/issue-<N> pnpm exec playwright test -c e2e/playwright.config.ts --project=chromium audio`.

## Gotchas

- Headless Chromium never blocks autoplay and has no speakers: the journeys prove what started (`played`, `music`, `duck`), not what was heard. Listen in a headed run or with Claude in Chrome (2026-11-09, #129).
- Headless Chromium cannot hide a page natively (probed 2026-11-09), so hidden-tab silence is proven at level 4 by `main/audio/director.test.ts`, `main/audio/engine.test.ts` and `worker/game/sfx.test.ts`; the headed `hidden-tab` project could drive it (#129).
- `MAX_WEAPON_SLOTS` is 6, so "all 8 weapons" is two loadouts in one journey; `answerLevelUps(page, { avoidNewWeapons: true })` keeps level-up cards from filling the slots first. Hit counts in software rendering are low (a few frames per second), so the journey waits up to 30 s for each loadout's hit sounds (2026-11-09, #129).
- `sfx.levelUp` has one voice and lasts 0.9 s: a second level-up inside that window is dropped by design, so the `L` step waits for `voicesById['sfx.levelUp'] === 0` first.
- The fast-forward key (`]`) drops the cues of its 60 s on purpose (no burst afterwards).
- The verify launcher's fixed port 5180 is in `ALLOWED_ORIGINS`; a client on another port needs its origin added to the server's `.env` for the versus journey.
