# Roadmap

Each row is one GitHub issue, and the issue is the source of truth for scope and implementation plan. Work an issue with the `issue-start` skill and finish it with `issue-finish`. Items are listed in dependency order; an issue stays `status:blocked` until everything in its "Depends on" column is merged.

| ID                                              | Issue | Title                                                                  | Depends on     | Priority |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------- | -------------- | -------- |
| **Phase 0: foundation**                         |       |                                                                        |                |          |
| W1                                              | #32   | Make the repo and issues ready for any Claude Code contributor         | #30 (merged)   | high     |
| W2                                              | #44   | Turn problems found during implementation into follow-up issues (done) | —              | high     |
| W3                                              | #54   | Document Codex workflow and Claude skill adapters                      | —              | medium   |
| SEC1                                            | #58   | Resolve minimatch advisory in the lint dependency chain                | upstream patch | medium   |
| F1                                              | #1    | Set up the pnpm monorepo with lint, format, tests and CI               | —              | high     |
| F2                                              | #2    | Boot ThorVG in a game worker on an OffscreenCanvas                     | F1             | high     |
| V1                                              | #31   | Create the verify-game skill and Playwright harness                    | F2             | high     |
| V2                                              | #72   | Wait for the owned browser CDP endpoint to become ready                | #52            | high     |
| F3                                              | #3    | Load art through the asset manifest with placeholder assets            | F2, V1         | high     |
| F4                                              | #4    | Run the server in Docker with docker compose                           | F1             | high     |
| F5                                              | #46   | Bundle a HUD font subset with the missing ASCII glyphs                 | F2             | high     |
| F6                                              | #48   | Serve a favicon so runs log no 404                                     | F2             | low      |
| A1                                              | #5    | Create the starter vector asset pack from the asset catalog            | F3             | high     |
| A2                                              | #76   | Rebuild drawable art with sprite-gen and cached image Lottie           | F3, A1, C1     | high     |
| A3                                              | #84   | Animate all actors and effects with native Lottie playback             | A2             | high     |
| **Phase 1: core loop (playable single player)** |       |                                                                        |                |          |
| C1                                              | #6    | Add entity storage, a spatial grid and paint pools                     | F3, V1         | high     |
| C2                                              | #7    | Move the player with keyboard input and a following camera             | C1, V1, A1     | high     |
| C3                                              | #8    | Spawn enemies from a wave table and chase the player                   | C2             | high     |
| C4                                              | #9    | Add player HP, contact damage, death and the screen flow               | C3, F5         | high     |
| C5                                              | #10   | Add the weapon system with Whip and Magic Wand                         | C3, C4         | high     |
| C6                                              | #11   | Add experience gems, magnet pickup and the level-up choice             | C4, C5         | high     |
| **Phase 2: content**                            |       |                                                                        |                |          |
| G1                                              | #12   | Add passive items and the player stat system                           | C6             | high     |
| G2                                              | #13   | Add the remaining six weapons                                          | G1             | medium   |
| G3                                              | #14   | Add three characters and character select                              | G2             | medium   |
| G4                                              | #15   | Add bosses, elites, treasure chests and evolutions                     | G2, V1         | high     |
| G5                                              | #16   | Add light sources and pickups                                          | C6, G1, G2, V1 | medium   |
| G6                                              | #17   | Finish the stage: wave table, 15-minute limit and Death                | G3, G4, G5, V1 | medium   |
| **Phase 3: multiplayer**                        |       |                                                                        |                |          |
| M1                                              | #18   | Define the protocol and build the WebSocket room server                | F4, V1         | high     |
| M2                                              | #19   | Add the lobby: nickname, room codes and ready check                    | C4, G3, M1     | high     |
| M3                                              | #20   | Run versus matches: status relay, opponent panel and result            | G6, M2         | high     |
| M4                                              | #21   | Add interference items for multiplayer                                 | M3             | high     |
| M5                                              | #114  | Stream each player's world view to the opponent through the server     | M3, M4         | high     |
| M6                                              | #115  | Show both versus worlds side by side in split panes                    | M5             | high     |
| **Phase 4: release**                            |       |                                                                        |                |          |
| R1                                              | #22   | Measure performance and set entity caps                                | G6, V1         | medium   |
| R2                                              | #23   | Deploy the client and the server                                       | M3             | medium   |
| R3                                              | #47   | Stop emitting a duplicate ThorVG WASM file in builds                   | F2             | low      |
| R4                                              | #126  | Play the Powered by ThorVG splash while the assets load                | —              | medium   |
| R5                                              | #128  | Synthesize the game's sound effects and music as audio assets          | R4             | medium   |
| R6                                              | #129  | Play sound effects and music with volume and mute settings             | R5             | medium   |
| R7                                              | #143  | Save single-player personal records in the browser                     | R6             | medium   |
| R8                                              | #156  | Show owned items and spawn chest carriers every minute                 | G1, G4, G6     | medium   |
| R9                                              | #157  | Move player attack origins from feet to torso                          | C5, G2, A3     | medium   |

## Assets

`assets/CATALOG.md` lists every asset ID with its status. A1 supplied the original placeholder pack; A2 (#76) rebuilds its81 drawable entries with generated pixel art and adds Aurelia player/portrait artwork. The resulting84 IDs retain logical sizes/anchors, cached rendering and the protected font. The user-selected art roster is male Warden/Ember and female elf Swift/paladin Aurelia. G3 (#14, original three-character title) implements all four approved characters and selection/stats; #76 supplied artwork without inventing stats. A3 (#84) adds native idle/locomotion for13 actors and visual cycles for16 weapons,6 effects and1 brazier (36 existing IDs), preserving the 84 artwork IDs, 47 static PNGs and licensed font. The #22 diagnostic shape composition remains available, for a total of 85 catalog IDs. #76 supplies the artwork and original two native effects; it does not implement the new motion inventory. Later content issues add catalog rows first and update the current recipe/resource ledger when changing the closed inventory.

## Parallel tracks

W1 (#32) has no open dependency and goes first. After F1, the server track (F4) can proceed alongside F2. After F2, V1 (`verify-game`) is on the critical path: F3, C1, C2, G4, G5, G6, M1 and R1 all wait for it, so M1 cannot start before V1 even though the rest of the server track is independent of the client. A1 can be worked alongside C1 once F3 has merged, and C2 waits for both. C3 → C4 → C5 → C6 is sequential, because C5 builds on C4's event queue and screen flow. After G2, G3 and G4 can be worked in parallel, and so can G5 (it also needs G1). G6 waits for G3, G4 and G5; M2 waits for G3 and M1. Once G6 has merged, R1 can proceed alongside the multiplayer track (M2 → M3), and after M3, M4 and R2 can be worked in parallel.

## Verification follow-ups

| Issue | Work                                                                                          | Depends on | Priority |
| ----- | --------------------------------------------------------------------------------------------- | ---------- | -------- |
| #112  | Isolate the weapon build used by strict Garlic ring verification; keep tick/radius assertions | #84        | low      |
