# 0008. Data-driven game content and the content scope

- Status: Accepted; art roster scope extended by [0016](0016-generate-raster-art-with-cached-image-lottie.md); the character roster amended to 4 by #14; partly superseded by [0022](0022-keep-personal-records-in-local-storage.md) (the "persistent save" exclusion now covers run progress and unlocks, not read-only personal records)
- Date: 2026-11-07

## Context

- REQUIREMENTS 1: keep the core Vampire Survivors loop. REQUIREMENTS 4: no unlock system. REQUIREMENTS 5: about 3 characters with different stats. REQUIREMENTS 6: one stage.
- REQUIREMENTS 7–9: start from the drop items in section 7 of the Namu Wiki item page (experience gems, gold, pickups, treasure chests), remove gold, and remove everything tied to unlocks.
- The original game has dozens of weapons. The requester chose 8 weapons with their evolutions on 2026-11-07.

## Decision

**Content is data.** Characters, weapons, passives, evolutions, enemies, the wave table, pickups and interference items are typed data in `packages/shared/src/content/`. Game systems interpret that data, so adding a weapon level or an enemy means editing data. Each weapon's behaviour pattern (whip arc, homing projectile, orbit, aura, and so on) is code, selected by the weapon's `pattern` field.

**Scope**

| Category                             | Included                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weapons (8), each with its evolution | Whip → Bloody Tear, Magic Wand → Holy Wand, Knife → Thousand Edge, Axe → Death Spiral, Cross → Heaven Sword, King Bible → Unholy Vespers, Fire Wand → Hellfire, Garlic → Soul Eater                                                                                                                          |
| Passives (8)                         | Hollow Heart, Empty Tome, Bracer, Candelabrador, Clover, Spellbinder, Spinach, Pummarola. Each is the evolution partner of one weapon.                                                                                                                                                                       |
| Characters (4)                       | Each starts with a different weapon and has different base stats. Names and numbers are defined in the character issue. Amended by #14: the user-requested fourth character Aurelia (art in [0016](0016-generate-raster-art-with-cached-image-lottie.md), the #76 comments on #14) joins the original three. |
| Stage (1)                            | One endless forest-like field with a wave table, timed bosses and breakable light sources                                                                                                                                                                                                                    |
| Experience gems                      | Blue/green/red values; gems merge when too many are on the ground                                                                                                                                                                                                                                            |
| Pickups                              | Floor Chicken (heal), Rosary (clear screen), Orologion (freeze), Vacuum (collect all gems), Little Clover (+luck)                                                                                                                                                                                            |
| Treasure chests                      | Dropped by bosses and elites; grant a weapon/passive level or an evolution, never gold                                                                                                                                                                                                                       |
| Interference items                   | Multiplayer only (ADR 0005): Swarm, Gem Thief, Elite Call                                                                                                                                                                                                                                                    |

**Level-up rules** (to verify against `docs/reference/gameplay.md` before implementing): up to 6 weapons and 6 passives, 3 or 4 choices per level-up, weapons max at level 8, and an evolution is offered by a chest once the weapon is at max level, its passive is owned, and the run time is at least 5:00. The original game uses 10:00; it was shortened for the 15-minute run on 2026-11-07, and lives in a content constant.

**Excluded:** gold and coin bags, Gold Finger and other gold effects, relics, the merchant and shops, coffins and character unlocks, arcanas, Limit Break, achievements and the collection, DLC items, and a persistent save. Nothing is persisted between runs.

## Alternatives considered

- **4 weapons** — faster, but too little build variety for the core loop.
- **All base-game weapons** — exceeds a jam schedule.

## Consequences

- Balancing is data editing, and content can be unit-tested without rendering.
- Original item names are kept as internal IDs for traceability to the reference. Display names can be changed in data.
