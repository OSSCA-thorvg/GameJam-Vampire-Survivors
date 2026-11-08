# Gameplay reference: how the original plays

The goal is to feel like Vampire Survivors (REQUIREMENTS 1). Before implementing or tuning a gameplay feature:

1. Read the matching section below.
2. Watch the original in motion (see the video section) and compare: speed, density, timing, feedback.
3. If text and footage disagree, footage wins. Record the observation in this file in the same PR, with the source and a timestamp.

Each fact is tagged with where it came from. **[unverified]** marks common knowledge that has not been checked against a source yet. Verify it before relying on it, then replace the tag.

## Video references

Watch these, and add better ones with what to look for:

| Source                                                                                                  | What to watch for                                                          |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Steam store page](https://store.steampowered.com/app/1794680/Vampire_Survivors/) (trailers at the top) | Overall pacing, screen density in late game, level-up screen flow          |
| [Official Local Co-op Trailer](https://www.dailymotion.com/video/x8nbkwd)                               | How two players and their effects read on one screen                       |
| [Console launch trailer](https://www.gamepressure.com/games/movie.asp?ID=45426)                         | Weapon visuals and evolutions                                              |
| Long, unedited single-player runs on YouTube (search "Vampire Survivors full run no commentary")        | Minute-by-minute wave growth, boss timing, chest opening, gem magnet range |

Things to measure from footage and write down here: player move speed (screen widths per second), the minute enemies first fill the screen, the knockback distance on hit, how long the level-up choice takes, and when the first chest appears.

### Readability at game speed (art, #5)

- **Observed in this game** (source: the `?gallery` speed preview, 30 instances per mass ID drifting at 100 units/s over tiled `stage.ground`, issue #5 verification, 2026-11-08): the six enemies separate by silhouette first and color second: the bat by its wide wings, the ghoul by its hunched green bulk, the skeleton by a tall thin grey frame with a white skull, the wisp by a pale-blue teardrop, the brute by its large horned brown block, the wraith by a tall dark-purple banded column. The three gems share one diamond shape and separate only by color (blue, green, red, the red one slightly larger); that is enough at this speed. Size steps (32 → 40 → 56 → 64) make the heavier enemies read as heavier.
- **How the original does it** (to check against the Steam store trailers and a long unedited run listed above, with timestamps): enemy types differ mostly by silhouette and size rather than by color, gem tiers by color on a shared shape, and pickups by a distinct shape. **[unverified]**: written while drawing the starter pack, without watching footage; replace the tag with the source and timestamp once checked, and tune `PREVIEW_SPEED` in `packages/client/src/worker/debug/gallery.ts` against the measured player speed.

## Core loop

- The player only moves. Weapons fire automatically on their own cooldowns. **[unverified]**
- Movement: eight directions at one constant speed, diagonals as fast as straight moves, the camera keeping the player exactly centred over an endless field. **[unverified]**
- Move speed: this game uses `BASE_MOVE_SPEED = 140` world units per second, 0.109 view widths per second (1280-unit view), measured in the running game by the #7 movement journey (140.0 units per held second, straight and diagonal, 2026-11-08). The original's speed in view widths per second has **not been measured from footage yet** **[unverified]**: in #7 no footage could be watched, so 140 is the issue's initial value, untuned. To measure: in a long unedited run (Video references), time how long the character takes to walk from one screen edge to the other with no MoveSpeed bonus (Antonio, early minutes), record source and timestamp here, and set `BASE_MOVE_SPEED` to 1280 × (view widths per second).
- Contact damage and invulnerability: enemies hurt the player by touching it, and after a hit the player cannot be hit again for a short window, so a crowd does not drain HP every frame. **[unverified]** This game (#9) uses `HIT_INVULN_SEC = 0.5` s, one hit per window from the strongest touching enemy (`max(1, contactDamage - armor)`), `BASE_MAX_HP = 100` and `PLAYER_RADIUS = 14`; measured in the running game by the `player-health.md` journey (drops of 5 and 10 HP, 0.50 s of simulated time apart, 2026-11-08). These are the issue's initial values, **untuned**: no footage could be watched in #9 and the project owner deferred tuning against footage. To measure: in a long unedited run (Video references), step through frames where a crowd touches the character and time the gap between consecutive HP-bar drops; record source and timestamp here.
- Damage feedback: in this game the player sprite blinks while invulnerable (opacity 255 and 100, alternating every 0.08 s), and the HP bar sits under the character's feet in world space, its red fill shrinking with HP. **[unverified]** against footage (#9, same reason); check whether the original flashes, tints or blinks the sprite and how fast, and where its HP bar sits.
- Killing enemies drops experience gems. Collecting them fills the XP bar, and each level-up offers a choice of new or upgraded weapons and passives. **[unverified]**
- A run lasts until the time limit or death. ADR 0005 sets 15 minutes for this game; the original uses 30. **[Wikipedia]**

## Enemies and waves

- Enemies generally spawn just outside the screen and can despawn if the player moves far enough away. **[Fandom wiki: Enemies]**
- Bosses do not despawn when the player moves away; they are teleported back onto the screen. **[Fandom wiki: Enemies]**
- Waves normally change about once per minute, and each stage has its own wave table. **[vampire.survivors.wiki: Boss]**
- At the time limit, the stage is cleared and a very strong final enemy ("Death") appears. **[Wikipedia]**
- One wiki source mentions a hard cap of about 500 enemies alive. This game's caps are in ADR 0007. **[Fandom wiki; low confidence]**

### On-screen counts and this game's wave table (#8)

- **Not yet measured from footage.** The issue asks for the number of enemies on screen at minutes 1, 5 and 10 of the original, from footage with a source and timestamp. The session that implemented #8 could not watch video, and the project owner decided not to tune against footage for now, so these counts are **[unverified]**: measure them from a long unedited run (video section above) and record minute, count, source and timestamp here.
- **This game, untuned initial values** (`packages/shared/src/content/stage.ts`, #8): `minAlive` is 15 at minute 0, 25 at minute 1, 100 at minute 5, 240 at minute 10 and 300 at minute 14, with a batch of 3 to 20 every 2.0 to 0.5 s; bats only until minute 3, then bats and ghouls 3:1, then 1:1 from minute 6. Enemies spawn on the view's perimeter expanded by 64 units and are relocated ahead of the player beyond 1360 units.
- **Observed in this game** (source: `verify-game` `features/enemies.md`, issue #8 verification, 2026-11-08): with nothing killing enemies yet, standing still for 60 s gathers about 100 bats in a disc of about 150 units around the player, and the count reaches the 400 cap by minute 5 of fast-forwarded time. Compare with footage once #10 kills enemies, because the live count then depends on the kill rate.

## Weapons

- **Not yet checked against footage.** The issue (#10) asks for the Whip's alternating sides and the Magic Wand's targeting from footage with a source and timestamp. The session that implemented #10 could not watch video, and the project owner decided not to tune against footage for now, so both are **[unverified]**: in a long unedited run (Video references), step through the first minute with Antonio (Whip) and Imelda (Magic Wand), and record source, timestamp and what you see here; adjust `packages/shared/src/content/weapons.ts` if it differs.
  - Whip: whether the first strike goes to the facing side and the second (from level 2, about 0.1 s later) to the other side, whether it strikes behind when the character turns, and the strike's length and height relative to the screen. **[unverified]**
  - Magic Wand: whether each bolt flies at the nearest enemy (and what it does when none is on screen), how many bolts per volley at each level, and the bolt speed in screen widths per second. **[unverified]**
  - Hit feedback: the original shows damage numbers (out of scope here) and a short flash and knockback on hit. **[unverified]**
- **This game, untuned initial values** (`weapons.ts`, #10): Whip damage 10 → 40 over levels 1–8, cooldown 1.35 s, box 160 × 40 units (× area 1 → 1.2) from the player toward `facingX`, a second strike on the opposite side 0.1 s later from level 2, knockback 200 units/s for 0.12 s; Magic Wand damage 10 → 30, cooldown 1.2 → 1.0 s, 1 → 4 bolts 0.1 s apart at 400 units/s for 2 s, pierce 1 → 2, aimed at the nearest enemy within 900 units or along the last movement direction. Enemies flash (opacity 140) for 0.1 s per hit.
- **Observed in this game** (source: `verify-game` `features/weapons.md`, issue #10 verification, 2026-11-08): standing still at minute 0 the L1 Whip kills every bat in its box per strike (28 kills by death at 15.5 s); with L1 damage set to 1, bats in the box are pushed about 23 units back per strike and die on the fifth; Magic Wand bolts reach a bat about 100 units away in about 0.25 s and kill it.

## Experience gems

- Gems come in blue (1 XP), green (5 XP) and red (10+ XP); stronger enemies drop higher tiers. **[Namu Wiki §7.1]**
- When too many gems are on the ground, their value is folded into a single red gem. That is why a player sometimes gains several levels from one gem. **[Namu Wiki §7.1]**
- **Not yet checked against footage:** the magnet radius, how fast gems fly in, and the on-ground limit before merging. The session that implemented #11 could not watch video and the project owner decided not to tune against footage for now. **[unverified]**
- **This game, untuned initial values** (`packages/shared/src/content/constants.ts`, #11): a gem's tier comes from its value (blue under 5, green under 10, red otherwise); gems within 60 units (`BASE_PICKUP_RANGE`, × the magnet stat from #12) start flying at 150 units/s, accelerate by 600 units/s² toward the player and are collected within 14 units; idle gems never despawn; at most 400 normal gems (`GEM_CAP`) lie on the ground, and every further drop adds its value to one red merge gem.
- **Observed in this game** (source: `verify-game` `features/xp-gems.md`, issue #11 verification, 2026-11-08): standing still at minute 0, bats killed by the Whip close to the player are pulled in at once and the first level-up comes after about 7–8 s; gems of bats killed farther out (100–170 units) stay where they died until the player walks within 60 units.

## Pickups kept in this game

Source: Namu Wiki item page §7.3, plus this game's rules in ADR 0008.

| Pickup        | Effect in the original                   |
| ------------- | ---------------------------------------- |
| Floor Chicken | Restores 30 HP                           |
| Rosary        | Destroys all enemies on screen           |
| Orologion     | Freezes all enemies for 10 seconds       |
| Vacuum        | Pulls every gem on the map to the player |
| Little Clover | +10% luck                                |

Pickups come from breakable light sources (braziers and candles) on the map. Higher luck raises the drop chance. **[Namu Wiki §6, §7.3]**

## Treasure chests

- Bosses drop chests. Chests grant upgrades to items the player already owns. **[Namu Wiki §7.4]**
- A chest usually gives 1 reward, rarely 3, and more rarely 5. **[Namu Wiki §7.4]**
- Some chests carry an evolution chance. **[Namu Wiki §7.4]**
- In this game chests never give gold (ADR 0008).

## Level-up and evolution rules

- Up to 6 weapons and 6 passives. **[unverified]**
- Each level-up offers 3 or 4 unique options of weapons and passives; the fourth depends on Luck. **[vampire.survivors.wiki: Level up]** This game offers 3 (`LEVELUP_CHOICES`, #11); #12 adds the fourth with luck.
- XP curve: 5 XP to reach level 2, then the requirement grows by 10 per level up to level 20, by 13 per level from 21 to 40 and by 16 per level after that; at levels 20 and 40 an extra 600 and 2400 XP are required, with +100% Growth until the next level. **[vampire.survivors.wiki: Level up]** This game's `xpToNext` (`packages/shared/src/content/xp.ts`, #11) uses the per-level increments but not the extra 600/2400 XP or the Growth bonus, so the curve keeps its **[unverified]** tag: the owner deferred tuning, and footage has not been checked.
- With nothing left to upgrade, the original offers Gold or Floor Chicken. **[vampire.survivors.wiki: Level up]** This game has no gold (ADR 0008, REQUIREMENTS #8, #9) and offers a single heal of 30 HP (`LEVELUP_HEAL`, untuned) instead.
- Weapons reach max level at 8. **[unverified]**
- An evolution happens when a chest is opened while a max-level weapon and its paired passive are both owned. **[unverified]**
- **Observed in this game** (source: `verify-game` `features/level-up.md`, issue #11 verification, 2026-11-08): the dialog freezes `timeS` and every enemy until a card is chosen, Escape does nothing, and play resumes at the same `timeS`; with the Whip and the Magic Wand at level 8 (16 level-ups through the `L` key) the only card is the heal.

## Multiplayer in the original (context only)

Local co-op arrived in version 1.6 (August 2023), for up to 4 players, without split screen. This game deliberately differs: separate worlds and interference items (ADR 0005). **[news coverage, 2023]**

## Sources

- Namu Wiki, [Vampire Survivors/아이템](https://namu.wiki/w/Vampire%20Survivors/%EC%95%84%EC%9D%B4%ED%85%9C), §6–§9
- [Vampire Survivors Wiki (Fandom): Enemies](https://vampire-survivors.fandom.com/wiki/Enemies)
- [vampire.survivors.wiki: Boss](https://vampire.survivors.wiki/w/Boss)
- [vampire.survivors.wiki: Level up](https://vampire.survivors.wiki/w/Level_up), read 2026-11-08 (#11)
- [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
