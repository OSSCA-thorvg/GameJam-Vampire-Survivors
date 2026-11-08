# Asset catalog

Every piece of art the game uses, by logical ID (ADR 0007). Code and content data refer only to these IDs, and `manifest.json` maps them to files. The categories mirror what Vampire Survivors puts on screen; the **Original role** column says what each asset stands in for, so the art can be judged against footage of the original (`docs/reference/gameplay.md`). Do not copy the original's art. Every file here must be original or properly licensed.

## How to use this list

- **Adding an asset:** add a row here first, with status `needed`, in the PR that introduces the content using it. Then add the file under the folder shown and its `manifest.json` entry, and set the status to `placeholder` or `final`. An ID must not be used in code or data before it has a row here.
- **Replacing art:** drop in the new file at the same path, or point the manifest entry to a new file, and set the status to `final`. No code changes.
- **Status values:**
  - `needed`: no file yet; the game shows the magenta placeholder.
  - `placeholder`: rough art made to keep the game playable.
  - `final`: art the team is happy with.
- **Budget (ADR 0007):** rows marked **mass** appear in large numbers. Their SVGs must stay within 4 paths, with no strokes and no gradients. Other rows are free, though Lottie stays reserved for a few on-screen instances.
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
| `player.warden` | 48×48 | svg (lottie later) | Sturdy whip starter (Antonio's role) | C2, G3 | placeholder |
| `player.ember` | 48×48 | svg (lottie later) | Fire-wand glass cannon | G3 | placeholder |
| `player.swift` | 48×48 | svg (lottie later) | Fast knife starter | G3 | placeholder |
| `portrait.warden` | 128×128 | svg | Character-select portrait | G3 | placeholder |
| `portrait.ember` | 128×128 | svg | Character-select portrait | G3 | placeholder |
| `portrait.swift` | 128×128 | svg | Character-select portrait | G3 | placeholder |

## Enemies — `assets/enemies/`

Elites reuse their base enemy's art at 1.5× scale with a tint applied in code, so they have no separate rows.

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `enemy.bat` | 32×32 | svg, **mass** | Fast, fragile swarm (bats) | C3, G6 | placeholder |
| `enemy.ghoul` | 36×40 | svg, **mass** | Slow early walker (zombies) | C3, G6 | placeholder |
| `enemy.skeleton` | 36×44 | svg, **mass** | Mid-tier walker (skeletons) | G6 | placeholder |
| `enemy.wisp` | 32×32 | svg, **mass** | Fast flier (ghosts) | G6 | placeholder |
| `enemy.brute` | 56×56 | svg, **mass** | Tanky mid-game (werewolves, mudmen) | G6 | placeholder |
| `enemy.wraith` | 64×64 | svg, **mass** | Late-game heavy (giant mummies) | G6 | placeholder |

## Bosses — `assets/bosses/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `boss.reaper5` | 96×96 | svg | 5-minute boss that drops a chest | G4, G6 | placeholder |
| `boss.reaper10` | 112×112 | svg | 10-minute boss that drops a chest | G4, G6 | placeholder |
| `boss.death` | 128×128 | svg | Death at the time limit | G6 | placeholder |

## Weapons, in world — `assets/weapons/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `weapon.whip` | 160×40 | svg | Horizontal slash arc | C5 | placeholder |
| `weapon.magicWand` | 12×12 | svg, **mass** | Homing magic bolt | C5 | placeholder |
| `weapon.knife` | 20×6 | svg, **mass** | Thrown knife | G2 | placeholder |
| `weapon.axe` | 28×28 | svg, **mass** | Spinning thrown axe | G2 | placeholder |
| `weapon.cross` | 28×28 | svg, **mass** | Boomerang cross | G2 | placeholder |
| `weapon.kingBible` | 24×28 | svg | Orbiting book | G2 | placeholder |
| `weapon.fireWand` | 20×20 | svg, **mass** | Fireball | G2 | placeholder |
| `weapon.garlic` | 100×100 | svg | Translucent aura circle | G2 | placeholder |
| `weapon.bloodyTear` | 180×44 | svg | Evolved whip arc | G4 | placeholder |
| `weapon.holyWand` | 14×14 | svg, **mass** | Evolved wand bolt | G4 | placeholder |
| `weapon.thousandEdge` | 22×6 | svg, **mass** | Evolved knife stream | G4 | placeholder |
| `weapon.deathSpiral` | 36×36 | svg, **mass** | Evolved scythe | G4 | placeholder |
| `weapon.heavenSword` | 32×32 | svg, **mass** | Evolved cross | G4 | placeholder |
| `weapon.unholyVespers` | 26×30 | svg | Evolved permanent books | G4 | placeholder |
| `weapon.hellfire` | 40×40 | svg | Evolved giant fireball | G4 | placeholder |
| `weapon.soulEater` | 140×140 | svg | Evolved aura | G4 | placeholder |

## Icons — `assets/icons/`

Used by the level-up choice, the character select screen and the HUD inventory. Each is 32×32 SVG.

| ID | Original role | Used by | Status |
|---|---|---|---|
| `icon.weapon.whip`, `icon.weapon.magicWand` | Weapon icons | C6 | placeholder |
| `icon.weapon.knife`, `icon.weapon.axe`, `icon.weapon.cross`, `icon.weapon.kingBible`, `icon.weapon.fireWand`, `icon.weapon.garlic` | Weapon icons | G2 | placeholder |
| `icon.weapon.bloodyTear`, `icon.weapon.holyWand`, `icon.weapon.thousandEdge`, `icon.weapon.deathSpiral`, `icon.weapon.heavenSword`, `icon.weapon.unholyVespers`, `icon.weapon.hellfire`, `icon.weapon.soulEater` | Evolved weapon icons | G4 | placeholder |
| `icon.passive.hollowHeart`, `icon.passive.emptyTome`, `icon.passive.bracer`, `icon.passive.candelabrador`, `icon.passive.clover`, `icon.passive.spellbinder`, `icon.passive.spinach`, `icon.passive.pummarola` | Passive icons | G1 | placeholder |

## Drops and pickups — `assets/pickups/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `gem.blue` | 12×16 | svg, **mass** | 1 XP gem | C6 | placeholder |
| `gem.green` | 12×16 | svg, **mass** | 5 XP gem | C6 | placeholder |
| `gem.red` | 14×18 | svg, **mass** | 10+ XP gem, and the merged gem | C6 | placeholder |
| `pickup.floorChicken` | 24×24 | svg | Heal 30 | G5 | placeholder |
| `pickup.rosary` | 24×24 | svg | Clear the screen | G5 | placeholder |
| `pickup.orologion` | 24×24 | svg | Freeze all enemies | G5 | placeholder |
| `pickup.vacuum` | 24×24 | svg | Collect all gems | G5 | placeholder |
| `pickup.littleClover` | 24×24 | svg | +Luck | G5 | placeholder |
| `pickup.chest` | 32×28 | svg | Treasure chest | G4 | placeholder |
| `pickup.interference.swarm` | 28×28 | svg | Multiplayer only: send a swarm | M4 | placeholder |
| `pickup.interference.gemThief` | 28×28 | svg | Multiplayer only: wipe the opponent's gems | M4 | placeholder |
| `pickup.interference.eliteCall` | 28×28 | svg | Multiplayer only: send an elite | M4 | placeholder |

## Stage — `assets/stage/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `stage.ground` | 128×128 | svg | Tiled ground of the single forest-like stage | C2 | placeholder |
| `stage.brazier` | 24×40 | svg | Breakable light source that drops pickups | G5 | placeholder |
| `stage.brazierBroken` | 24×20 | svg | Remains after it breaks | G5 | placeholder |

## Effects — `assets/fx/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `fx.hit` | 24×24 | svg | Flash on a damaged enemy | C5 | placeholder |
| `fx.enemyDeath` | 32×32 | svg | Puff when an enemy dies | C5 | placeholder |
| `fx.levelUp` | 96×96 | lottie | Ring burst on level-up (proves the Lottie path) | F3, C6 | placeholder |
| `fx.chestOpen` | 128×128 | lottie | Chest opening burst | G4 | placeholder |
| `fx.freeze` | 64×64 | svg | Frost overlay while Orologion is active | G5 | placeholder |
| `fx.warning` | 48×48 | svg | Incoming-interference warning | M4 | placeholder |

## UI drawn by ThorVG (the HUD) — `assets/ui/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `ui.placeholder` | 64×64 | svg | Magenta "missing asset" reference | F3 | placeholder |
| `ui.xpBar` | 400×12 | svg | XP bar frame along the top | C6 | placeholder |
| `ui.hpBar` | 40×6 | svg | HP bar under the player | C4 | placeholder |
| `ui.skull` | 16×16 | svg | Kill counter icon | C4 | placeholder |

## Fonts drawn by ThorVG — `assets/fonts/`

Licensed, not original: each font keeps its license and source record next to it. Korean text stays in the DOM (ADR 0009), so ThorVG fonts carry printable ASCII only.

| ID | File | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `font.hud` | `fonts/hud.ttf` | ttf | HUD text: timer `MM:SS`, counters, perf overlay. Noto Sans Mono Regular, `U+0020`–`U+007E`, 9400 bytes, OFL 1.1 (`fonts/LICENSE-NotoSansMono.txt`, ADR 0013). Loaded through manifest asset `font.hud` (#3) | #9, #17, #20 | final |

## Browser UI — `assets/ui/`

| ID | Size | Format | Original role | Used by | Status |
|---|---|---|---|---|---|
| `ui.favicon` | 32×32 | svg | Original red gem browser-tab icon (`ui/favicon.svg`) | Client HTML | placeholder |
