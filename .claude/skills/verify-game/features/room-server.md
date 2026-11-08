# Room server

The WebSocket room server (#18): clients say `hello`, create or join a room by its 6-character code with a nickname, ready up, and the host starts a match with one shared seed; the server relays status and interference and decides the result (ADRs 0005, 0006, 0011). It is driven here from the page with `page.evaluate` and a plain `WebSocket`; the player-facing lobby is `lobby.md` (#19).

## Sub-features

- **Handshake:** after `hello { v: 1 }` the server answers `welcome { playerId }`; before `hello` it sends nothing. Any other first message, or another version, gets `error versionMismatch` and a 1008 close.
- **Create and join:** `createRoom { nickname }` answers `roomState` with a code matching `^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$`, `phase: 'lobby'`, `maxPlayers: 2` and the creator as `host`; `joinRoom { code, nickname }` makes both players receive a `roomState` with 2 players. Unknown code, full room or a room in a match: `roomNotFound` (a code's existence is never revealed, ADR 0011); same nickname (case-insensitive): `nicknameTaken`; bidi, zero-width or control characters, or more than 12 characters: `invalidNickname`.
- **Ready and start:** both `setReady { ready: true }`, then the host's `startMatch` gives both players `matchStart` with the same `seed` and `startAt` (server epoch ms, 3 s ahead), then `roomState` with `phase: 'countdown'` and, at `startAt`, `phase: 'playing'`. Not host: `notHost`; fewer than 2 or not all ready: `notAllReady`.
- **Result:** `died` from one player gives everyone `playerEliminated { reason: 'died' }` and, 100 ms later, `matchResult { outcome: 'win', winnerId: <the other player> }`, then `roomState` `finished`; 5 s later `roomState` is back in `lobby` with every `ready: false`.
- **Deadline (#60):** the server ends every match by itself at `startAt + (MATCH_TIME_LIMIT_S + MATCH_DEADLINE_GRACE_S) s` (900 + 10 s). Every player who has reported neither `died` nor `survived` by then counts as survived with the kills of their last relayed `status`, and the ADR 0005 rule decides: both players get the same `matchResult` (most kills win, a tie is a draw), with no `playerEliminated`. Any earlier result clears the deadline.
- **Disconnected at the deadline (#64, ADR 0014):** before that rule applies, every player still alive whose socket is closed, even inside the 10 s disconnect grace and even after reporting `survived`, dies at the deadline instant: the connected players get `playerEliminated { reason: 'disconnected' }` and, after the 100 ms simultaneous-death window, `matchResult` with that player ranked `alive: false`. Dropping the connection never protects a lead; the disconnected player receives nothing. Players connected at the deadline keep the rule above. Journeys shorten the limit with `MATCH_TIME_LIMIT_S_OVERRIDE` (1–900 s), which the server honours only when `NODE_ENV=test`; the `listening` log line shows the effective `matchTimeLimitS`, and an ignored override logs `override_ignored`.
- **Status and interference:** `status` is relayed as `peerStatus` to the other players at most every 250 ms; `interference { kind }` during `playing` reaches one living opponent only, as `interferenceIncoming` with the sender's id and nickname.
- **Limits (ADR 0011):** an upgrade from an Origin outside `ALLOWED_ORIGINS` gets HTTP 403, another path 400, the 11th connection from one IP 429; 100 messages (or WebSocket pings) in one second get `error rateLimited` and a 1008 close; a malformed or out-of-phase message gets one `error` (`badMessage` or `wrongPhase`) and the second closes with 1008; frames over 4 KiB close with 1009; 10 unknown codes in 60 s make further `joinRoom` answer `rateLimited` for 60 s.
- **Logs:** `pnpm server:logs` shows event names, room codes, counts, sizes and close codes, never nicknames or message bodies.

No snapshot fields: the server state is observed through the messages it sends.

## How to get to it (user POV)

The player entry point is the lobby (`lobby.md`, #19); this file drives the raw protocol. Precondition: the server in Docker, `cp -n .env.example .env`, then `pnpm verify:launch --with-server` (starts or reuses the server on :8787, and the client on :5180, whose origin `http://localhost:5180` is in the default `ALLOWED_ORIGINS`). Load the game page in two separate browser contexts and open a `WebSocket` to `ws://localhost:8787/ws` from each page.

## Driving it

### Claude in Chrome

1. Open two new tabs (`tabs_create_mcp` twice) and `navigate` both to `http://localhost:5180/`; wait for `__vsTest.waitFor((s) => s.ready, 30000)` in each. Both tabs share the browser profile, which is fine: the server tells clients apart by socket, not by cookie.
2. In each tab, `javascript_tool`:
   ```js
   window.__room = { socket: new WebSocket('ws://localhost:8787/ws'), log: [] };
   __room.socket.onmessage = (e) => __room.log.push(JSON.parse(e.data));
   __room.send = (m) => __room.socket.send(JSON.stringify(m));
   await new Promise((r) => (__room.socket.onopen = r));
   __room.send({ type: 'hello', v: 1 });
   ```
3. Tab A: `__room.send({ type: 'createRoom', nickname: 'Alice' })`, then read the code: `__room.log.filter((m) => m.type === 'roomState').at(-1).code`.
4. Tab B: `__room.send({ type: 'joinRoom', code: '<code>', nickname: 'Bob' })`; both tabs: `__room.send({ type: 'setReady', ready: true })`; tab A: `__room.send({ type: 'startMatch' })`.
5. Both tabs: `JSON.stringify(__room.log.find((m) => m.type === 'matchStart'))` → the same `seed` and `startAt`. After about 3 s, tab B: `__room.send({ type: 'died', kills: 3, elapsedMs: 5000 })`.
6. Both tabs: `JSON.stringify(__room.log.find((m) => m.type === 'matchResult'))` → `outcome: 'win'`, `winnerId` equal to tab A's `welcome.playerId`. Save both `JSON.stringify(__room.log)` outputs as transcripts, `screenshot` each tab, close both tabs.

### Playwright

Save as `verification/issue-<N>/journeys/room-server.spec.ts`, then run it as in `../SKILL.md` § Drive. It saves `room-server/context-a/` (`01-room-created.png`, `02-playing.png`, `03-result.png`, `transcripts.json` with both sides' messages in order, console logs) and `room-server/context-b/`. Keep `pnpm server:logs` (or `docker compose -p <project> logs server`) next to it and check that it contains no nickname.

```ts
import { expect, test, type Page } from '@playwright/test';
import { openGame, startEvidence } from '../../../e2e/helpers';

const SERVER = 'ws://localhost:8787/ws';

interface Entry {
  dir: 'in' | 'out';
  at: number;
  msg: { type: string; [key: string]: unknown };
}

/** Opens a WebSocket from the page itself, so the server sees the page's real Origin (http://localhost:5180). */
async function connect(page: Page): Promise<void> {
  await page.evaluate(async (url) => {
    const socket = new WebSocket(url);
    const log: Entry[] = [];
    (globalThis as unknown as { __room: { socket: WebSocket; log: Entry[] } }).__room = {
      socket,
      log,
    };
    socket.addEventListener('message', (e) => {
      log.push({ dir: 'in', at: Date.now(), msg: JSON.parse(String(e.data)) as Entry['msg'] });
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        reject(new Error('WebSocket error (is the page origin in ALLOWED_ORIGINS?)'));
      });
    });
  }, SERVER);
}

async function send(page: Page, msg: Entry['msg']): Promise<void> {
  await page.evaluate((m) => {
    const room = (globalThis as unknown as { __room: { socket: WebSocket; log: Entry[] } }).__room;
    room.log.push({ dir: 'out', at: Date.now(), msg: m });
    room.socket.send(JSON.stringify(m));
  }, msg);
}

/** The last received message of `type` whose fields include `where` (shallow) and, optionally, N players. */
async function waitFor(
  page: Page,
  type: string,
  where: Record<string, unknown> = {},
  players?: { count: number; allReady?: boolean },
): Promise<Entry['msg']> {
  const handle = await page.waitForFunction(
    ([t, w, p]) => {
      const room = (globalThis as unknown as { __room: { log: Entry[] } }).__room;
      const found = room.log
        .filter((e) => e.dir === 'in' && e.msg.type === t)
        .map((e) => e.msg)
        .reverse()
        .find((m) => {
          if (!Object.entries(w).every(([k, v]) => m[k] === v)) return false;
          if (!p) return true;
          const list = m.players as { ready: boolean }[] | undefined;
          return list?.length === p.count && (!p.allReady || list.every((x) => x.ready));
        });
      return found ?? null;
    },
    [type, where, players] as const,
    { timeout: 10_000 },
  );
  return (await handle.jsonValue()) as Entry['msg'];
}

async function transcript(page: Page): Promise<Entry[]> {
  return page.evaluate(() => (globalThis as unknown as { __room: { log: Entry[] } }).__room.log);
}

test('room server: two contexts create, join, ready, start with one seed, and a death decides the match', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const evA = startEvidence(a, 'room-server/context-a');
  const evB = startEvidence(b, 'room-server/context-b');
  try {
    await openGame(a);
    await openGame(b);
    await connect(a);
    await connect(b);

    await send(a, { type: 'hello', v: 1 });
    const welcomeA = await waitFor(a, 'welcome');
    await send(b, { type: 'hello', v: 1 });
    const welcomeB = await waitFor(b, 'welcome');

    await send(a, { type: 'createRoom', nickname: 'Alice' });
    const created = await waitFor(a, 'roomState', { phase: 'lobby' }, { count: 1 });
    const code = created.code as string;
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    await evA.shot('room-created');

    await send(b, { type: 'joinRoom', code, nickname: 'Bob' });
    await waitFor(a, 'roomState', { code }, { count: 2 });
    await waitFor(b, 'roomState', { code }, { count: 2 });

    await send(a, { type: 'setReady', ready: true });
    await send(b, { type: 'setReady', ready: true });
    await waitFor(a, 'roomState', { phase: 'lobby' }, { count: 2, allReady: true });

    await send(a, { type: 'startMatch' });
    const startA = await waitFor(a, 'matchStart');
    const startB = await waitFor(b, 'matchStart');
    expect(startA.seed).toBe(startB.seed);
    expect(startA.startAt).toBe(startB.startAt);
    await waitFor(a, 'roomState', { phase: 'playing' });
    await evA.shot('playing');
    await evB.shot('playing');

    await send(b, { type: 'died', kills: 3, elapsedMs: 5000 });
    const resultA = await waitFor(a, 'matchResult');
    const resultB = await waitFor(b, 'matchResult');
    expect(resultA).toEqual(resultB);
    expect(resultA.outcome).toBe('win');
    expect(resultA.winnerId).toBe(welcomeA.playerId);
    expect(resultA.winnerId).not.toBe(welcomeB.playerId);
    await evA.shot('result');

    const transcripts = { code, a: await transcript(a), b: await transcript(b) };
    evA.json('transcripts', transcripts);
  } finally {
    evA.flush();
    evB.flush();
    await ctxA.close();
    await ctxB.close();
  }
});
```

### Deadline journey (#60)

Needs a server started with the test-only short limit, under its own compose project so it never touches another checkout's server (host port 8787 must be free):

```sh
cp -n .env.example .env
printf "services:\n  server:\n    environment:\n      NODE_ENV: test\n      MATCH_TIME_LIMIT_S_OVERRIDE: '5'\n" > /tmp/compose.deadline.yaml   # any scratch path
docker compose -p vs-deadline -f compose.yaml -f /tmp/compose.deadline.yaml up -d --build server
docker compose -p vs-deadline logs server | grep listening   # must show "matchTimeLimitS":5
```

1. With either driver, take two clients through hello, `createRoom`/`joinRoom`, `setReady` and `startMatch` exactly as in the steps above, and note `matchStart.startAt`.
2. Once `playing`: A sends `status` with `kills: 4`, B sends `status` with `kills: 11`; from then on B sends nothing (no `status`, `died`, `survived` or `visibility`).
3. At `startAt + 5 s`, A sends `survived { kills: 7 }`. No `matchResult` arrives yet.
4. At `startAt + 15 s` (limit + 10 s grace) both clients receive the same `matchResult { outcome: 'win', winnerId: <B> }` with ranking B (alive, 11 kills) then A (alive, 7 kills), followed by `roomState` `finished`; the server log shows `match_deadline` with `forced: 1`, then `match_result`.
5. Inert outside tests: run the runtime image with the override and no `NODE_ENV=test` (`docker run --rm -d -p 18787:8787 -e MATCH_TIME_LIMIT_S_OVERRIDE=5 vs-server:local`) and repeat against `ws://localhost:18787/ws`: its log shows `"matchTimeLimitS":900` and `override_ignored`, and no `matchResult` arrives 15 s after `startAt`.
6. Clean up only what you started: `docker compose -p vs-deadline down -v` and `docker rm -f` the runtime container.

### Disconnect at the deadline journey (#64)

Same short-limit server as the deadline journey (`NODE_ENV=test`, `MATCH_TIME_LIMIT_S_OVERRIDE: '5'`, its own compose project), so the deadline is `startAt + 15 s`.

1. Take two clients through hello, `createRoom`/`joinRoom`, `setReady` and `startMatch`; note `matchStart.startAt`.
2. Once `playing`: A sends `status` with `kills: 7`, B sends `status` with `kills: 11`.
3. At `startAt + 5 s`, A sends `survived { kills: 7 }`. At `startAt + 13 s` (2 s before the deadline, inside the 10 s grace), B closes its socket (`socket.close(1000)`). A receives `roomState` with B `connected: false`.
4. At `startAt + 15 s` A receives `playerEliminated { playerId: <B>, reason: 'disconnected' }` and, about 100 ms later, `matchResult { outcome: 'win', winnerId: <A> }` with ranking A (alive, 7 kills) then B (not alive, 11 kills), then `roomState` `finished`. B's transcript ends at its close: a closed socket receives no `matchResult`.
5. The server log shows `player_eliminated` with `reason: disconnected`, `match_deadline` with `forced: 0` and `disconnected: 1`, then `match_result` with `outcome: win`, and contains no nickname.

The Claude in Chrome driver runs the steps from two tabs with `javascript_tool` as above; a Node script with the workspace's `ws` package works the same way (run it from `packages/server`, `origin: 'http://localhost:5180'`; see Gotchas). Save both transcripts with their receive times.

Limits and malformed input are covered at level 4 by `packages/server/src/index.test.ts` (real `ws` clients against `startServer`); against the container, the same checks run from a Node script with the workspace's `ws` package (see Gotchas).

## Gotchas

- The page origin must be in `ALLOWED_ORIGINS`: `verify:launch` always serves `http://localhost:5180` and fails if the port is busy, and the default (#4) already allows it; a custom `.env` must keep that origin, or every `WebSocket` fails with HTTP 403 (2026-11-08, #18).
- Only one server can own host port 8787. `--with-server` reuses whichever answers `/healthz`, so a stale container from another checkout serves old code: check `docker ps` before trusting a run (2026-11-08, #18).
- Since #59 the Playwright config has two projects; run this journey with `--project=chromium` (with `=`): `--project chromium room-server` reads `room-server` as a second project name and fails with `Project(s) "room-server" not found` (2026-11-08, #18).
- Rooms live in memory: restarting the container (or a hot reload of `packages/server/src`) drops every room and closes every socket.
- The issue's sample `curl` upgrade uses `Sec-WebSocket-Key: dGhlIHNhbXBsZQ==`, which is 10 bytes, so `ws` answers 400 `Missing or invalid Sec-WebSocket-Key header` before checking the Origin. Use a 16-byte key such as `dGhlIHNhbXBsZSBub25jZQ==` to see the 403 for a foreign Origin (2026-11-08, #18).
- The browser sets `Origin` itself; a Node script must pass `{ origin: 'http://localhost:5180' }` to `new WebSocket(...)`. Run such scripts from `packages/server` so `ws` resolves; all connections of one machine count towards the same 10-per-IP cap, and 10 unknown codes lock that IP out of joining for 60 s, which also affects the browser journey.
- There is no reconnect into a running match (`joinRoom` refuses a room in a match), and a room whose players are all disconnected is deleted with its deadline timer: the all-disconnected draw at the deadline (ADR 0014) is reachable only with 3 players, one dead but connected, and is proven in `rooms.test.ts` only (2026-11-08, #64).
- The deadline cannot be reached at the real 910 s in a journey: always shorten it with `MATCH_TIME_LIMIT_S_OVERRIDE` under `NODE_ENV=test`. `.env.example` leaves it blank and the dev container sets no `NODE_ENV`, so `pnpm server:up` and `verify:launch --with-server` always run the 900 s limit; the 10 s grace after the limit is never shortened (2026-11-08, #60).
- The 30 s AFK forfeit, the 10 s disconnect grace, the 100 ms simultaneous-death window and the 910 s deadline (silent opponent, early clearing, a disconnect inside the grace losing at the deadline) are proven with a fake clock in `packages/server/src/rooms.test.ts` (level 4). The AFK path needs a real hidden tab, which no automated driver can produce (`hidden-tab.md`); #20 wires `visibilitychange` to the `visibility` message.
