# Roadmap

Each row is one GitHub issue, and the issue is the source of truth for scope and implementation plan. Work an issue with the `issue-start` skill and finish it with `issue-finish`. Items are listed in dependency order; an issue stays `status:blocked` until everything in its "Depends on" column is merged.

| ID                                              | Issue | Title                                                                  | Depends on     | Priority |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------- | -------------- | -------- |
| **Phase 0: foundation**                         |       |                                                                        |                |          |
| W1                                              | #32   | Make the repo and issues ready for any Claude Code contributor         | #30 (merged)   | high     |
| W2                                              | #44   | Turn problems found during implementation into follow-up issues (done) | —              | high     |
| F1                                              | #1    | Set up the pnpm monorepo with lint, format, tests and CI               | —              | high     |
| F2                                              | #2    | Boot ThorVG in a game worker on an OffscreenCanvas                     | F1             | high     |
| V1                                              | #31   | Create the verify-game skill and Playwright harness                    | F2             | high     |
| F3                                              | #3    | Load art through the asset manifest with placeholder assets            | F2, V1         | high     |
| F4                                              | #4    | Run the server in Docker with docker compose                           | F1             | high     |
| F5                                              | #46   | Bundle a HUD font subset with the missing ASCII glyphs                 | F2             | high     |
| F6                                              | #48   | Serve a favicon so runs log no 404                                     | F2             | low      |
| A1                                              | #5    | Create the starter vector asset pack from the asset catalog            | F3             | high     |
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
| **Phase 4: release**                            |       |                                                                        |                |          |
| R1                                              | #22   | Measure performance and set entity caps                                | G6, V1         | medium   |
| R2                                              | #23   | Deploy the client and the server                                       | M3             | medium   |
| R3                                              | #47   | Stop emitting a duplicate ThorVG WASM file in builds                   | F2             | low      |

## Assets

`assets/CATALOG.md` lists every asset ID with its status. A1 produces rough placeholder art for all of them; later content issues add rows to the catalog first, and final art replaces files without code changes.

## Parallel tracks

W1 (#32) has no open dependency and goes first. After F1, the server track (F4) can proceed alongside F2. After F2, V1 (`verify-game`) is on the critical path: F3, C1, C2, G4, G5, G6, M1 and R1 all wait for it, so M1 cannot start before V1 even though the rest of the server track is independent of the client. A1 can be worked alongside C1 once F3 has merged, and C2 waits for both. C3 → C4 → C5 → C6 is sequential, because C5 builds on C4's event queue and screen flow. After G2, G3 and G4 can be worked in parallel, and so can G5 (it also needs G1). G6 waits for G3, G4 and G5; M2 waits for G3 and M1. Once G6 has merged, R1 can proceed alongside the multiplayer track (M2 → M3), and after M3, M4 and R2 can be worked in parallel.
