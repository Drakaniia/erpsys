# Load resilience design

- **Date:** 2026-09-26
- **Status:** approved, not yet implemented
- **Answers:** the open question in `docs/specs/open-requests.md` — how to keep the app alive and correct during deployment when many students are using or queueing.
- **Target load:** 300–1000 students concurrently on the queueing page at peak (enrollment day).
- **Deployment target:** single Ubuntu VM, Nginx + systemd, MongoDB Atlas.

## Problem

The app has four independent ways to fail under this load, and only one of them is a "crash" in the narrow sense. The others are worse, because they look like success.

1. **The process dies.** There are no `process.on` handlers anywhere in the repo, and four unguarded `auth.api.getSession` calls that reject if Mongo hiccups. There is no error-handling middleware at all, so errors fall through to Express's default HTML handler — and since `NODE_ENV` defaults to `development` (`lib/env.ts:50`), a deploy that forgets it serves stack traces to students.
2. **Deploys drop everyone.** `app.listen`'s return value is discarded (`index.ts:38`) and there is no SIGTERM handler, so every restart severs all in-flight requests and all SSE streams.
3. **Load compounds instead of shedding.** The Mongo client has no options (`lib/db.ts:47`), so `maxPoolSize` is 100 and `waitQueueTimeoutMS` is `0` — infinite. Request 101 does not fail; it waits forever, holding an Express handler open. Meanwhile the hottest read fetches every waiting student in the institution to build a count map.
4. **Concurrency silently corrupts the queue.** There are **zero `createIndex` calls in the entire codebase** — no migration runner, no seed script, no bootstrap. Every uniqueness rule is application-level check-then-act, so simultaneous students and simultaneous advisers both defeat it.

This document specifies the fix for all four.

## Architecture decisions

These are settled and should not be revisited during implementation.

**Single process; no cluster.** Two pieces of process-local state break silently under more than one Node process: the SSE fan-out map (`lib/sse.ts:17`) and the chat rate limiter (`routes/chat.ts:30`). Clustering without a shared bus would mean live updates quietly stop working — a worse failure than a visible crash. At 300–1000 a single tuned process is the right shape. Revisit above ~2000 concurrent.

**No MongoDB transactions.** The critical invariants are enforced by unique indexes instead, which need only single-document atomicity. This works on any Atlas tier with no replica-set requirement, and avoids a large refactor of the enrollment service.

**Load reduction is server-side only.** Make the queries cheap; do not change polling intervals or extend SSE to students. Re-evaluate that trade against the Phase 4 metrics rather than guessing now.

**Readiness must be honest.** Liveness and readiness split into two endpoints. A load balancer must be able to tell "process is up" from "process can serve traffic".

## Phase 0 — Process survival

_Alone fixes: the crash._

### Process-level guards

New `lib/guard.ts` installs `unhandledRejection` and `uncaughtException` handlers before anything else in `index.ts`. `unhandledRejection` logs the full error and continues — a bad request should never take down the server for other students. `uncaughtException` logs, then triggers the Phase 2 graceful shutdown and exits non-zero, because at that point the process state is unknown.

### Error-handling middleware

New `routes/errors.ts` exports three handlers, mounted in this order:

- A 4-arity error handler returning JSON `{ error, code }`. It must log the error server-side with the request id, and must not leak stack traces in production.
- A not-found handler that returns JSON 404 for `/api` and `/rpc` paths.
- An SPA fallback `app.get("*")` serving `index.html` for unmatched non-API paths, so a hard refresh on `/app/student` works. It must be mounted after `express.static` and must not swallow genuine API 404s.

### Mongo client options

`lib/db.ts:47` becomes `new MongoClient(url, options)` with an explicit, env-tunable option set. Defaults:

| Option                     | Value      | Why                                                                                                                  |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `maxPoolSize`              | 25         | A single process against Atlas does not benefit from 100; 25 keeps concurrency visible instead of hidden in a queue. |
| `minPoolSize`              | 5          | A warm pool avoids a connect storm on the first burst after a deploy.                                                |
| `waitQueueTimeoutMS`       | 5000       | **The key change.** Exhaustion now throws instead of waiting forever.                                                |
| `serverSelectionTimeoutMS` | 5000       | Fail in 5s, not the 30s driver default.                                                                              |
| `connectTimeoutMS`         | 10000      |                                                                                                                      |
| `socketTimeoutMS`          | 45000      | Bounds a hung Atlas connection.                                                                                      |
| `maxIdleTimeMS`            | 60000      | Releases connections back to Atlas during quiet periods.                                                             |
| `appName`                  | `"erpsys"` | Makes the connection visible in Atlas.                                                                               |

A pool-exhaustion timeout is translated into a typed error that the error middleware renders as `503` with `Retry-After`, so a saturated pool produces backpressure rather than a pile-up.

### Boot-time validation

`lib/env.ts` gains an `assertProductionEnv()` alongside the existing `assertPublicOrigin()`. In production it fails the boot on: `DATABASE_URL` still at its localhost default; `BETTER_AUTH_SECRET` shorter than 32 characters; `NODE_ENV` not exactly `production`; and a `PORT` that failed to parse (today `lib/env.ts:15` only warns and falls back to 3001).

### Readiness

`/api/health` stays a static `200 {ok:true}` — that is correct for liveness. New `/api/ready` runs `db.command({ ping: 1 })` with a 2-second timeout and returns `503` on failure. Readiness also flips to false as soon as the graceful shutdown starts, so a draining instance stops receiving traffic before it stops accepting it.

`index.ts` awaits a Mongo ping and the Phase 1 index bootstrap before calling `listen()`, so a bad `DATABASE_URL` fails the deploy rather than the first student's request.

## Phase 1 — Queue correctness

_Alone fixes: the corruption. This is the highest-value phase and needs no infrastructure._

### Index bootstrap

New `lib/indexes.ts` exports `ensureIndexes()`, awaited at boot. It must be **idempotent** — safe to run on every deploy, and safe to run against a database that already has the indexes. Indexes are created in batched `createIndexes` calls, not one at a time.

`enrollment_queue`:

- `{ studentProfileId: 1, academicYearId: 1 }` — **unique**. Enforces one queue entry per student per year.
- `{ departmentId: 1, academicYearId: 1 }` — **unique**, `partialFilterExpression: { status: "IN_PROGRESS" }`. Enforces at most one student being served per department per year.
- `{ academicYearId: 1, status: 1, joinedAt: 1 }` — student-facing queue listings.
- `{ departmentId: 1, academicYearId: 1, status: 1, joinedAt: 1 }` — the FIFO gate and per-department counts.
- `{ servedById: 1, status: 1 }` — the stale-serving sweep.

`student_profile`: `{ studentNumber: 1 }` **unique**, plus `{ userId: 1 }` and `{ academicYearId: 1 }`.

`adviser_availability`: `{ academicYearId: 1, isOpen: 1 }`, `{ adviserId: 1, isOpen: 1 }`, and `{ isOpen: 1, lastActiveAt: 1 }` for the sweep.

`notification`: `{ userId: 1, createdAt: -1 }`. `step_verification`: `{ studentProfileId: 1, academicYearId: 1 }`. Plus the indexes Better Auth expects on `user`, `session`, and `account`.

The partial unique index is the elegant piece: it makes a **cross-document** invariant (one adviser per department) atomic using only single-document guarantees. Two advisers calling `beginServing` simultaneously now produce one success and one duplicate-key error, which the service catches and turns into the same `ALREADY_SERVING` conflict the code already raises at `instructor/enrollment.ts:195-198`. No schema change, no lock document, no transaction.

One precondition: Mongo requires every document matching a partial index's filter to carry the indexed key fields. Every `enrollment_queue` insert sets both `departmentId` and `academicYearId` (`student/queue.ts:112-119`, `instructor/queues.ts` queue transfers), so this holds — but `auditQueueInvariants()` must also flag any `IN_PROGRESS` row missing either field, because such a row would make the index build fail with a confusing error rather than a duplicate-key error.

### Preflight audit

The unique indexes will **reject writes that previously succeeded silently**. Creating them against a database containing violations fails. So `auditQueueInvariants()` runs first and reports:

- Duplicate `(studentProfileId, academicYearId)` groups in `enrollment_queue`.
- Departments with more than one `IN_PROGRESS` row for a year.
- Duplicate `studentNumber` values in `student_profile`.

It is **dry-run by default**. Index creation is refused with a clear, actionable error if violations remain. Sequencing is mandatory: **audit → repair → index**. A repair script is a separate, manually-invoked step that logs every change it makes.

### Join path

`services/student/queue.ts`:

- Delete the pre-check `findOne` at lines 53-63 and let the unique index be the sole arbiter. This removes a round trip _and_ the race.
- Narrow the `catch` at lines 120-124 to `error.code === 11000`. Today **any** insert failure — a network blip, a primary stepdown, a write-concern error — is reported to the student as "You already have a queue entry this year." That is a lie that sends students away when their join actually failed. Non-duplicate-key errors must surface as a 500.
- The `countDocuments` at lines 125-131 returns the **total** waiting count, not the caller's rank, and is then used verbatim in the notification body at line 137 as "position #N". The first student into a three-person queue is told "position #3". Replace with a real rank query, or relabel the field honestly.
- `leaveQueue` (lines 237-256) reads the status, then deletes by `_id` alone. An adviser calling `beginServing` in between wins nothing: the entry is deleted out from under them and they hold a serving slot for a student who has left. Fold the status guard into the `deleteOne` filter, check `deletedCount`, and return a clear result when it is zero.

`services/student-signup.ts` gets the same treatment for `studentNumber`: drop the pre-check at lines 177-180, narrow the catch at lines 92-104 to `code === 11000`.

### Serve path

`services/instructor/enrollment.ts` `beginServing`:

- Remove the racy pre-read at lines 180-199. Attempt the conditional update at lines 217-228 first, and catch `11000` from the partial index to produce the `ALREADY_SERVING` conflict. The existing `matchedCount === 0` branch at line 229 stays as the "someone else took this specific entry" path.
- Add `_id: 1` as a secondary sort key to every `{ joinedAt: 1 }` sort (line 207 and the `moveToEnd` count at ~line 352). `joinedAt` is millisecond-resolution, so concurrent `moveToEnd` calls and the manufactured `new Date(0)` in `revertEnrollment` can produce colliding sort keys and non-deterministic FIFO order.
- The same `_id` tiebreak is applied to the instructor queue read at `instructor/queues.ts:175`.

### Sweeps

`lib/instructor-helpers.ts` has two time-of-check/time-of-use bugs, both of which the sweeps then write through:

- `sweepStaleServing` (lines 176-198) filters its `updateOne` on `{ _id }` alone. A student completed between the read at line 166 and the write at line 177 is **reverted from `COMPLETED` back to `WAITING` while still marked enrolled** — the step verification written by `completeEnrollment` is not touched. Filter on `{ _id, status: "IN_PROGRESS" }` and check `matchedCount`; skip the action-log insert and the notification when it did not match.
- `sweepStaleAvailability` (lines 147-152) filters its `updateMany` on `{ _id: { $in } }` alone. A queue an adviser reopened in the interim gets closed again by the sweep. Filter on `{ _id: { $in }, isOpen: true, lastActiveAt: <cutoff> }` so the sweep only closes rows that are still stale.

**Move the sweeps off the read path.** They currently run on every request: `instructor/queues.ts:89` (the instructor's 15-second poll), `student/departments.ts:32`, and `student/share.ts:65`. So write load scales with client count, and N concurrent advisers race on the same `updateMany`. New `lib/sweeps.ts` runs each sweep on a single `setInterval` (60s, `unref()`'d, guarded by a re-entrancy flag) plus once at boot. The handlers call nothing.

The interval sweep becomes load-bearing: a stuck `IN_PROGRESS` row blocks its department via the new partial index until the sweep reclaims it. If the sweep stops working, departments wedge. It needs to be covered by the Phase 4 metrics.

### Other correctness

- `services/instructor/queues.ts:629-631` — fold the status guard into `removeFromQueue`'s `deleteOne` filter, as with `leaveQueue`.
- `getMyQueueStatus` (`services/student/queue.ts:206`) returns a **hardcoded `position: 1`**. Every student sees "1" and it never advances. Line 208 also hardcodes `servedByName: null`, so the student is never told who is serving them. Both must be resolved or the fields removed from the output schema.
- `setAvailability` closing a queue (`services/instructor/availability.ts:68-101`) fetches every waiting student, then runs a **sequential** `findOne` + `insertOne` per student, with an SSE write inline in the loop. 200 waiting students is ~400 round trips inside one request, and a crash midway leaves students **silently removed from the queue with no notification ever sent**. Replace with one `$in` profile lookup, one `insertMany` for notifications, and a batched publish.

## Phase 2 — Zero-downtime deploys

### Graceful shutdown

`index.ts:38` retains the `http.Server` from `app.listen` and sets `keepAliveTimeout`, `headersTimeout`, `requestTimeout`, and `maxConnections` explicitly. Today the handle is discarded, so none of these are even reachable.

New `lib/shutdown.ts` installs idempotent SIGTERM/SIGINT handlers with this order:

1. Flip readiness to `503` and wait a short drain delay, so the load balancer and Nginx stop sending new traffic.
2. `server.close()` — stop accepting new connections. Keep-alive sockets finish their current request.
3. Publish a `reconnect` topic to all SSE subscribers via a new `publishToAll()` in `lib/sse.ts`, so clients reconnect immediately instead of waiting out the `retry: 3000` interval.
4. `server.closeIdleConnections()`.
5. After `SHUTDOWN_GRACE_MS` (default 10s), force-close whatever remains.
6. `client.close()` via a new `closeDb()` in `lib/db.ts`.
7. `process.exit(0)`.

Step 1's drain delay is the difference between a clean deploy and a burst of 502s. It must be shorter than Nginx's `proxy_next_upstream` retry window.

### systemd

New `deploy/erpsys.service`: `ExecStart` runs node with an explicit `--max-old-space-size` so the heap ceiling is below the cgroup limit; `Restart=always` with `RestartSec=2`; `KillSignal=SIGTERM`; `TimeoutStopSec=30` (longer than the shutdown grace, so systemd never SIGKILLs a draining process); `Environment=NODE_ENV=production`; `EnvironmentFile=/etc/erpsys.env`; a non-root `User`; and `NoNewPrivileges` / `ProtectSystem=strict`.

### Nginx

New `deploy/nginx/erpsys.conf`:

- `proxy_http_version 1.1` with `proxy_set_header Connection ""` so SSE upgrades work.
- `proxy_read_timeout 3600s` on `/api/events` only; a short timeout elsewhere so a hung Mongo op is not held open forever.
- `limit_req_zone` keyed on `$binary_remote_addr`, with a tight zone on `/api/auth` and a generous one on `/rpc`.
- `client_max_body_size 8m` (above UploadThing's 4MB per-file limit, which streams past Express anyway).
- gzip and brotli for the SPA, so Node never does compression.
- `proxy_next_upstream error timeout http_502 http_503` to ride out a restart.
- `location = /api/ready` for health checking.

Nginx's `keepalive_timeout` and the app's `keepAliveTimeout` must be set consistently. Mismatched values produce intermittent 502s on reused connections — a well-known failure that looks like an application bug and is not.

### Runbook

New `docs/ops/deployment.md`, which `docs/README.md:7` already links to but which does not exist. Contents: prerequisites; Node version pin (currently unpinned anywhere in the repo); Atlas tier notes and IP allowlist; a table of every env var marking which are boot-fatal; first deploy; systemd and Nginx installation; the zero-downtime release procedure; rollback; the metrics endpoints; an incident runbook covering pool exhaustion, OOM, and wedged departments; and the load-test gate. The dead spec links at `docs/README.md:11-14,19` are left as they are — out of scope.

## Phase 3 — Load shedding

_Server-side only. Removes the O(N²) term in the read path._

### The read math

1000 visible student tabs at ~4 polls per 20 seconds is roughly **200 requests/second** at peak. `getDepartments` (`services/student/departments.ts:38-63`) currently fetches **every `WAITING` row in the institution** on each one, full documents, only to build a `Map<departmentId, count>` at lines 94-100. That is the term that has to go.

- `services/student/departments.ts:38-63` — replace the `waiting` fetch with a `$group` aggregation by `departmentId` returning only `{ _id, count }`. Add projections to the other three queries. Keep the `Promise.all`.
- `services/student/share.ts:68-88` — same treatment, scoped to one department.
- `services/instructor/queues.ts:124-262` — add projections to the `profiles`, `verifiedRows`, and `yearRows` `$in` batches, and a `.limit()` on the queue read. This runs every 15 seconds per adviser and currently issues ~12 unbounded queries plus two write sweeps.
- `services/student/queue.ts:185-200` — collapse the four sequential finds. The `deptOpen` boolean needs one availability row, not full arrays.
- `services/admin/report.ts:71` — move `REPORT_ROW_CAP` into the query's `.limit()`, the way `services/officer/report.ts:100` already does correctly, so 1000 rows are never materialized in the heap. The current code caps an already-fetched array.

### ReDoS

`services/instructor/queues.ts:433`, `services/admin/passwords.ts:111,117,118`, and `services/admin/report.ts:130` interpolate raw user input into `$regex`. `instructor/queues.ts` caps at `.limit(500)` but runs three such queries in parallel; `$options: "i"` also cannot use a plain index, so each is a collection scan. Wrap all of them in the existing `escapeQueryRegex` (`services/officer/list-query.ts:79-82`), which is already used correctly elsewhere in the codebase. A pattern like `(a+)+$` is a cheap denial-of-service.

### Rate limiting

New `lib/rate-limit.ts` generalises the sliding-window limiter currently inlined at `routes/chat.ts:28-50`, keeping its 10,000-key sweep. Mounted on:

- `/api/auth/*` — tight, per-IP, on the sign-in and sign-up paths. This closes a real hole: `lib/auth.ts:81` skips Turnstile entirely when `TURNSTILE_SECRET_KEY` is empty, which means **an empty secret leaves sign-in and sign-up with no rate limit of any kind** — no IP throttle, no lockout, no failed-attempt counter.
- `/rpc` — generous, per-user, so a runaway client or tab storm is bounded without affecting normal use.

Both return `429` with `Retry-After`.

### Duplicate polling

`apps/web/src/components/ui/NotificationCenter.svelte:25` polls `notifications.listMine` every 20 seconds, and both `apps/web/src/lib/student/state.svelte.ts:52` and `apps/web/src/lib/instructor/state.svelte.ts:129` poll the same key on the same interval. TanStack Query dedupes only _in-flight_ requests, not sequential ones, so every student and instructor page fires two identical RPCs per tick. Remove the component-level poll and keep the state-store one.

**This is the only web-app change in Phase 3**, and it removes a duplicate rather than altering behaviour.

### Deliberately deferred

Students have no SSE stream at all — only instructors subscribe (`lib/instructor/state.svelte.ts:203`) — so they poll 20 times a minute by tab. Extending SSE to students would cut request volume substantially. Not in this spec: it is new realtime behaviour on the student-facing UI, and Phase 4 gives us the numbers to decide with evidence. Same for backing off the poll intervals themselves.

## Phase 4 — Observability and the load gate

### Metrics

New `lib/metrics.ts` collects event-loop delay (`perf_hooks.monitorEventLoopDelay`), heap usage (`process.memoryUsage()`), a rolling per-route request count and duration histogram, and Mongo pool saturation. Exposed at `/api/metrics` in Prometheus text format, bound to loopback or gated by an env token. A `subscriberCount` helper already exists in `lib/sse.ts:55` and is used for the live-connection gauge.

### Request logging

A logging middleware on `res.on("finish")` recording method, path, status, duration, and request id. Structured single-line JSON in production, replacing the seven bare `console.*` call sites. Cookies and authorization headers are redacted — note that `lib/auth.ts:42` currently writes password-reset tokens to stdout, which this should stop doing.

### Load test

New `pnpm test:load` running a k6 or autocannon scenario: 500 concurrent distinct students against `joinQueue`, `getDepartments`, and `getMyQueueStatus`. Assertions:

- Zero unhandled 5xx.
- p95 latency under a budget that is **set at the end of Phase 3**, from the before/after numbers recorded there, and then written into the runbook. It is deliberately not fixed in this spec, because a number chosen now would be a guess dressed up as a target.
- Zero duplicate `(studentProfileId, academicYearId)` pairs.
- At most one `IN_PROGRESS` row per department.
- Heap stays below the `--max-old-space-size` ceiling.

### CI

There is no `.github/` directory. Add a minimal workflow running `pnpm check` and `pnpm test`, per the commands in `AGENTS.md`. `test:load` is a manual or nightly gate, not a PR blocker, since it needs a seeded database.

## Testing strategy

`pnpm check` and `pnpm test` after every phase, per `AGENTS.md`.

| Phase | Test                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | A rejected promise inside a handler produces a 500 JSON body, not a process exit. `/api/ready` returns 503 when the ping fails. A pool-exhaustion timeout maps to 503 with `Retry-After`.                                                                                                                                                                                                         |
| 1     | `ensureIndexes()` is idempotent across two runs. `auditQueueInvariants()` detects seeded violations. **N parallel `joinQueue` calls for one student yield exactly 1 success and N−1 `CONFLICT`. N parallel `beginServing` calls on one department yield exactly 1 success.** These concurrency tests are the proof that the indexes work and must use real concurrent calls, not sequential ones. |
| 2     | `SIGTERM` under k6 load: in-flight requests complete, exit code is 0, `/api/ready` flips to 503 before the socket closes, and SSE clients reconnect.                                                                                                                                                                                                                                              |
| 3     | `test:load` before/after numbers recorded in the runbook. `escapeQueryRegex` applied to all three `$regex` sites (unit).                                                                                                                                                                                                                                                                          |
| 4     | `/api/metrics` returns valid Prometheus text. The load gate is the regression net for everything above.                                                                                                                                                                                                                                                                                           |

## Out of scope

Named explicitly so it is not re-litigated mid-implementation:

- **Clustering, horizontal scale, Redis.** Blocked by in-process SSE and in-process rate limiters. Revisit above ~2000 concurrent.
- **MongoDB transactions and multi-document rollback.** `bulkRevertEnrollments` (`services/instructor/enrollment.ts:783-864`) still does ~350 sequential round trips over up to 50 students with no atomicity, so a mid-loop failure leaves half the batch reverted. A real bug, but a different project.
- **Express → Fastify migration**, in-process compression (Nginx does it), CORS and helmet middleware (same-origin; Nginx can set headers). Note `cors` is currently a dead dependency.
- **The UploadThing orphan-file leak.** `onUploadComplete` is a no-op on all three routes (`lib/uploadthing.ts:34,37,40`), so a client that uploads then crashes leaves a file no `upload` document references and no sweeper can see. Real, but unrelated to crashing under load. Log it in `docs/specs/open-requests.md`.
- **The dead spec links** at `docs/README.md:11-14,19`.

## Risks and mitigations

| Risk                                                                                            | Mitigation                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createIndex` on large collections takes time and holds locks.                                  | Run before enrollment opens. Use batched `createIndexes`. Build the indexes once against production-sized data before enrollment day, not during.      |
| The unique indexes reject writes that previously succeeded.                                     | Mandatory **audit → repair → index** sequencing. Dry-run the audit first. A duplicate `studentNumber` in existing data will hard-fail the index build. |
| The partial unique index means a stuck `IN_PROGRESS` row blocks its department until reclaimed. | This is correct behaviour — it is the invariant working. But it makes the interval sweep load-bearing, so the sweep's success must be monitored.       |
| `--max-old-space-size` and `MemoryMax` values are estimates.                                    | Tune from Phase 4 metrics after real load, not before.                                                                                                 |
| A stuck `IN_PROGRESS` row also means a student sees a permanently "busy" department.            | The runbook needs an operator procedure for reclaiming one by hand.                                                                                    |
| Nginx and app keepalive timeouts can silently disagree.                                         | Set both in the same runbook section and test a real deploy under load.                                                                                |

## Rollout

Each phase is independently shippable. Phases 0 and 1 are the ones that matter most: 0 stops the crash, 1 stops the corruption.

| Phase | Ships                                                                                              | Alone fixes        |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------ |
| 0     | Guards, error middleware, pool options, boot validation, `/api/ready`                              | The crash          |
| 1     | Index bootstrap, preflight audit, both unique constraints, sweep filters, sweeps off the read path | The corruption     |
| 2     | Graceful shutdown, systemd, Nginx, `docs/ops/deployment.md`                                        | The dropped deploy |
| 3     | `$group` counts, limits and projections, global rate limit, poll de-dup, ReDoS fixes               | The overload       |
| 4     | Metrics, request logging, load-test gate, CI                                                       | Seeing it coming   |

Phase 1 is the only phase requiring a maintenance window and a data audit. Phases 0 and 2-4 are rolling deploys.

## Planning

**This spec is one document but five implementation plans.** The phases are sequenced, not coupled, and each carries its own risk profile and verification story — Phase 1 needs a maintenance window and a data audit, the rest do not. Write the plan per phase, in numeric order, and do not batch them into a single plan: a single plan across all five would put the highest-risk work (the index migration) in the same review and rollback boundary as the lowest (the poll de-dup).

Start with **Phase 0**, then **Phase 1**. Phases 2-4 can be planned when their predecessor has shipped, which keeps the design honest against real numbers.
