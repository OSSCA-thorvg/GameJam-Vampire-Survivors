# Asset catalog

Every piece of art the game uses, by logical ID (ADRs 0007/0016/0019). Code and content data refer only to these IDs, and `manifest.json` maps them to files. The categories mirror what Vampire Survivors puts on screen; the **Original role** column says what each asset stands in for, so the art can be judged against footage of the original (`docs/reference/gameplay.md`). Do not copy the original's art. Every file here must be original or properly licensed.

## How to use this list

- **Adding an asset:** add a row here first, with status `needed`, in the PR that introduces the content using it. Then add the file under the folder shown and its `manifest.json` entry, and set the status to `placeholder` or `final`. An ID must not be used in code or data before it has a row here.
- **Replacing art:** drop in the new file at the same path, or point the manifest entry to a new file, and set the status to `final`. No code changes.
- **Status values:**
  - `needed`: no file yet; the game shows the magenta placeholder.
  - `placeholder`: rough art made to keep the game playable.
  - `final`: art the team is happy with.
- **Budget (ADRs 0007/0016/0019):** rows marked **mass** appear in large numbers. Static PNGs use four-times logical dimensions; native motion uses two-times pose resources, nearest filtering and cached ThorVG image paints. See `README.md` for image/native budgets and ADR 0019 for the 36-motion-ID scope. Retained or future SVGs stay within4 paths, with no strokes or gradients.
- **Naming:**
  - `player.<characterId>`, `portrait.<characterId>`;
  - `enemy.<enemyId>`, `boss.<bossId>`;
  - `weapon.<weaponId>` for the in-world projectile or effect, `icon.weapon.<weaponId>` for the UI icon;
  - `icon.passive.<passiveId>`;
  - `pickup.<pickupId>`, `pickup.interference.<id>`;
  - `gem.<tier>`, `fx.<name>`, `stage.<name>`, `ui.<name>`;
  - `font.<name>` for fonts drawn by ThorVG.

  The ID suffixes are the content IDs in `packages/shared/src/content/`.

## Characters (REQUIREMENTS 5) — `assets/characters/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `player.warden` | 48×48 | lottie | Sturdy whip starter (Antonio's role) | C2, G3 | final |
| `player.ember` | 48×48 | lottie | Fire-wand glass cannon | G3 | final |
| `player.swift` | 48×48 | lottie | Adult female elf knife starter: silver hair, blue clothing, visible pointed ears, pale ivory skin | G3 | final |
| `player.aurelia` | 48×48 | lottie | Adult female white-and-gold paladin carrying the existing cross; Cross starter (#14) | G3 | final |
| `portrait.warden` | 128×128 | png | Character-select portrait | G3 | final |
| `portrait.ember` | 128×128 | png | Character-select portrait | G3 | final |
| `portrait.swift` | 128×128 | png | Matching pale-ivory female elf portrait; character-select portrait (#14) | G3 | final |
| `portrait.aurelia` | 128×128 | png | Matching adult female paladin portrait; character-select portrait (#14) | G3 | final |

## Enemies — `assets/enemies/`

Elites reuse their base enemy's art at 1.5× scale with a tint applied in code, so they have no separate rows.

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `enemy.bat` | 32×32 | lottie, **mass** | Fast, fragile swarm (bats) | C3, G6 | final |
| `enemy.ghoul` | 36×40 | lottie, **mass** | Slow early walker (zombies) | C3, G6 | final |
| `enemy.skeleton` | 36×44 | lottie, **mass** | Mid-tier walker (skeletons) | G6 | final |
| `enemy.wisp` | 32×32 | lottie, **mass** | Fast flier (ghosts) | G6 | final |
| `enemy.brute` | 56×56 | lottie, **mass** | Tanky mid-game (werewolves, mudmen) | G6 | final |
| `enemy.wraith` | 64×64 | lottie, **mass** | Late-game heavy (giant mummies) | G6 | final |
| `enemy.lottieTest` | 32×32 | lottie | Not in the game: an original shape-layer test enemy for the #22 Lottie-per-enemy measurement (`?stress=lottie-enemy`) | #22 | placeholder |

## Bosses — `assets/bosses/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `boss.reaper5` | 96×96 | lottie | 5-minute boss that drops a chest | G4, G6 | final |
| `boss.reaper10` | 112×112 | lottie | 10-minute boss that drops a chest | G4, G6 | final |
| `boss.death` | 128×128 | lottie | Death at the time limit | G6 | final |

## Weapons, in world — `assets/weapons/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `weapon.whip` | 160×40 | lottie | Horizontal slash arc | C5 | final |
| `weapon.magicWand` | 12×12 | lottie, **mass** | Homing magic bolt | C5 | final |
| `weapon.knife` | 20×6 | lottie, **mass** | Thrown knife | G2 | final |
| `weapon.axe` | 28×28 | lottie, **mass** | Spinning thrown axe | G2 | final |
| `weapon.cross` | 28×28 | lottie, **mass** | Boomerang cross | G2 | final |
| `weapon.kingBible` | 24×28 | lottie | Orbiting book | G2 | final |
| `weapon.fireWand` | 20×20 | lottie, **mass** | Fireball | G2 | final |
| `weapon.garlic` | 100×100 | lottie | Translucent aura circle | G2 | final |
| `weapon.bloodyTear` | 180×44 | lottie | Evolved whip arc | G4 | final |
| `weapon.holyWand` | 14×14 | lottie, **mass** | Evolved wand bolt | G4 | final |
| `weapon.thousandEdge` | 22×6 | lottie, **mass** | Evolved knife stream | G4 | final |
| `weapon.deathSpiral` | 36×36 | lottie, **mass** | Evolved scythe | G4 | final |
| `weapon.heavenSword` | 32×32 | lottie, **mass** | Evolved cross | G4 | final |
| `weapon.unholyVespers` | 26×30 | lottie | Evolved permanent books | G4 | final |
| `weapon.hellfire` | 40×40 | lottie | Evolved giant fireball | G4 | final |
| `weapon.soulEater` | 140×140 | lottie | Evolved aura | G4 | final |

## Icons — `assets/icons/`

Used by the level-up choice, the character select screen and the HUD inventory. Each is 32×32 logical, exported as 128×128 PNG.

| ID | Format | Original role | Used by | Status |
| --- | --- | --- | --- | --- |
| `icon.weapon.whip`, `icon.weapon.magicWand` | png | Weapon icons | C6 | final |
| `icon.weapon.knife`, `icon.weapon.axe`, `icon.weapon.cross`, `icon.weapon.kingBible`, `icon.weapon.fireWand`, `icon.weapon.garlic` | png | Weapon icons | G2 | final |
| `icon.weapon.bloodyTear`, `icon.weapon.holyWand`, `icon.weapon.thousandEdge`, `icon.weapon.deathSpiral`, `icon.weapon.heavenSword`, `icon.weapon.unholyVespers`, `icon.weapon.hellfire`, `icon.weapon.soulEater` | png | Evolved weapon icons | G4 | final |
| `icon.passive.hollowHeart`, `icon.passive.emptyTome`, `icon.passive.bracer`, `icon.passive.candelabrador`, `icon.passive.clover`, `icon.passive.spellbinder`, `icon.passive.spinach`, `icon.passive.pummarola` | png | Passive icons | G1 | final |

## Drops and pickups — `assets/pickups/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `gem.blue` | 12×16 | png, **mass** | 1 XP gem | C6 | final |
| `gem.green` | 12×16 | png, **mass** | 5 XP gem | C6 | final |
| `gem.red` | 14×18 | png, **mass** | 10+ XP gem, and the merged gem | C6 | final |
| `pickup.floorChicken` | 24×24 | png | Heal 30 | G5 | final |
| `pickup.rosary` | 24×24 | png | Clear the screen | G5 | final |
| `pickup.orologion` | 24×24 | png | Freeze all enemies | G5 | final |
| `pickup.vacuum` | 24×24 | png | Collect all gems | G5 | final |
| `pickup.littleClover` | 24×24 | png | +Luck | G5 | final |
| `pickup.chest` | 32×28 | png | Treasure chest | G4 | final |
| `pickup.interference.swarm` | 28×28 | png | Multiplayer only: send a swarm | M4 | final |
| `pickup.interference.gemThief` | 28×28 | png | Multiplayer only: wipe the opponent's gems | M4 | final |
| `pickup.interference.eliteCall` | 28×28 | png | Multiplayer only: send an elite | M4 | final |

## Stage — `assets/stage/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `stage.ground` | 128×128 | png | Tiled ground of the single forest-like stage | C2 | final |
| `stage.brazier` | 24×40 | lottie | Breakable light source that drops pickups | G5 | final |
| `stage.brazierBroken` | 24×20 | png | Remains after it breaks | G5 | final |

## Effects — `assets/fx/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `fx.hit` | 24×24 | lottie | Flash on a damaged enemy | C5 | final |
| `fx.enemyDeath` | 32×32 | lottie | Puff when an enemy dies | C5 | final |
| `fx.levelUp` | 96×96 | lottie | Ring burst on level-up (proves the Lottie path) | F3, C6 | final |
| `fx.chestOpen` | 128×128 | lottie | Chest opening burst | G4 | final |
| `fx.freeze` | 64×64 | lottie | Frost overlay while Orologion is active | G5 | final |
| `fx.warning` | 48×48 | lottie | Incoming-interference warning | M4 | final |

## UI drawn by ThorVG (the HUD) — `assets/ui/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `ui.placeholder` | 64×64 | png | Magenta "missing asset" reference | F3 | final |
| `ui.xpBar` | 400×12 | png | XP bar frame along the top | C6 | final |
| `ui.hpBar` | 40×6 | png | HP bar frame and empty dark track under the player; red fill is a ThorVG Shape scaled by HP (#9) | C4 | final |
| `ui.skull` | 16×16 | png | Kill counter icon | C4 | final |
| `ui.splash` | 1920×1080 | lottie | "Powered by ThorVG" boot splash: 7 s, 210 frames at 30 fps, drawn at 2/3 scale into the 1280×720 view; provided by the ThorVG project for this game (2026-11-09) | #126 | final |

## Fonts drawn by ThorVG — `assets/fonts/`

Licensed, not original: each font keeps its license and source record next to it. Korean text stays in the DOM (ADR 0009), so ThorVG fonts carry printable ASCII only.

| ID | File | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `font.hud` | `fonts/hud.ttf` | ttf | HUD text: timer `MM:SS`, counters, perf overlay. Noto Sans Mono Regular, `U+0020`–`U+007E`, 9400 bytes, OFL 1.1 (`fonts/LICENSE-NotoSansMono.txt`, ADR 0013). Loaded through manifest asset `font.hud` (#3) | #9, #17, #20 | final |

## Browser UI — `assets/ui/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `ui.favicon` | 32×32 | png | Original red gem browser-tab icon (`ui/favicon.svg`) | Client HTML | final |

<!-- audio:begin -->

## Sound — `assets/audio/`

Original sounds synthesized for this game with ZzFX and ZzFXM (ADR 0021): edit `scripts/audio/sounds.json` and run `sh scripts/make-audio.sh`; never edit an MP3 by hand. Audio is not drawn: it has no size, and the gallery and the boot progress skip it. The music was written from scratch for this game and quotes no other game.

| ID | File | Format | Length | Original role | Used by | Status |
|---|---|---|---|---|---|---|
| `sfx.hitWhip` | `audio/sfx/hit-whip.mp3` | mp3 | 0.15 s | Whip hit: sharp noise crack | #129 | final |
| `sfx.hitMagicWand` | `audio/sfx/hit-magic-wand.mp3` | mp3 | 0.20 s | Magic Wand hit: bright high zap | #129 | final |
| `sfx.hitKnife` | `audio/sfx/hit-knife.mp3` | mp3 | 0.10 s | Knife hit: short dry tick | #129 | final |
| `sfx.hitAxe` | `audio/sfx/hit-axe.mp3` | mp3 | 0.25 s | Axe hit: low heavy thud | #129 | final |
| `sfx.hitCross` | `audio/sfx/hit-cross.mp3` | mp3 | 0.20 s | Cross hit: metallic ping | #129 | final |
| `sfx.hitKingBible` | `audio/sfx/hit-king-bible.mp3` | mp3 | 0.20 s | King Bible hit: soft paper thump | #129 | final |
| `sfx.hitFireWand` | `audio/sfx/hit-fire-wand.mp3` | mp3 | 0.30 s | Fire Wand hit: noisy fire burst | #129 | final |
| `sfx.hitGarlic` | `audio/sfx/hit-garlic.mp3` | mp3 | 0.12 s | Garlic hit: quiet low buzz | #129 | final |
| `sfx.enemyDeath` | `audio/sfx/enemy-death.mp3` | mp3 | 0.30 s | Enemy killed: descending pop | #129 | final |
| `sfx.gemPickup` | `audio/sfx/gem-pickup.mp3` | mp3 | 0.12 s | XP gem collected: rising coin blip | #129 | final |
| `sfx.playerHurt` | `audio/sfx/player-hurt.mp3` | mp3 | 0.30 s | Player takes contact damage: low crunch | #129 | final |
| `sfx.levelUp` | `audio/sfx/level-up.mp3` | mp3 | 0.90 s | Level-up: rising major arpeggio (C5 G5 C6 E6 G6) | #129 | final |
| `sfx.chestOpen` | `audio/sfx/chest-open.mp3` | mp3 | 1.20 s | Treasure chest opens: sparkle fanfare | #129 | final |
| `sfx.playerDeath` | `audio/sfx/player-death.mp3` | mp3 | 1.50 s | Player dies: slow falling tone | #129 | final |
| `sfx.uiSelect` | `audio/sfx/ui-select.mp3` | mp3 | 0.08 s | Menu focus and choice: soft click blip | #129 | final |
| `sfx.interferenceSend` | `audio/sfx/interference-send.mp3` | mp3 | 0.50 s | Versus interference sent: rising whoosh | #129 | final |
| `sfx.interferenceReceive` | `audio/sfx/interference-receive.mp3` | mp3 | 0.70 s | Versus interference received: two-tone alarm with echo | #129 | final |
| `music.title` | `audio/music/title.mp3` | mp3 | 40.420 s (1782528 samples) | Title loop: slow gothic chiptune, 95 BPM, A minor; organ chords, sine bass, sparse bell lead, soft pulse; 16 bars (256 rows) | #129 | final |
| `music.stage` | `audio/music/stage.mp3` | mp3 | 52.965 s (2335744 samples) | Stage loop: driving gothic chiptune, 145 BPM, D minor; 8th-note square bass ostinato, square lead, saw arpeggios, noise drums; 32 bars (512 rows) | #129 | final |

<!-- audio:end -->
