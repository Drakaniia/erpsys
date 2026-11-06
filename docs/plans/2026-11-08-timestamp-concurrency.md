# Timestamp-Ordering Concurrency Control — Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement this task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guard every server write endpoint with the textbook **basic Timestamp Ordering (TO)** protocol. Clients send the transaction timestamp `ts` in the request body. A stale transaction is aborted with `409 CONFLICT` and `data.code = "TS_ABORTED"`. The web app sends `ts` automatically and recovers from an abort.

**Decisions (from the 2026-11-08 Q&A):**

- Protocol: basic TO. The Thomas Write Rule is **not** used: an outdated write is always aborted, never silently dropped.
- Scope: every write endpoint under `/api/v1` (65 routes). Exempt: `/api/auth/*`, which Better Auth owns.
- Transport: the body field `ts`. Conflicts come back as `409` with `{ error, data: { code: "TS_ABORTED", ts } }`.
- Comments: AGENTS.md is amended so concurrency code carries `/** */` blocks (Task 1).
- Web: included. `ts` is tracked centrally, and an abort triggers a refetch and a toast.

## What shipped (2026-11-08)

The protocol below is implemented as written. The wiring is much smaller than the task list: the rules are enforced at the single choke point every query already passes through, instead of threading `ts` through 20 models, ~40 services and 17 controllers.

- `apps/server/src/lib/db/timestamp-ordering.ts` holds the oracle, the per-request transaction (`AsyncLocalStorage`), the read, write and insert rules, the restart decision, and `guardDb()`. `getDbSync()` wraps its `Db` with `guardDb`, so all 338 existing Mongo calls are guarded with no model or service changes.
- `middleware/timestamp.ts` (mounted on `/api/v1`) opens the transaction from the body `ts`. `catchAsync` restarts aborted server-anchored handlers. `requireSession` runs Better Auth outside the transaction, `requireSurface` turns on read stamping for staff surfaces, and `okOne`/`okList` add `ts` to the envelope.
- The web `api.ts` remembers the envelope `ts` per record id and sends it on PUT/PATCH/DELETE of that id. On `409 TS_ABORTED` it invalidates queries and shows a toast.
- Every `/api/v1` write route block has a `Concurrency:` line, and `AGENTS.md` allows concurrency blocks.
- Test: `apps/server/tests/lib/db/timestamp-ordering.test.ts` covers the textbook abort schedule, the read rule, selective read stamping, restart, giving up, and `ts` validation.

Changes from the plan below:

- **Anchoring is decided per request, not per route:** a body `ts` makes T client-anchored, and its absence makes T server-anchored. The web sends `ts` only on PUT/PATCH/DELETE of a record it loaded, so POST commands (queue removal, verification, completion, takeover) are server-anchored.
- **The oracle is in-process** (`max(last + 1, Date.now())`). That is correct because production is one systemd process; it removes the per-request Mongo round trip and the `ts_oracle` collection.
- **No Mongo multi-document transactions,** so `load-gate.yml` is unchanged. A transaction that aborts after it has already written keeps those writes and returns `409`. Wrap the request in `withTransaction` if that ever matters.
- **A passing write sets `writeTs` only** (textbook). `readTs` comes from reads.
- **Skipped:** the `TS_ABORTED` metrics counter (aborts are already logged as `409 CONFLICT`), the redundant `version` check in `IntegrationSettingService` (left in place), and the audit of form-local state (the registry always holds the `ts` of the newest cached data).

## The protocol, mapped onto this codebase

Every guarded document gains two fields, `readTs: number` and `writeTs: number`. Legacy documents are **not** migrated. A missing field counts as `0`, because the filters use `{ $not: { $gt: TS } }`, which matches both "missing" and "≤ TS".

A transaction T is one logical read-modify-write, and `TS(T)` comes from a monotonic oracle. For a document X:

| Operation | Abort when | On pass |
| --- | --- | --- |
| read(X) | `TS(T) < writeTs(X)` | `readTs(X) = max(readTs(X), TS(T))` |
| write(X) | `TS(T) < readTs(X)` or `TS(T) < writeTs(X)` | `writeTs(X) = TS(T)` |

Each check and its stamp run as **one** conditional Mongo update, so they are atomic per document:

```ts
updateOne(
  { ...idIn([id]), writeTs: { $not: { $gt: ts } }, readTs: { $not: { $gt: ts } } },
  { $set: { ...patch, writeTs: ts }, $max: { readTs: ts } },
);
```

If `matchedCount === 0`, re-read X. A missing document gives the existing `404`; otherwise the transaction aborts.

Transactions come in two kinds, and every write route is classified as one or the other in Task 6:

- **Client-anchored** (edits of something the user loaded: PATCH/PUT/DELETE of a row or form). `TS(T)` is the `ts` the client received with the data it is editing. An abort cannot be retried safely server-side, so it returns `409 TS_ABORTED` and the user retries on fresh data.
- **Server-anchored** (commands with no loaded basis: join/leave queue, serve next, heartbeat, notifications read, storage session/complete, reminders, chat stream, creates). `TS(T)` is issued fresh at request start. On an abort the server **restarts T with a new TS** (textbook restart), up to `TS_MAX_RESTARTS = 3`, and only then returns `409`. The business preconditions (`assertLeavable`, `assertLevelServed`, …) run inside T's read phase, so two concurrent commands cannot both pass them.

**Reads stamp `readTs` selectively.** A GET stamps `readTs` only when the caller's surface can write that resource, because only those reads can start an update transaction. Example: an officer listing submissions stamps them; a student listing requirements does not. Pure TO would let every student page view abort admin edits, and the queue polling would abort adviser actions continuously. **This is the one deliberate deviation from textbook basic TO.** Confirm it before Task 4.

`ts` must not be confused with the existing **signature stamp** (`/me/stamp`). Never name anything `stamp`; use `ts`, `readTs` and `writeTs`.

## Files

**Server (new):**

- `apps/server/src/config/concurrency.ts` defines `TS_ABORTED`, `TS_MAX_RESTARTS`, `tsAborted(ts)`, which returns an `ApiError("CONFLICT", { data: { code, ts } })`, and `tsInFuture()`, which returns a `BAD_REQUEST`. Pure values only.
- `apps/server/src/lib/db/timestamp-oracle.ts` provides `nextTs()` and `currentTs()`. It is backed by the new `ts_oracle` collection (added to `COLLECTIONS`) and runs one atomic pipeline update: `ts = max(ts + 1, Date.now())`. The result is unique and monotonic across server instances and stays close to wall-clock time.
- `apps/server/src/lib/db/timestamp-ordering.ts` provides `tsRead(collection, ids, ts)`, `tsWrite(collection, id, update, ts)`, `tsWriteMany(…)` (order endpoints, bulk ops), `tsInsert(row, ts)` (sets `readTs = writeTs = ts`), `tsDelete(collection, id, ts)` and `withTsRestart(fn)` (the server-anchored retry loop). It returns `{ ok } | { aborted } | { missing }` and never throws HTTP errors.
- `apps/server/src/middleware/timestamp.ts` assigns `res.locals.ts` on each request:
  - GET: `nextTs()`.
  - Write with a body `ts`: validate it as a positive integer that is `≤ currentTs()`. A future `ts` gets `400`, so a client cannot claim a timestamp that wins every check.
  - Write without a body `ts`: `nextTs()`, with the transaction marked server-anchored.

**Server (changed):**

- `app.ts`: mount `timestamp` before the `/api/v1` and `/api` routers. Do not mount it on `/api/auth`.
- `middleware/http.ts`: `okOne` and `okList` add `ts: res.locals.ts` to the envelope (`{ data, ts }` / `{ data, page, pageSize, total, ts }`). `parseBody` strips `ts` before zod parses the body, so the existing strict schemas stay unchanged.
- `models/*Model.ts`: every mutating static method takes `ts` and goes through `timestamp-ordering.ts`. Read-for-update finders call `tsRead`.
- `services/**`: pass `ts` through, map `aborted` to `tsAborted(ts)`, and wrap server-anchored use cases in `withTsRestart`.
- `controllers/**`: pass `res.locals.ts` into the one service call. No other change.
- `routes/**/index.ts`: every route block gains a `Concurrency:` line (Task 7).
- `services/integrations/IntegrationSettingService.ts`: replace the ad-hoc `version` check (lines 346 and 391) with TO, and keep `version` in the payload for display only.
- `apps/server/API_ENDPOINTS.md`: document `ts`, `TS_ABORTED`, and the `ts` envelope field.

**Multi-document writes** run their TO-guarded writes inside `client.startSession().withTransaction(...)`, so a mid-way abort leaves nothing half-applied. That covers academic-year activation, transfers and takeover, enrollment completion, department delete, user delete/purge, and the `/order` PUTs. Production is on Atlas, a replica set, so transactions are available. The CI load gate runs a standalone `mongo:7`, so `.github/workflows/load-gate.yml` must start it with `--replSet rs0` and run `rs.initiate()` in the health step.

**Web:**

- `apps/web/src/lib/concurrency/ts-registry.ts`: a `Map<id, ts>` filled from every response envelope. Each `_id`/`id` found in `data` is recorded with the envelope `ts`.
- `apps/web/src/lib/api.ts`: `send()` records `ts` before unwrapping `data`. For non-GET routes it attaches `ts` from the registry for the input's `id` (or alias) when the caller did not pass one. A `MutationCache.onError` handles `409` + `TS_ABORTED`: it invalidates the active queries and shows the sonner toast "This record changed since you opened it. It has been reloaded; please try again."
- `apps/web/src/lib/domain/types.ts`: add `ts` to the envelope types.

## Comment contract (AGENTS.md amendment)

Replace the first bullet of "Comments (`apps/server/src`)" with a rule that also allows **concurrency blocks**. Every function that issues a TS, checks or stamps `readTs`/`writeTs`, or handles a TO abort or restart carries exactly one block in this shape:

```ts
/**
 * Concurrency: timestamp ordering — write rule.
 * Rule: abort when TS(T) < readTs(X) or TS(T) < writeTs(X).
 * Pass: writeTs(X) = TS(T); readTs(X) = max(readTs(X), TS(T)).
 * Abort: `409` `TS_ABORTED` (client-anchored) / restart up to 3× (server-anchored).
 */
```

Route blocks gain one line:

```ts
/**
 * `PATCH /api/v1/departments/:id`
 * Access: session + instructor surface.
 * Use: rename, and (admins only) deactivate — body `{ ts, name?, isActive? }`.
 * Concurrency: client-anchored TO write on `department`; stale `ts` → `409` `TS_ABORTED`.
 * Returns: `{ data: department, ts }`.
 */
```

Comments of any other kind stay forbidden.

## Tasks

### Task 1: Contract first

- [ ] Amend `AGENTS.md` (comment rule + route block shape) as described above.
- [ ] Add this plan to `docs/README.md`.

### Task 2: Oracle + config

- [ ] `config/concurrency.ts`, `lib/db/timestamp-oracle.ts`, `ts_oracle` in `COLLECTIONS`, plus the index/seed in `lib/db/indexes.ts`.
- [ ] Colocated `timestamp-oracle.test.ts` covering monotonicity under 100 concurrent `nextTs()` calls, `currentTs()` never ahead of an issued TS, and no going backwards when `Date.now()` lags behind.

### Task 3: TO engine

- [ ] `lib/db/timestamp-ordering.ts` with the block comments.
- [ ] Extend `tests/helpers/fakeDb.ts` with `$max`, `$not`, pipeline `$set`, and a pass-through `withTransaction`, since the fake supports none of them today.
- [ ] Colocated `timestamp-ordering.test.ts` covering:
  - The read rule abort and pass.
  - The write rule aborting on `readTs` and on `writeTs`.
  - Legacy documents without stamps.
  - `missing` vs `aborted`.
  - `withTsRestart` succeeding on the 2nd attempt and giving up after 3.
  - Two interleaved schedules from the textbook (T1 reads, T2 reads, T1 writes → T1 aborts; T2 writes → ok).

### Task 4: Middleware + envelope

- [ ] `middleware/timestamp.ts`, mounted in `app.ts`, with the `okOne`/`okList` envelope `ts` and `ts` stripping in `parseBody`.
- [ ] Route test: GET returns increasing `ts`; a future `ts` gets `400`; `/api/auth` is untouched.

### Task 5: Load-gate Mongo as replica set

- [ ] Update `load-gate.yml` and add a `lib/db/transactions.ts` helper (`inTransaction(fn)`) with its concurrency block.

### Task 6: Roll out per resource (one commit per router)

For each router: classify every write route (C = client-anchored, S = server-anchored), thread `ts` through route block → controller → service → model, decide read stamping for its GETs, and add a route test asserting `409 TS_ABORTED` on a stale `ts` (C) or a restart under an injected conflict (S).

- [ ] `academic-years` (C: PATCH, DELETE · S: POST, activation ⟶ transaction)
- [ ] `departments` (C: PATCH, year-levels, DELETE, `PUT /me/departments` · S: POST)
- [ ] `requirements` (C: PATCH, DELETE, order ⟶ `tsWriteMany` · S: POST)
- [ ] `content` (C: social-link PATCH/DELETE/order, profiling-form DELETE, chatbot-knowledge PUT · S: creates)
- [ ] `advisers` (C: PATCH `:adviserId`, PUT availability · S: heartbeat)
- [ ] `queues` (S: join, leave, serving POST/DELETE, position · C: removal, restoration). This is the highest-risk router: run `tests/routes/queues.test.ts` and `queue-repair.test.ts` after it.
- [ ] `enrollments` (S: POST me · C: completion POST/DELETE, completions DELETE ⟶ transaction)
- [ ] `submissions` (C: verification POST/DELETE · S: replies)
- [ ] `evidence` (S: POST evidence, submission POST · C: DELETEs, evidence-link PUT/DELETE)
- [ ] `transfers` (S: POST · C: PATCH, DELETE, takeover ⟶ transaction)
- [ ] `students` (C: `PATCH /me/student`, mugshot PUT · S: reminders, assessment)
- [ ] `users` (C: PATCH/DELETE `/users` and `/users/:userId` ⟶ purge in a transaction · S: password-reset)
- [ ] `me` (C: `PATCH /me/stamp` · S: notifications read)
- [ ] `integrations` (C: PATCH `:key`, credentials PUT/DELETE, replacing the `version` check)
- [ ] `queue-shares`, `storage`, `chat` (S only)

### Task 7: Docs for the API

- [ ] Add the `Concurrency:` line to every route block. Grep check: every block with `POST|PUT|PATCH|DELETE /api/v1` has a `Concurrency:` line.
- [ ] Update `apps/server/API_ENDPOINTS.md`.

### Task 8: Web

- [ ] `ts-registry.ts` + `api.ts` changes + types.
- [ ] Colocated tests:
  - `ts-registry.test.ts`
  - `api.test.ts`: `ts` is attached from the registry, explicit `ts` wins, and a 409 `TS_ABORTED` invalidates queries and toasts.
- [ ] Spot-check forms that copy query data into local state (TanStack Form editors). They must reset when the query data changes, or the registry `ts` will be newer than what the user sees. List the offenders and fix each one.

### Task 9: Verify

- [ ] `pnpm check`, `pnpm test`, `pnpm --filter web build`.
- [ ] Load gate locally: confirm the p95 budget still holds with the extra oracle round-trip per request.

## Risks / open points

- **Extra latency:** one oracle `findOneAndUpdate` per request, plus one `updateMany` per stamping GET. If the load gate fails, switch the oracle to a per-process hybrid logical clock seeded from `ts_oracle` at boot. That is safe only while the server runs as a single instance.
- **Abort rate on busy admin data:** watch the `TS_ABORTED` count via `lib/platform/metrics.ts` (add a counter in Task 4).
- **Reads stamping only for writers** (see above) is the one deviation from textbook basic TO. Confirm it before Task 4.
