# 0022. Keep single-player personal records in `localStorage`

- Status: Accepted
- Date: 2026-11-09
- Related issues: #143; partly supersedes ADR [0008](0008-data-driven-content-and-scope.md)'s "persistent save" exclusion

## Context

- REQUIREMENTS 4: no unlock system. Nothing a player keeps between runs may change a run.
- ADR 0008's Excluded list names "a persistent save. Nothing is persisted between runs." It was written against run progress and unlocks (coffins, gold, the collection), not against a history of results.
- User decisions, 2026-11-09 (#143):
  1. Save bests per character and overall (longest survival time, most kills, highest level, cleared 15:00), lifetime totals (runs, kills, clears, play time), the last 10 runs (date, character, time, kills, level, cleared or game over) and the best damage per weapon in a single run.
  2. Show them on the results screen ("New best!" per broken item), on the character select cards (best time, cleared mark) and on a Records screen opened from the title, with a reset behind an in-page confirm step (no `window.confirm`).
  3. Single player only: versus matches are not recorded.
  4. The storage choice gets an ADR.
- The data is a few KB: at most 10 recent runs, 4 characters and 16 weapon IDs (8 base, 8 evolutions).
- The client already keeps small JSON in `localStorage` with guarded load-and-validate code: `vs.nickname` (#19, `main/storage.ts`) and `vs.audio` (#129, `main/audio/settings.ts`).
- ADR 0004: the main thread owns the DOM and storage; the worker owns the simulation and already sends a `gameOver { stats: RunSummary }` at the end of every run.

## Decision

- Personal records live on the **main thread only**, in `packages/client/src/main/records/` (`format.ts`, `apply.ts`, `store.ts`). They are built from the `gameOver` message; no worker code and no worker message changes.
- They are stored in `localStorage` under the key **`vs.records`** as one JSON document: `{ v: 1, overall, characters, totals, recent, weaponBest }`.
  - `overall` and each `characters[id]`: `{ timeSec, kills, level, cleared }`.
  - `totals`: `{ runs, kills, clears, playTimeSec }`.
  - `recent`: newest first, at most 10 `{ at, characterId, timeSec, kills, level, cleared }` (`at` is epoch milliseconds).
  - `weaponBest`: best single-run damage by weapon ID, base and evolved.
- **Validation on read:** the raw string is at most 32768 characters; the JSON is parsed in a `try`; every object level must have exactly its fields (no missing, no extra); numbers are finite and inside their ranges (time up to 86400 s, kills up to 10^7, level up to 10^4, damage up to 10^12, runs up to 10^7, total kills up to `Number.MAX_SAFE_INTEGER`, play time up to 10^10 s, `at` up to 8.64 × 10^15); counters are integers; `clears <= runs`; `recent` has at most 10 entries.
- **Map keys** are content IDs (`CharacterId`, `WeaponId`) matched by `^[a-z][A-Za-z0-9]{0,31}$`, at most 64 per map. Maps are rebuilt with `Object.fromEntries` and read with `Object.hasOwn`. Unknown but well-formed IDs are kept, so adding or removing content never invalidates stored data. Display names always come from the content data (`CHARACTERS`, `WEAPONS`), never from stored strings, and every stored value reaches the DOM through `textContent` (ADR 0011).
- **Reset on corrupt:** an unknown version and any invalid value load as empty records with exactly one console warning (`[records] ...`); the stored value is left until the next save overwrites it. There is no migration: a later format bumps `v` and adds its own migration in the issue that changes it.
- **Guarded storage:** every `getItem`, `setItem` and `removeItem` call, and the access to `localStorage` itself, sits inside a `try`. A failure keeps the records in memory for the session, sets `persisted` to false, warns at most once per cause and never reaches a run.
- **What is recorded:** only single-player runs that end with `gameOver`, on the app's `playing` → `results` transition. Versus matches never are, and a run quit from the pause screen sends no `gameOver`.
- **Reset** removes `vs.records` only, never `localStorage.clear()`, so `vs.audio` and `vs.nickname` survive.
- **Scope of ADR 0008 is kept:** records never feed back into a run (no unlock, stat, gate or content change). ADR 0008's "persistent save" exclusion now means a save of run progress and unlocks, not this read-only history.

## Alternatives considered

- **IndexedDB** — built for large and binary data, indexes, queries and multi-record transactions, none of which one small JSON document uses. Its asynchronous API would add a loading state to the results screen, the character select and the Records screen, and the results screen could not show "New best!" in the same transition that saves. It is origin-scoped and unavailable in some private modes just like `localStorage`, so it buys no resilience.
- **`sessionStorage`** — lost when the tab closes, so it is not a record.
- **Cookies** — sent to the server with every request and limited to about 4 KB.
- **One key per record** — many keys to validate and no atomic write of a run.

## Consequences

- Easier: synchronous reads inside the results transition and the screens; one place (`format.ts`) defines and validates the format; the same guarded pattern as `vs.audio`.
- Harder: changing the format needs a version bump and migration code in that issue, or stored records reset to empty.
- Records are per browser profile and origin; clearing site data removes them. There is no export, sync or leaderboard.
- Revisit if the document grows past about 100 KB (move to IndexedDB then), or if records ever need to change a run (that would need a new ADR against REQUIREMENTS 4).
