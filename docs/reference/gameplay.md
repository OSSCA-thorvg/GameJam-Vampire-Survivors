# Gameplay reference: how the original plays

The goal is to feel like Vampire Survivors (REQUIREMENTS 1). Before implementing or tuning a gameplay feature:

1. Read the matching section below.
2. Watch the original in motion (see the video section) and compare: speed, density, timing, feedback.
3. If text and footage disagree, footage wins. Record the observation in this file in the same PR, with the source and a timestamp.

Each fact is tagged with where it came from. **[unverified]** marks common knowledge that has not been checked against a source yet. Verify it before relying on it, then replace the tag.

## Video references

Watch these, and add better ones with what to look for:

| Source | What to watch for |
|---|---|
| [Steam store page](https://store.steampowered.com/app/1794680/Vampire_Survivors/) (trailers at the top) | Overall pacing, screen density in late game, level-up screen flow |
| [Official Local Co-op Trailer](https://www.dailymotion.com/video/x8nbkwd) | How two players and their effects read on one screen |
| [Console launch trailer](https://www.gamepressure.com/games/movie.asp?ID=45426) | Weapon visuals and evolutions |
| Long, unedited single-player runs on YouTube (search "Vampire Survivors full run no commentary") | Minute-by-minute wave growth, boss timing, chest opening, gem magnet range |

Things to measure from footage and write down here: player move speed (screen widths per second), the minute enemies first fill the screen, the knockback distance on hit, how long the level-up choice takes, and when the first chest appears.

## Core loop

- The player only moves. Weapons fire automatically on their own cooldowns. **[unverified]**
- Killing enemies drops experience gems. Collecting them fills the XP bar, and each level-up offers a choice of new or upgraded weapons and passives. **[unverified]**
- A run lasts until the time limit or death. ADR 0005 sets 15 minutes for this game; the original uses 30. **[Wikipedia]**

## Enemies and waves

- Enemies generally spawn just outside the screen and can despawn if the player moves far enough away. **[Fandom wiki: Enemies]**
- Bosses do not despawn when the player moves away; they are teleported back onto the screen. **[Fandom wiki: Enemies]**
- Waves normally change about once per minute, and each stage has its own wave table. **[vampire.survivors.wiki: Boss]**
- At the time limit, the stage is cleared and a very strong final enemy ("Death") appears. **[Wikipedia]**
- One wiki source mentions a hard cap of about 500 enemies alive. This game's caps are in ADR 0007. **[Fandom wiki; low confidence]**

## Experience gems

- Gems come in blue (1 XP), green (5 XP) and red (10+ XP); stronger enemies drop higher tiers. **[Namu Wiki §7.1]**
- When too many gems are on the ground, their value is folded into a single red gem. That is why a player sometimes gains several levels from one gem. **[Namu Wiki §7.1]**

## Pickups kept in this game

Source: Namu Wiki item page §7.3, plus this game's rules in ADR 0008.

| Pickup | Effect in the original |
|---|---|
| Floor Chicken | Restores 30 HP |
| Rosary | Destroys all enemies on screen |
| Orologion | Freezes all enemies for 10 seconds |
| Vacuum | Pulls every gem on the map to the player |
| Little Clover | +10% luck |

Pickups come from breakable light sources (braziers and candles) on the map. Higher luck raises the drop chance. **[Namu Wiki §6, §7.3]**

## Treasure chests

- Bosses drop chests. Chests grant upgrades to items the player already owns. **[Namu Wiki §7.4]**
- A chest usually gives 1 reward, rarely 3, and more rarely 5. **[Namu Wiki §7.4]**
- Some chests carry an evolution chance. **[Namu Wiki §7.4]**
- In this game chests never give gold (ADR 0008).

## Level-up and evolution rules

All tagged **[unverified]**. Check footage or the wiki before implementing the level-up issue.

- Up to 6 weapons and 6 passives.
- 3 choices per level-up, or 4 with enough luck.
- Weapons reach max level at 8.
- An evolution happens when a chest is opened while a max-level weapon and its paired passive are both owned.

## Multiplayer in the original (context only)

Local co-op arrived in version 1.6 (August 2023), for up to 4 players, without split screen. This game deliberately differs: separate worlds and interference items (ADR 0005). **[news coverage, 2023]**

## Sources

- Namu Wiki, [Vampire Survivors/아이템](https://namu.wiki/w/Vampire%20Survivors/%EC%95%84%EC%9D%B4%ED%85%9C), §6–§9
- [Vampire Survivors Wiki (Fandom): Enemies](https://vampire-survivors.fandom.com/wiki/Enemies)
- [vampire.survivors.wiki: Boss](https://vampire.survivors.wiki/w/Boss)
- [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
