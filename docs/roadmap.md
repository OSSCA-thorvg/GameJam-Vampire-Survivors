# Roadmap

Each row is one GitHub issue, and the issue is the source of truth for scope and implementation plan. Work an issue with the `issue-start` skill and finish it with `issue-finish`. Items are listed in dependency order; an issue stays `status:blocked` until everything in its "Depends on" column is merged.

| ID | Issue | Title | Depends on | Priority |
|---|---|---|---|---|
| **Phase 0: foundation** |||||
| F1 | #1 | Set up the pnpm monorepo with lint, format, tests and CI | — | high |
| F2 | #2 | Boot ThorVG in a game worker on an OffscreenCanvas | F1 | high |
| F3 | #3 | Load art through the asset manifest with placeholder assets | F2 | high |
| F4 | #4 | Run the server in Docker with docker compose | F1 | high |
| A1 | #5 | Create the starter vector asset pack from the asset catalog | F3 | high |
| **Phase 1: core loop (playable single player)** |||||
| C1 | #6 | Add entity storage, a spatial grid and paint pools | F3 | high |
| C2 | #7 | Move the player with keyboard input and a following camera | C1 | high |
| C3 | #8 | Spawn enemies from a wave table and chase the player | C2 | high |
| C4 | #9 | Add player HP, contact damage, death and the screen flow | C3 | high |
| C5 | #10 | Add the weapon system with Whip and Magic Wand | C3 | high |
| C6 | #11 | Add experience gems, magnet pickup and the level-up choice | C4, C5 | high |
| **Phase 2: content** |||||
| G1 | #12 | Add passive items and the player stat system | C6 | high |
| G2 | #13 | Add the remaining six weapons | G1 | medium |
| G3 | #14 | Add three characters and character select | G2 | medium |
| G4 | #15 | Add bosses, elites, treasure chests and evolutions | G2 | high |
| G5 | #16 | Add light sources and pickups | C6 | medium |
| G6 | #17 | Finish the stage: wave table, 15-minute limit and Death | G4, G5 | medium |
| **Phase 3: multiplayer** |||||
| M1 | #18 | Define the protocol and build the WebSocket room server | F4 | high |
| M2 | #19 | Add the lobby: nickname, room codes and ready check | M1, C4 | high |
| M3 | #20 | Run versus matches: status relay, opponent panel and result | M2, G6 | high |
| M4 | #21 | Add interference items for multiplayer | M3 | high |
| **Phase 4: release** |||||
| R1 | #22 | Measure performance and set entity caps | G6 | medium |
| R2 | #23 | Deploy the client and the server | M3 | medium |

## Assets

`assets/CATALOG.md` lists every asset ID with its status. A1 produces rough placeholder art for all of them; later content issues add rows to the catalog first, and final art replaces files without code changes.

## Parallel tracks

After F1, the server track (F4 → M1) can proceed alongside the client track (F2 → … → G6). C4 and C5 can be worked in parallel after C3. So can G3, G4 and G5 once their dependencies are merged.
