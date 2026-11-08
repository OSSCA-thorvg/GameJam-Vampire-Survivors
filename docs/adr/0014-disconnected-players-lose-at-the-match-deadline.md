# 0014. Players disconnected at the match deadline lose

- Status: Accepted
- Date: 2026-11-08
- Related issues: #64, #60

## Context

- [ADR 0005](0005-multiplayer-separate-worlds-with-interference.md) sets the win rule: the last player alive wins, deaths within 100 ms of each other by server time draw, and at the time limit kills decide. [ADR 0006](0006-websocket-relay-server.md) treats a player who disconnects during a match as dead after a 10 s grace.
- #60 made the server end every match by itself at `startAt + (MATCH_TIME_LIMIT_S + MATCH_DEADLINE_GRACE_S) s` (900 + 10 s). Every player who has not reported `died` or `survived` by then counts as survived with the kills of their last relayed `status`. That included a player who disconnected less than 10 s before the deadline: still inside the grace, not yet dead, so they could win on kills. A player ahead on kills could therefore close the connection near the end and keep the lead.
- The user decided on 2026-11-08 that a player who is disconnected when the deadline fires loses.

## Decision

- This extends ADR 0005 and ADR 0006; their rules are otherwise unchanged.
- When the match deadline fires, the server (`packages/server/src/rooms.ts`, `RoomRegistry.deadline`) first eliminates every player who is still alive and whose socket is closed, even inside the 10 s disconnect grace, and even if they already reported `survived`. Each dies at the deadline instant with reason `disconnected`, and the other players receive `playerEliminated { reason: 'disconnected' }`, exactly as when the grace ends.
- Only then does the #60 rule apply to the remaining players (unreported means survived, with the last relayed kills), and the ADR 0005 rule decides once, after all of these changes:
  - if one or more players are left alive, the last alive wins or, when several survived, the most kills win and a tie is a draw;
  - if nobody is left alive, the simultaneous-death rule decides: the latest death wins, and deaths within 100 ms of each other draw. All players disconnected at the deadline share one death time, so when they are the last ones alive the result is a draw.
- The connection state is read at the deadline instant. A player whose socket is open then is handled exactly as in #60.
- No protocol change: `matchResult` and `playerEliminated` keep their shapes, and the `match_deadline` log line gains a `disconnected` count.

## Alternatives considered

- **Keep #60's behaviour (disconnected inside the grace counts as survived)**: rejected by the user, because dropping the connection could protect a lead.
- **Extend the deadline until every grace ends**: the result could then wait up to 10 s more, and a player who disconnects just before the deadline would still be treated the same way, only later.
- **Rank a disconnected player by kills among the dead**: makes no difference to who wins, since any player alive beats any dead one, and it would make the deadline rule harder to state.

## Consequences

- Disconnecting can never improve a player's result at the deadline: they either die at the grace end or at the deadline, whichever comes first.
- A player whose connection drops briefly near the end loses even if their game was still running. There is no reconnect into a running match today (`joinRoom` refuses rooms in a match). If a reconnect path is added, a player reconnected before the deadline is connected and keeps normal handling; revisit this ADR if reconnection must restore a player's eliminated state.
- A room whose players are all disconnected is deleted with its deadline timer (ADR 0006: rooms are deleted when empty), so the all-disconnected draw is reached only when a connected player who is already dead keeps the room open.
