# 0026. Versus: the first to clear the stage wins, under a 25-minute real-time deadline

- Status: Accepted
- Date: 2026-11-13
- Related issues: #177; supersedes in part [ADR 0005](0005-multiplayer-separate-worlds-with-interference.md) (its time-limit lines and when the last-survivor rule ends a match); amends [ADR 0014](0014-disconnected-players-lose-at-the-match-deadline.md) (the deadline's time only)

## Context

- REQUIREMENTS 2 (two players). [ADR 0005](0005-multiplayer-separate-worlds-with-interference.md) made the last player alive the winner and ended a match the moment one player was left; if every remaining player survived the 15-minute time limit, more kills won and a tie was a draw. #60 and [ADR 0014](0014-disconnected-players-lose-at-the-match-deadline.md) made the server end every match by itself at `startAt + 900 + 10` s of real time.
- Each player's game clock stops during level-up and chest dialogs (ADR 0004), so the stage's 15:00 lies well after 15 minutes of real time. On 2026-11-13 the owner's match ended at 12:06 of game time with "Time ran out on the server": the real-time deadline, not the stage, decided it, with no warning on screen.
- **Owner decisions (2026-11-13):** show the real remaining time in the versus HUD (option 1 of the three offered); raise the server's time to about 25 minutes; the player who clears the stage first wins. In a follow-up the same day: a death no longer ends the match while another player is still alive; the survivor keeps playing, and whoever outlives the others wins (example: A dies at 8:00 with 500 kills, B dies at 12:00 with 300 kills, B wins).

## Decision

- Stage time and server time are separate constants in `packages/shared/src/protocol.ts`: `MATCH_TIME_LIMIT_S` (900) stays the stage clear time, equal to `STAGE.durationSec` (`stage.test.ts`), at which a versus world ends (`finale: 'end'`) and the client sends `survived { kills }`; the new `MATCH_DEADLINE_S` (1500) is the server's real-time limit, greater than `MATCH_TIME_LIMIT_S` by test.
- **First clear wins:** the first `survived` the server accepts during `playing` from a player not eliminated ends the match at once with that player as the winner (`RoomRegistry.survived` calls `finish`). Later `survived` messages find the room `finished` and are dropped. No message changes; `PROTOCOL_VERSION` stays 2.
- **Deaths do not end the match:** a death, an AFK forfeit or a disconnect (after its 10 s grace) that leaves one or more players alive does not end the match; they keep playing. The dead player keeps the defeat overlay and the live opponent pane until `matchResult`.
- **Everybody out:** when no player is left alive, the result waits `SIMULTANEOUS_DEATH_WINDOW_MS` (100 ms) after the last elimination: the player eliminated last by server receive time (`eliminatedAt`) wins; when the last eliminations fall within 100 ms of each other, it is a draw.
- **Deadline:** the server ends the match at `startAt + MATCH_DEADLINE_S + MATCH_DEADLINE_GRACE_S` (1500 + 10 s). ADR 0014 applies unchanged: every player still alive whose socket is closed dies at that instant; every other player alive counts as survived with the kills of their last relayed `status`, the most kills win and a tie is a draw (one player left alive wins). If the deadline leaves nobody alive, the rule above decides. `MATCH_TIME_LIMIT_S_OVERRIDE` keeps its name and stays test-only (`NODE_ENV=test`), now from 1 to `MATCH_DEADLINE_S`.
- **Ranking** in `matchResult`: the winner first, then the players alive by kills, then the eliminated by elimination time, latest first; join order breaks ties.
- **HUD clock:** the versus HUD shows `MATCH mm:ss`, the real time left to `startAt + MATCH_DEADLINE_S`, which keeps counting through dialogs. The client never compares `startAt` with its own clock beyond the lobby's clamp: `versusController` anchors the start at `now() + clamp(startAt - now(), 0, MAX_COUNTDOWN_MS)` and posts `MainToWorker` `matchClock { remainingMs }`; the worker anchors it on `performance.now()` and draws one ThorVG `Text` (size 16, created once, text changed at most once per second, anchored through `hudAnchors` and checked by `hud-extents.ts`). Single player shows no clock.
- **Result notes:** "<nickname> cleared the stage first." after a first clear; "Time ran out on the server: …" only for a deadline result. Since deaths no longer end a match, a result with a player alive is either a first clear or the deadline: a clear by another player needs 15 minutes of real time since the start, or a relayed `status` within 5 s of 15:00 (the dev fast-forward); otherwise, or when the local clock has passed the deadline, it is the deadline.

## Alternatives considered

- **Keep the 15-minute real-time limit and only show the remaining time** (option 2 offered): the stage's 15:00 would still be unreachable for a player who levels up often.
- **Pause the server clock during dialogs** (option 3 offered): needs dialog messages to the server and trust in them; a client could stall forever.
- **Keep ending the match at the last survivor** (the first version of #177): rejected by the owner the same day, because a player who is ahead could lose by dying early while the other still had to play out the stage; the outcome of the last-survivor rule is kept, only the end of the match moves.
- **A field in `matchResult` saying why the match ended**: would tell the notes apart exactly, but is a protocol change, out of scope for #177.

## Consequences

- A match lasts at most 25 minutes 10 seconds of real time; the HUD tells both players how much is left.
- A dead player waits until the other clears, dies or the deadline (up to 25 minutes) with the defeat overlay and no way to leave the match screen except closing the page; a "leave" action is a follow-up.
- The note heuristic can name a clear wrongly only when a test-only short server deadline falls after 15 minutes of real time or within 5 s of a player's 15:00; production deadlines (1510 s) are always detected by the clock. Revisit with a protocol field if that matters.
- The owner's server must be redeployed with this version; an old server with a new client ends matches at 910 s with no clock warning beyond the HUD, and a new server with an old client shows the old deadline notes.
