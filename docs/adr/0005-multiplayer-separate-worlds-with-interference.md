# 0005. Multiplayer: each player survives in a separate world, linked by interference items

- Status: Partly superseded by [0018](0018-show-the-opponent-world-from-a-relayed-view-stream.md) (only the "no live view of the opponent's world" line; separate worlds, interference and the win rule retained)
- Date: 2026-11-07

## Context

- REQUIREMENTS 2: two or more players, two at first. REQUIREMENTS 3: single player must also work.
- REQUIREMENTS 7: in multiplayer, drop items that penalize the opponent (add enemies, remove gems, add elites, and similar).
- Sharing one world would require synchronizing hundreds of enemies between browsers. Separate worlds only require exchanging small events. The requester chose separate worlds on 2026-11-07.

## Decision

- Every player runs their own full world locally (ADR 0004). Worlds are never synchronized; only events and status cross the network (ADR 0006).
- Single player is the same game with no network and no interference items.
- Both players use the same stage and the same seed, so they face the same base wave schedule. Interference is what makes the runs diverge.
- **Win rule:** the last player alive wins.
  - If every remaining player survives the time limit, the winner is the one with more kills; if kills tie, it is a draw.
  - In multiplayer the time limit ends the match. Death, the single-player finale, does not spawn.
  - **Simultaneous deaths** (decided 2026-11-07): the server orders deaths by when it receives them, and the player who died last wins. If the last players all die within 100 ms of each other by server time, it is a draw.
  - **Away from keyboard** (decided 2026-11-07): a hidden tab keeps simulating (ADR 0004). A player whose tab stays hidden for 30 consecutive seconds forfeits and is treated as dead. The client reports visibility changes to the server, and the server owns the 30-second timer.
- The time limit is a content constant. The default is 15 minutes, shorter than the original game's 30, to fit jam play sessions.
- **Interference items** drop only in multiplayer. Picking one up applies its effect to the opponent: with two players that is the other player; with more players it is a random living opponent. Initial set:
  - **Swarm** — spawns an extra enemy pack around the target.
  - **Gem Thief** — removes the experience gems lying in the target's world.
  - **Elite Call** — spawns an elite enemy near the target.
- The target sees a warning in their HUD naming the sender and the effect.
- Each player sees a compact panel with every opponent's nickname, HP, level, kills and alive/dead state. There is no live view of the opponent's world (superseded by ADR 0018).
- Rooms hold a configurable maximum number of players, initially 2. Nothing in the protocol assumes exactly 2.

## Alternatives considered

- **Shared world, competitive or cooperative** — closer to the original co-op, but needs authoritative or lockstep synchronization of every enemy, which is too risky for a jam.

## Consequences

- No determinism or rollback is required, and a lagging opponent cannot slow your game.
- Interference arrives with network latency, which is acceptable for its effects.
- A cheating client could misreport its status. This is accepted for a jam game; the server only validates message shape and room membership.
