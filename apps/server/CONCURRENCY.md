# Concurrency Control — Code Map

ERPSYS uses **basic Timestamp Ordering (TO)**. Every `/api/v1` request is one transaction with a timestamp `ts`, and every guarded Mongo document carries `readTs` and `writeTs`:

- **Reads:** an operation aborts if it reads a document written after its `ts`.
- **Writes:** an operation aborts if it writes a document read or written after its `ts`.

An abort becomes `409` with `data.code = "TS_ABORTED"`. This file shows where each piece lives and why.

## Server

### `src/lib/db/timestamp-ordering.ts` — the engine

All of the TO logic is here. Nothing else in the server implements the rules.

| Code | Line | Purpose |
| --- | --- | --- |
| `TS_ABORTED`, `TS_MAX_RESTARTS` | 5–6 | Abort code sent to clients; restart limit (3). |
| `EXEMPT` | 18 | Collections never guarded: Better Auth state, logs, usage counters, step-up. |
| `FILTER_WRITES` | 28 | The Mongo write methods that go through the write rule. |
| `store` | 38 | `AsyncLocalStorage` holding the current request's transaction. |
| `nextTs()` | 47 | TS oracle: unique, increasing `max(last + 1, Date.now())`. In-process; fine for the single production process. |
| `isIssuedTs()` | 57 | Rejects a client `ts` the server could not have issued (future or not an integer). |
| `beginTransaction()` | 71 | Opens a transaction. Client `ts` → client-anchored; none → server-anchored with a fresh TS. |
| `currentTransaction()` | 92 | Returns the running transaction (used to put `ts` in responses). |
| `outsideTransaction()` | 101 | Runs code with no transaction (session lookup). |
| `stampWriterReads()` | 111 | Turns on `readTs` stamping for GETs by staff surfaces. |
| `aborted()` | 116 | Builds the `409 TS_ABORTED` error. |
| `restartAborted()` | 131 | Decides if an aborted server-anchored transaction that has not written yet may retry with a new TS. |
| `stale()` / `fresh()` | 140–143 | Mongo filters for "a newer transaction touched this" and its opposite. |
| `readRule()` | 154 | Read rule: abort on `ts < writeTs`, else stamp `readTs`. |
| `writeRule()` | 175 | Write rule: pre-check for stale matches, write with a guarded filter, set `writeTs`. |
| `insertRule()` | 209 | New documents start with `writeTs = ts`. |
| `guardCollection()` | 218 | Proxy that applies the rules to `find`, `findOne`, inserts, updates and deletes. |
| `guardDb()` | 260 | Wraps the `Db` so every `collection()` call returns a guarded collection. |

### `src/lib/db/db.ts:80` — the hook

`db = guardDb(client.db())`. Every model and service already gets its collections from `getDbSync()`, so they are all guarded without passing `ts` around.

### `src/middleware/timestamp.ts` — transaction per request

`timestampOrdering` reads and removes `ts` from the body, validates it with `isIssuedTs`, and opens the transaction. It is mounted in `src/app.ts:58`:

```ts
app.use("/api/v1", timestampOrdering, auditTrail, v1Router);
```

### `src/middleware/catchAsync.ts` — restart point

When a handler fails with `TS_ABORTED` and `restartAborted()` allows it, the handler runs again with a new TS. Otherwise the error goes to the error handler as `409`.

### `src/middleware/auth.ts` — boundaries

- **Line 20:** `requireSession` runs Better Auth inside `outsideTransaction()`, so the session lookup does not check or stamp the `user` document.
- **Line 38:** `requireSurface` calls `stampWriterReads()` for instructor, officer and admin surfaces. Student GETs do not stamp, so student polling cannot abort staff edits.

### `src/middleware/http.ts` — `ts` in responses

`withTs()` (line 6) adds the transaction's `ts` to every `okOne`/`okList` envelope: `{ data, ts }`.

### `src/routes/**/index.ts` — documentation

Every `/api/v1` write route block has the line:

```
Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
```

The comment rules are in `AGENTS.md` → "Comments".

## Web

### `apps/web/src/lib/api.ts` — client side

| Code | Line | Purpose |
| --- | --- | --- |
| `TS_ABORTED` | 13 | Same abort code as the server. |
| `tsById` | 17 | Map of record id → the `ts` it was last read at. |
| `rememberTs()` | 19 | Records the envelope `ts` for every `_id`/`id` in a response. |
| `request()` catch | 138 | On `409 TS_ABORTED`: invalidates all queries, shows a toast, rethrows. |
| `send()` | 163 | On PUT/PATCH/DELETE, adds the remembered `ts` for the URL's id to the body. |
| `send()` | 199 | Calls `rememberTs()` for every successful JSON response. |

## Tests

- `apps/server/tests/lib/db/timestamp-ordering.test.ts` covers:
  - The textbook abort schedule and the read rule.
  - Selective read stamping, and no effect outside a transaction.
  - Restart, and giving up after 3 restarts.
  - `ts` validation.
- `apps/server/tests/helpers/fakeDb.ts` supports `$gt`, `$not` and `$max`, which the rules need.

## Related docs

- `apps/server/API_ENDPOINTS.md` → "Concurrency" covers the request/response contract.
- `docs/plans/2026-11-08-timestamp-concurrency.md` covers the decisions, what shipped and the known limits.
